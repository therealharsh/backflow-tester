#!/usr/bin/env python3
"""
Step 1: Google Maps scraper using Outscraper API.

Scrapes Google Maps listings for backflow-related keywords across US cities with:
- Batching and rate limiting
- Exponential backoff retries
- Checkpointing for resume capability
- Skips businesses already in Supabase (saves API credits)
- Detailed logging
- Progress tracking

Usage:
    python crawler/01_outscrape.py --cities crawler/data/target_cities.csv --head 3
    python crawler/01_outscrape.py --cities crawler/data/target_cities.csv --resume
    python crawler/01_outscrape.py --tier 1   # only tier-1 cities
"""

import argparse
import json
import logging
import os
import signal
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Set

import pandas as pd
from dotenv import load_dotenv
from outscraper import ApiClient
from tqdm import tqdm


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
KEYWORDS = [
    "backflow testing",
    "backflow tester",
    "rpz valves",
    "plumbing backflow",
    "backflow preventer",
    "cross connection control",
    "backflow repair",
]

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_CSV = DATA_DIR / "raw_places.csv"
CHECKPOINT_FILE = DATA_DIR / "run_state.json"
LOG_FILE = DATA_DIR / "crawler.log"

BATCH_TIMEOUT_SECONDS = 120


class BatchTimeoutError(Exception):
    pass


def timeout_handler(signum, frame):
    raise BatchTimeoutError("Batch operation timed out")


# ---------------------------------------------------------------------------
# Logging / checkpoint
# ---------------------------------------------------------------------------
def setup_logging():
    DATA_DIR.mkdir(exist_ok=True)

    logger = logging.getLogger("01_outscrape")
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return logger

    fh = logging.FileHandler(LOG_FILE)
    fh.setLevel(logging.INFO)
    fmt = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )
    fh.setFormatter(fmt)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter('%(levelname)s: %(message)s'))

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


def load_checkpoint() -> Dict[str, Any]:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, 'r') as f:
            return json.load(f)
    return {"next_query_index": 0, "completed_batches": []}


def save_checkpoint(next_query_index: int, completed_batches: List[int]):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump({
            "next_query_index": next_query_index,
            "completed_batches": completed_batches,
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
        }, f, indent=2)


# ---------------------------------------------------------------------------
# Supabase lookup — fetch existing place_ids to avoid re-scraping
# ---------------------------------------------------------------------------
def fetch_existing_place_ids(logger: logging.Logger) -> Set[str]:
    """Query Supabase for all existing provider place_ids."""
    try:
        from supabase import create_client

        # Also check NEXT_PUBLIC_SUPABASE_URL as fallback
        url = os.environ.get("SUPABASE_URL", "") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            logger.warning(
                "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — "
                "cannot skip existing providers"
            )
            return set()

        client = create_client(url, key)

        place_ids: Set[str] = set()
        page_size = 1000
        offset = 0

        while True:
            resp = (
                client.table("providers")
                .select("place_id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for r in rows:
                pid = r.get("place_id")
                if pid:
                    place_ids.add(str(pid))
            if len(rows) < page_size:
                break
            offset += page_size

        logger.info(f"Loaded {len(place_ids):,} existing place_ids from Supabase")
        return place_ids

    except ImportError:
        logger.warning("supabase package not installed — cannot skip existing providers")
        return set()
    except Exception as exc:
        logger.warning(f"Failed to query Supabase for existing providers: {exc}")
        return set()


# ---------------------------------------------------------------------------
# City / query helpers
# ---------------------------------------------------------------------------
def load_cities(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    if 'state_code' in df.columns and 'state' not in df.columns:
        df = df.rename(columns={'state_code': 'state'})
    if 'city' not in df.columns or 'state' not in df.columns:
        raise ValueError(
            f"CSV must have 'city' and 'state' columns. Found: {list(df.columns)}"
        )
    return df


def build_queries(cities_df: pd.DataFrame, keywords: List[str]) -> List[str]:
    queries = []
    for _, row in cities_df.iterrows():
        city = row['city']
        state = row['state']
        for kw in keywords:
            queries.append(f"{kw} {city} {state} USA")
    return queries


# ---------------------------------------------------------------------------
# Outscraper helpers
# ---------------------------------------------------------------------------
def normalize_results(raw_results: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    if not raw_results:
        return normalized
    if isinstance(raw_results, list):
        for item in raw_results:
            if isinstance(item, list):
                for place in item:
                    if isinstance(place, dict):
                        normalized.append(place)
            elif isinstance(item, dict):
                normalized.append(item)
    return normalized


def scrape_batch_with_retry(
    client: ApiClient,
    queries: List[str],
    limit: int,
    max_retries: int,
    logger: logging.Logger,
) -> List[Dict[str, Any]]:
    for attempt in range(max_retries):
        try:
            if sys.platform == 'darwin':
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(BATCH_TIMEOUT_SECONDS)

            try:
                if hasattr(client, 'google_maps_search_v2'):
                    results = client.google_maps_search_v2(
                        queries, limit=limit, language='en', region='US',
                    )
                elif hasattr(client, 'google_maps_search'):
                    results = client.google_maps_search(
                        queries, limit=limit, language='en', region='US',
                    )
                else:
                    raise AttributeError(
                        "Outscraper client has neither google_maps_search_v2 "
                        "nor google_maps_search method"
                    )

                if sys.platform == 'darwin':
                    signal.alarm(0)

                return normalize_results(results)

            except BatchTimeoutError:
                logger.warning(
                    f"Batch timed out after {BATCH_TIMEOUT_SECONDS}s "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                if attempt < max_retries - 1:
                    backoff = 2 ** attempt
                    logger.info(f"Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue
                else:
                    raise

            finally:
                if sys.platform == 'darwin':
                    signal.alarm(0)

        except Exception as e:
            logger.error(f"Error on attempt {attempt + 1}/{max_retries}: {e}")
            if attempt < max_retries - 1:
                backoff = 2 ** attempt
                logger.info(f"Retrying in {backoff}s...")
                time.sleep(backoff)
            else:
                logger.error(f"Failed after {max_retries} attempts")
                raise

    return []


# ---------------------------------------------------------------------------
# CSV writer (append-safe)
# ---------------------------------------------------------------------------
def append_to_csv(results: List[Dict[str, Any]], output_path: Path):
    if not results:
        return

    new_df = pd.DataFrame(results)

    if not output_path.exists():
        new_df.to_csv(output_path, mode='w', header=True, index=False)
        return

    existing_cols = pd.read_csv(output_path, nrows=0).columns.tolist()
    for col in new_df.columns:
        if col not in existing_cols:
            existing_cols.append(col)

    new_df = new_df.reindex(columns=existing_cols)

    header_grew = len(existing_cols) > len(
        pd.read_csv(output_path, nrows=0).columns
    )
    if header_grew:
        existing_df = pd.read_csv(output_path, low_memory=False)
        existing_df = existing_df.reindex(columns=existing_cols)
        existing_df.to_csv(output_path, mode='w', header=True, index=False)

    new_df.to_csv(output_path, mode='a', header=False, index=False)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description='Step 1: Scrape Google Maps listings using Outscraper',
    )
    parser.add_argument(
        '--cities',
        default=str(DATA_DIR / "target_cities.csv"),
        help='Path to cities CSV (default: crawler/data/target_cities.csv)',
    )
    parser.add_argument(
        '--limit', type=int, default=50,
        help='Max results per query (default: 50)',
    )
    parser.add_argument(
        '--batch-size', type=int, default=10,
        help='Number of queries per Outscraper batch (default: 10)',
    )
    parser.add_argument(
        '--sleep', type=float, default=0.5,
        help='Sleep between batches in seconds (default: 0.5)',
    )
    parser.add_argument(
        '--head', type=int, default=0,
        help='Only scrape first N cities (default: 0 = all)',
    )
    parser.add_argument(
        '--resume', action='store_true',
        help='Resume from checkpoint',
    )
    parser.add_argument(
        '--max-retries', type=int, default=5,
        help='Max retry attempts per batch (default: 5)',
    )
    parser.add_argument(
        '--tier', type=int, default=0,
        help='Only scrape cities with this priority tier (0 = all)',
    )
    parser.add_argument(
        '--no-skip-existing', action='store_true',
        help='Do NOT skip businesses already in Supabase (re-scrape everything)',
    )

    args = parser.parse_args()

    # Setup
    logger = setup_logging()
    _root = Path(__file__).resolve().parent.parent
    load_dotenv(_root / ".env")
    load_dotenv(_root / "web" / ".env.local")

    api_key = os.getenv('OUTSCRAPER_API_KEY')
    if not api_key:
        logger.error("OUTSCRAPER_API_KEY not found in environment")
        sys.exit(1)

    client = ApiClient(api_key=api_key)

    # Load existing place_ids from Supabase so we can skip duplicates
    existing_ids: Set[str] = set()
    if not args.no_skip_existing:
        existing_ids = fetch_existing_place_ids(logger)

    # Load cities
    logger.info(f"Loading cities from {args.cities}")
    cities_df = load_cities(args.cities)

    if args.tier > 0 and 'priority_tier' in cities_df.columns:
        cities_df = cities_df[cities_df['priority_tier'] == args.tier]
        logger.info(f"Filtered to tier {args.tier}: {len(cities_df)} cities")

    if args.head > 0:
        logger.info(f"Limiting to first {args.head} cities")
        cities_df = cities_df.head(args.head)

    # Build queries
    queries = build_queries(cities_df, KEYWORDS)
    total_queries = len(queries)

    logger.info("=" * 70)
    logger.info("OUTSCRAPER SCRAPER START")
    logger.info("=" * 70)
    logger.info(f"Total cities: {len(cities_df)}")
    logger.info(f"Total keywords: {len(KEYWORDS)}")
    logger.info(f"Total queries: {total_queries}")
    logger.info(f"Batch size: {args.batch_size}")
    logger.info(f"Limit per query: {args.limit}")
    logger.info(f"Sleep between batches: {args.sleep}s")
    logger.info(f"Max retries: {args.max_retries}")
    logger.info(f"Existing providers in DB: {len(existing_ids):,}")
    logger.info(f"Skip existing: {not args.no_skip_existing}")
    logger.info("=" * 70)

    # Checkpoint
    start_index = 0
    completed_batches: List[int] = []

    if args.resume:
        checkpoint = load_checkpoint()
        start_index = checkpoint.get("next_query_index", 0)
        completed_batches = checkpoint.get("completed_batches", [])
        logger.info(f"Resuming from query index {start_index}")

    # Build batches
    batches = []
    for i in range(start_index, total_queries, args.batch_size):
        batch = queries[i:i + args.batch_size]
        batches.append((i, batch))

    # Process
    total_results = 0
    total_new = 0
    total_skipped = 0

    with tqdm(total=len(batches), desc="Processing batches") as pbar:
        for batch_start, batch_queries in batches:
            sample = batch_queries[:3]
            logger.info(f"\nBatch starting at index {batch_start}")
            logger.info(f"Sample queries: {sample}")

            t0 = time.time()

            try:
                results = scrape_batch_with_retry(
                    client=client,
                    queries=batch_queries,
                    limit=args.limit,
                    max_retries=args.max_retries,
                    logger=logger,
                )

                elapsed = time.time() - t0

                # Filter out businesses already in Supabase
                if existing_ids:
                    new_results = []
                    for r in results:
                        pid = r.get('place_id', '') or r.get('google_id', '')
                        if str(pid) in existing_ids:
                            total_skipped += 1
                        else:
                            new_results.append(r)
                            # Add to existing set so we don't duplicate
                            # across batches within this run
                            if pid:
                                existing_ids.add(str(pid))
                else:
                    new_results = results

                append_to_csv(new_results, OUTPUT_CSV)

                total_results += len(results)
                total_new += len(new_results)
                completed_batches.append(batch_start)

                next_index = batch_start + len(batch_queries)
                save_checkpoint(next_index, completed_batches)

                logger.info(
                    f"Batch completed: {len(results)} results "
                    f"({len(new_results)} new, "
                    f"{len(results) - len(new_results)} already in DB) "
                    f"in {elapsed:.2f}s"
                )

            except Exception as e:
                save_checkpoint(batch_start, completed_batches)
                logger.error(f"Batch failed: {e}")
                logger.error(f"Checkpoint saved at query index {batch_start}")
                logger.error("Resume with --resume to continue")
                raise

            pbar.update(1)

            if args.sleep > 0:
                time.sleep(args.sleep)

    # Summary
    logger.info("=" * 70)
    logger.info("SCRAPER COMPLETE")
    logger.info("=" * 70)
    logger.info(f"Total results from Outscraper: {total_results:,}")
    logger.info(f"New (written to CSV):          {total_new:,}")
    logger.info(f"Skipped (already in DB):       {total_skipped:,}")
    logger.info(f"Output file: {OUTPUT_CSV}")
    logger.info(f"Log file: {LOG_FILE}")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
