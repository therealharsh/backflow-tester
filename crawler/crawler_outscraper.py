#!/usr/bin/env python3
"""
Production-grade Google Maps scraper using Outscraper API.

Scrapes Google Maps listings for specified keywords across US cities with:
- Batching and rate limiting
- Exponential backoff retries
- Checkpointing for resume capability
- Detailed logging
- Progress tracking
"""

import argparse
import json
import logging
import os
import signal
import sys
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

import pandas as pd
from dotenv import load_dotenv
from outscraper import ApiClient
from tqdm import tqdm


# Constants
KEYWORDS = [
    "backflow testing",
    "backflow preventer",
    "rpz testing",
    "cross connection control",
    "backflow repair",
]

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_CSV = DATA_DIR / "raw_places.csv"
CHECKPOINT_FILE = DATA_DIR / "run_state.json"
LOG_FILE = DATA_DIR / "crawler.log"

# Timeout for batch operations (macOS compatible)
BATCH_TIMEOUT_SECONDS = 120


class TimeoutError(Exception):
    """Raised when batch operation times out."""
    pass


def timeout_handler(signum, frame):
    """Signal handler for timeout."""
    raise TimeoutError("Batch operation timed out")


def setup_logging():
    """Configure logging to both file and console."""
    DATA_DIR.mkdir(exist_ok=True)

    # Create logger
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)

    # File handler
    file_handler = logging.FileHandler(LOG_FILE)
    file_handler.setLevel(logging.INFO)
    file_formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_formatter)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter('%(levelname)s: %(message)s')
    console_handler.setFormatter(console_formatter)

    # Add handlers
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


def load_checkpoint() -> Dict[str, Any]:
    """Load checkpoint from disk if it exists."""
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, 'r') as f:
            return json.load(f)
    return {"next_query_index": 0, "completed_batches": []}


def save_checkpoint(next_query_index: int, completed_batches: List[int]):
    """Save checkpoint to disk."""
    checkpoint = {
        "next_query_index": next_query_index,
        "completed_batches": completed_batches,
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
    }
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint, f, indent=2)


def build_queries(cities_df: pd.DataFrame) -> List[str]:
    """Build all search queries from cities and keywords."""
    queries = []
    for _, row in cities_df.iterrows():
        city = row['city']
        state = row['state']
        for keyword in KEYWORDS:
            query = f"{keyword} {city} {state} USA"
            queries.append(query)
    return queries


def normalize_results(raw_results: Any) -> List[Dict[str, Any]]:
    """
    Normalize Outscraper results into flat list of dicts.

    Handles different result formats from different SDK versions.
    """
    normalized = []

    # Handle None or empty results
    if not raw_results:
        return normalized

    # Results can be a list of lists or just a list
    if isinstance(raw_results, list):
        for item in raw_results:
            if isinstance(item, list):
                # Nested list - flatten it
                for place in item:
                    if isinstance(place, dict):
                        normalized.append(place)
            elif isinstance(item, dict):
                # Direct dict
                normalized.append(item)

    return normalized


def scrape_batch_with_retry(
    client: ApiClient,
    queries: List[str],
    limit: int,
    max_retries: int,
    logger: logging.Logger
) -> List[Dict[str, Any]]:
    """
    Scrape a batch of queries with exponential backoff retry logic.

    Args:
        client: Outscraper API client
        queries: List of search queries
        limit: Max results per query
        max_retries: Maximum number of retry attempts
        logger: Logger instance

    Returns:
        List of normalized place dictionaries
    """
    for attempt in range(max_retries):
        try:
            # Set up timeout signal (macOS compatible)
            if sys.platform == 'darwin':
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(BATCH_TIMEOUT_SECONDS)

            try:
                # Try v2 method first (newer SDK versions)
                if hasattr(client, 'google_maps_search_v2'):
                    results = client.google_maps_search_v2(
                        queries,
                        limit=limit,
                        language='en',
                        region='US'
                    )
                # Fall back to v1 method
                elif hasattr(client, 'google_maps_search'):
                    results = client.google_maps_search(
                        queries,
                        limit=limit,
                        language='en',
                        region='US'
                    )
                else:
                    raise AttributeError(
                        "Outscraper client has neither google_maps_search_v2 "
                        "nor google_maps_search method"
                    )

                # Cancel timeout if successful
                if sys.platform == 'darwin':
                    signal.alarm(0)

                # Normalize and return results
                return normalize_results(results)

            except TimeoutError:
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
                # Always cancel the alarm
                if sys.platform == 'darwin':
                    signal.alarm(0)

        except Exception as e:
            logger.error(
                f"Error on attempt {attempt + 1}/{max_retries}: {str(e)}"
            )

            if attempt < max_retries - 1:
                backoff = 2 ** attempt
                logger.info(f"Retrying in {backoff}s...")
                time.sleep(backoff)
            else:
                logger.error(f"Failed after {max_retries} attempts")
                raise

    return []


def append_to_csv(results: List[Dict[str, Any]], output_path: Path):
    """
    Append results to CSV file, creating it if it doesn't exist.

    Aligns columns to the existing file's header on every append so that
    batches with slightly different key sets never silently drop data or
    create misaligned rows.
    """
    if not results:
        return

    new_df = pd.DataFrame(results)

    if not output_path.exists():
        # First write — establish the canonical column order
        new_df.to_csv(output_path, mode='w', header=True, index=False)
        return

    # Read just the header of the existing file (zero rows)
    existing_cols = pd.read_csv(output_path, nrows=0).columns.tolist()

    # Add any new columns that didn't exist before (append them to the right)
    for col in new_df.columns:
        if col not in existing_cols:
            existing_cols.append(col)

    # Reindex both sides to the union of all columns, filling gaps with empty
    new_df = new_df.reindex(columns=existing_cols)

    # Rewrite header if we gained new columns this batch
    header_grew = len(existing_cols) > len(pd.read_csv(output_path, nrows=0).columns)
    if header_grew:
        existing_df = pd.read_csv(output_path, low_memory=False)
        existing_df = existing_df.reindex(columns=existing_cols)
        existing_df.to_csv(output_path, mode='w', header=True, index=False)

    new_df.to_csv(output_path, mode='a', header=False, index=False)


def main():
    """Main scraper execution."""
    parser = argparse.ArgumentParser(
        description='Scrape Google Maps listings using Outscraper'
    )
    parser.add_argument(
        '--cities',
        required=True,
        help='Path to cities CSV file'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=50,
        help='Max results per query (default: 50)'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=10,
        help='Number of queries per batch (default: 10)'
    )
    parser.add_argument(
        '--sleep',
        type=float,
        default=0.5,
        help='Sleep time between batches in seconds (default: 0.5)'
    )
    parser.add_argument(
        '--head',
        type=int,
        default=0,
        help='Only scrape first N cities for testing (default: 0, all cities)'
    )
    parser.add_argument(
        '--resume',
        action='store_true',
        help='Resume from checkpoint'
    )
    parser.add_argument(
        '--max-retries',
        type=int,
        default=5,
        help='Maximum retry attempts per batch (default: 5)'
    )

    args = parser.parse_args()

    # Setup
    logger = setup_logging()
    load_dotenv()

    api_key = os.getenv('OUTSCRAPER_API_KEY')
    if not api_key:
        logger.error("OUTSCRAPER_API_KEY not found in environment")
        sys.exit(1)

    # Initialize Outscraper client
    client = ApiClient(api_key=api_key)

    # Load cities
    logger.info(f"Loading cities from {args.cities}")
    cities_df = pd.read_csv(args.cities)

    if args.head > 0:
        logger.info(f"Limiting to first {args.head} cities")
        cities_df = cities_df.head(args.head)

    # Build queries
    queries = build_queries(cities_df)
    total_queries = len(queries)

    logger.info("=" * 70)
    logger.info("SCRAPER START")
    logger.info("=" * 70)
    logger.info(f"Total cities: {len(cities_df)}")
    logger.info(f"Total keywords: {len(KEYWORDS)}")
    logger.info(f"Total queries: {total_queries}")
    logger.info(f"Batch size: {args.batch_size}")
    logger.info(f"Limit per query: {args.limit}")
    logger.info(f"Sleep between batches: {args.sleep}s")
    logger.info(f"Max retries: {args.max_retries}")
    logger.info("=" * 70)

    # Load checkpoint if resuming
    start_index = 0
    completed_batches = []

    if args.resume:
        checkpoint = load_checkpoint()
        start_index = checkpoint.get("next_query_index", 0)
        completed_batches = checkpoint.get("completed_batches", [])
        logger.info(f"Resuming from query index {start_index}")

    # Create batches
    batches = []
    for i in range(start_index, total_queries, args.batch_size):
        batch = queries[i:i + args.batch_size]
        batches.append((i, batch))

    # Process batches
    total_results = 0

    with tqdm(total=len(batches), desc="Processing batches") as pbar:
        for batch_start, batch_queries in batches:
            # Log batch start
            sample_queries = batch_queries[:3]
            logger.info(f"\nBatch starting at index {batch_start}")
            logger.info(f"Sample queries: {sample_queries}")

            # Scrape batch
            batch_start_time = time.time()

            try:
                results = scrape_batch_with_retry(
                    client=client,
                    queries=batch_queries,
                    limit=args.limit,
                    max_retries=args.max_retries,
                    logger=logger
                )

                batch_elapsed = time.time() - batch_start_time

                # Append to CSV
                append_to_csv(results, OUTPUT_CSV)

                # Update counters
                num_results = len(results)
                total_results += num_results
                completed_batches.append(batch_start)

                # Save checkpoint
                next_index = batch_start + len(batch_queries)
                save_checkpoint(next_index, completed_batches)

                # Log success
                logger.info(
                    f"Batch completed: {num_results} results in "
                    f"{batch_elapsed:.2f}s"
                )
                logger.info(f"Checkpoint saved at query index {next_index}")

            except Exception as e:
                # Save checkpoint at current position so we can resume
                save_checkpoint(batch_start, completed_batches)
                logger.error(f"Batch failed: {str(e)}")
                logger.error(f"Checkpoint saved at query index {batch_start}")
                logger.error("Resume with: --resume flag to continue from this point")
                raise

            # Update progress bar
            pbar.update(1)

            # Sleep between batches
            if args.sleep > 0:
                time.sleep(args.sleep)

    # Summary
    logger.info("=" * 70)
    logger.info("SCRAPER COMPLETE")
    logger.info("=" * 70)
    logger.info(f"Total results scraped: {total_results}")
    logger.info(f"Output file: {OUTPUT_CSV}")
    logger.info(f"Log file: {LOG_FILE}")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
