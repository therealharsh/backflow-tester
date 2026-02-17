#!/usr/bin/env python3
"""
Enrich provider_reviews table using Outscraper Reviews API.

For each provider with a place_id:
  - Fetch up to 30 reviews (most_relevant) from Outscraper
  - Filter for non-empty, substantive texts (≥ 50 chars, rating ≥ 4)
  - Select best 3–4 reviews
  - Upsert into provider_reviews table
  - Update providers.top_review_excerpt with the best excerpt

Usage:
    python scripts/enrich/enrich_reviews_outscraper.py
    python scripts/enrich/enrich_reviews_outscraper.py --limit 50      # first N providers
    python scripts/enrich/enrich_reviews_outscraper.py --resume        # skip already-done
    python scripts/enrich/enrich_reviews_outscraper.py --place-id ChIJ...  # single provider

Requirements (add to .env):
    OUTSCRAPER_API_KEY=...
    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────

ROOT         = Path(__file__).parent.parent.parent
RAW_DIR      = ROOT / "data" / "reviews_raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

OUTSCRAPER_KEY  = os.environ.get("OUTSCRAPER_API_KEY", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

REVIEWS_PER_PROVIDER = 4       # how many to keep
OUTSCRAPER_LIMIT     = 30      # how many to fetch
MIN_TEXT_LEN         = 50      # chars
MIN_RATING_PREFERRED = 4       # prefer ≥ 4 stars
MIN_RATING_FALLBACK  = 3       # accept 3+ if not enough good ones
CONCURRENCY          = 5       # concurrent Outscraper calls
RATE_LIMIT_SLEEP     = 1.0     # seconds between batches
RETRY_DELAYS         = [5, 15, 30]  # seconds on 429 / 5xx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def make_initials(name: str) -> str:
    """Turn 'John Doe' → 'J.D.' — never stores full names."""
    parts = re.split(r"[\s._]+", name.strip())
    parts = [p for p in parts if p and p[0].isalpha()]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][0].upper() + "."
    return parts[0][0].upper() + "." + parts[-1][0].upper() + "."


def clean_text(text: str) -> str:
    """Normalise whitespace and remove emoji-heavy prefixes."""
    text = re.sub(r"\s+", " ", text).strip()
    return text


def make_excerpt(text: str, max_len: int = 200) -> str:
    """Truncate to max_len at a word boundary."""
    text = clean_text(text)
    if len(text) <= max_len:
        return text
    truncated = text[:max_len].rsplit(" ", 1)[0]
    return truncated.rstrip(".,;:") + "…"


def dedupe_reviews(reviews: list[dict]) -> list[dict]:
    """Remove near-duplicate texts (first 80 chars overlap)."""
    seen: set[str] = set()
    result = []
    for r in reviews:
        key = clean_text(r.get("review_text", ""))[:80].lower()
        if key and key not in seen:
            seen.add(key)
            result.append(r)
    return result


def select_best_reviews(raw_reviews: list[dict], target: int = REVIEWS_PER_PROVIDER) -> list[dict]:
    """
    Filter and rank reviews:
    1. Non-empty text ≥ MIN_TEXT_LEN
    2. Prefer rating ≥ 4; fall back to 3+ if needed
    3. Prefer longer texts (more informative)
    4. Deduplicate
    Returns up to `target` reviews.
    """
    def _has_text(r: dict) -> bool:
        return bool(r.get("review_text", "").strip())

    def _text_len(r: dict) -> int:
        return len(r.get("review_text", ""))

    candidates = [r for r in raw_reviews if _has_text(r) and _text_len(r) >= MIN_TEXT_LEN]
    candidates = dedupe_reviews(candidates)

    preferred = [r for r in candidates if (r.get("review_rating") or 0) >= MIN_RATING_PREFERRED]
    fallback   = [r for r in candidates if (r.get("review_rating") or 0) >= MIN_RATING_FALLBACK
                  and r not in preferred]

    # Sort each bucket by text length DESC (longer = more informative)
    preferred.sort(key=_text_len, reverse=True)
    fallback.sort(key=_text_len, reverse=True)

    selected = (preferred + fallback)[:target]
    return selected


async def fetch_reviews_outscraper(
    http: httpx.AsyncClient,
    place_id: str,
) -> list[dict]:
    """Call Outscraper reviews-v2 endpoint; handles retries on 429/5xx."""
    url = "https://api.app.outscraper.com/maps/reviews-v2"
    params = {
        "query": place_id,
        "reviewsLimit": OUTSCRAPER_LIMIT,
        "sort": "most_relevant",
        "ignoreEmpty": "true",
        "async": "false",
    }
    headers = {"X-API-KEY": OUTSCRAPER_KEY}

    for attempt, delay in enumerate([0] + RETRY_DELAYS, 1):
        if delay:
            log.warning("  retry %d/%d after %ds …", attempt, len(RETRY_DELAYS) + 1, delay)
            await asyncio.sleep(delay)
        try:
            resp = await http.get(url, params=params, headers=headers, timeout=60)
            if resp.status_code == 429 or resp.status_code >= 500:
                log.warning("  %s → HTTP %d", place_id[:20], resp.status_code)
                continue
            resp.raise_for_status()
            body = resp.json()
            # Save raw response for debugging
            raw_path = RAW_DIR / f"{place_id}.json"
            raw_path.write_text(json.dumps(body, ensure_ascii=False, indent=2))
            # Navigate response: data[0][0].reviews_data
            data = body.get("data", [])
            if not data or not data[0]:
                return []
            place_data = data[0][0] if isinstance(data[0], list) else data[0]
            return place_data.get("reviews_data", []) or []
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            log.warning("  network error: %s", exc)
            if attempt > len(RETRY_DELAYS):
                break
    return []


def format_review_rows(place_id: str, reviews: list[dict]) -> list[dict]:
    """Convert raw Outscraper review dicts → provider_reviews rows."""
    rows = []
    for r in reviews:
        text = clean_text(r.get("review_text") or "")
        if not text:
            continue
        rows.append({
            "place_id":        place_id,
            "rating":          r.get("review_rating"),
            "review_text":     text[:2000],          # cap at 2000 chars
            "text_excerpt":    make_excerpt(text, 200),
            "author_initials": make_initials(r.get("author_title") or ""),
            "relative_time":   r.get("review_datetime_utc", "")[:10],  # date string
            "review_url":      r.get("review_link") or r.get("owner_answer_timestamp_datetime_utc"),
            "sort_key":        "most_relevant",
            "updated_at":      datetime.now(timezone.utc).isoformat(),
        })
    return rows


async def process_provider(
    http: httpx.AsyncClient,
    supabase: Client,
    provider: dict,
    sem: asyncio.Semaphore,
) -> bool:
    place_id = provider["place_id"]
    async with sem:
        log.info("Fetching reviews → %s (%s)", provider.get("name", "?")[:40], place_id[:20])
        raw = await fetch_reviews_outscraper(http, place_id)

    if not raw:
        log.info("  no reviews returned")
        return False

    selected = select_best_reviews(raw)
    if not selected:
        log.info("  no qualifying reviews")
        return False

    rows = format_review_rows(place_id, selected)
    log.info("  selected %d reviews", len(rows))

    try:
        # Delete existing reviews for this provider, then insert fresh
        supabase.table("provider_reviews").delete().eq("place_id", place_id).execute()
        supabase.table("provider_reviews").insert(rows).execute()

        # Update denormalised top_review_excerpt on providers table
        if rows:
            supabase.table("providers").update(
                {"top_review_excerpt": rows[0]["text_excerpt"]}
            ).eq("place_id", place_id).execute()
    except Exception as exc:
        log.error("  supabase error: %s", exc)
        return False

    return True


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    if not OUTSCRAPER_KEY:
        log.error("OUTSCRAPER_API_KEY not set in .env")
        sys.exit(1)

    supabase = get_supabase()

    if args.place_id:
        # Single-provider mode
        res = supabase.table("providers").select("place_id,name").eq("place_id", args.place_id).execute()
        providers = res.data or []
    elif args.resume:
        # Skip providers that already have reviews
        done_res = supabase.table("provider_reviews").select("place_id").execute()
        done_ids = {r["place_id"] for r in (done_res.data or [])}
        all_res = supabase.table("providers").select("place_id,name").execute()
        providers = [p for p in (all_res.data or []) if p["place_id"] not in done_ids]
        log.info("%d providers already done; %d remaining", len(done_ids), len(providers))
    else:
        res = supabase.table("providers").select("place_id,name").execute()
        providers = res.data or []

    if args.limit:
        providers = providers[:args.limit]

    log.info("Processing %d providers …", len(providers))

    sem = asyncio.Semaphore(CONCURRENCY)
    success = 0

    async with httpx.AsyncClient() as http:
        for i in range(0, len(providers), CONCURRENCY):
            batch = providers[i : i + CONCURRENCY]
            tasks = [process_provider(http, supabase, p, sem) for p in batch]
            results = await asyncio.gather(*tasks)
            success += sum(1 for r in results if r)
            log.info("Progress: %d/%d ✓", i + len(batch), len(providers))
            await asyncio.sleep(RATE_LIMIT_SLEEP)

    log.info("\n✓ Done. Enriched %d/%d providers with reviews.", success, len(providers))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich provider_reviews via Outscraper")
    parser.add_argument("--limit",    type=int,  help="Only process first N providers")
    parser.add_argument("--resume",   action="store_true", help="Skip providers already in DB")
    parser.add_argument("--place-id", type=str,  help="Process a single provider by place_id")
    asyncio.run(main(parser.parse_args()))
