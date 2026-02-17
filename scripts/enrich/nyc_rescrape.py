#!/usr/bin/env python3
"""
NYC Quality Fix: Rescrape backflow testers for all 5 NYC boroughs.

Uses Outscraper to pull fresh Google Maps results, applies a category
blacklist to remove training schools / supply houses, and produces a
candidate CSV ready for the verification pipeline.

Usage:
    python scripts/enrich/nyc_rescrape.py
    python scripts/enrich/nyc_rescrape.py --out data/nyc_candidates.csv
    python scripts/enrich/nyc_rescrape.py --limit 50   # results per query

Requirements (.env):
    OUTSCRAPER_API_KEY=...
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

load_dotenv()

ROOT           = Path(__file__).parent.parent.parent
DEFAULT_OUT    = ROOT / "data" / "nyc_candidates.csv"
OUTSCRAPER_KEY = os.environ.get("OUTSCRAPER_API_KEY", "")

# ─── Queries ──────────────────────────────────────────────────────────────────

# Each query targets a specific borough or high-density area
NYC_QUERIES = [
    "backflow testing Manhattan New York NY",
    "backflow testing Brooklyn New York NY",
    "backflow testing Queens New York NY",
    "backflow testing Bronx New York NY",
    "backflow testing Staten Island New York NY",
    "backflow preventer testing New York NY",
    "RPZ testing New York NY",
    "cross connection control New York NY",
    "backflow certification New York NY 10001",
    "backflow certification New York NY 11201",
    "backflow certification New York NY 11101",
]

# Category / name substrings that indicate non-service providers
CATEGORY_BLACKLIST = [
    "training", "academy", "school", "certification class",
    "supply house", "supply store", "wholesale", "distributor",
    "college", "university", "institute", "education",
    "course", "seminar", "workshop",
]

NAME_BLACKLIST = [
    "training", "academy", "school", "supply", "wholesale",
    "distributor", "college", "university",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ─── Outscraper helper ────────────────────────────────────────────────────────

def fetch_places(query: str, limit: int = 100) -> list[dict]:
    """Call Outscraper maps/search endpoint for a single query."""
    url    = "https://api.app.outscraper.com/maps/search-v3"
    params = {
        "query": query,
        "limit": limit,
        "async": "false",
        "fields": "place_id,name,category,subtypes,phone,website,address,city,state,postal_code,latitude,longitude,rating,reviews,reviews_link",
    }
    headers = {"X-API-KEY": OUTSCRAPER_KEY}

    for attempt in range(3):
        if attempt:
            wait = 10 * attempt
            log.warning("  retry %d after %ds …", attempt + 1, wait)
            time.sleep(wait)
        try:
            resp = httpx.get(url, params=params, headers=headers, timeout=60)
            if resp.status_code == 429:
                log.warning("  rate limited — sleeping 30s")
                time.sleep(30)
                continue
            resp.raise_for_status()
            body = resp.json()
            data = body.get("data", [])
            # Outscraper returns [[...results...]]
            if data and isinstance(data[0], list):
                return data[0]
            return data
        except Exception as exc:
            log.warning("  request error: %s", exc)
    return []


# ─── Filtering ────────────────────────────────────────────────────────────────

def is_blacklisted(place: dict) -> bool:
    name     = (place.get("name") or "").lower()
    category = (place.get("category") or "").lower()
    subtypes = (place.get("subtypes") or "").lower()
    combined = f"{name} {category} {subtypes}"

    for kw in CATEGORY_BLACKLIST:
        if kw in combined:
            return True
    # Name-only check
    for kw in NAME_BLACKLIST:
        if re.search(r"\b" + re.escape(kw) + r"\b", name):
            return True
    return False


def dedupe_by_place_id(places: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result = []
    for p in places:
        pid = p.get("place_id") or p.get("name", "")
        if pid and pid not in seen:
            seen.add(pid)
            result.append(p)
    return result


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(args: argparse.Namespace) -> None:
    if not OUTSCRAPER_KEY:
        log.error("OUTSCRAPER_API_KEY not set in .env")
        sys.exit(1)

    all_places: list[dict] = []

    for i, query in enumerate(NYC_QUERIES):
        log.info("[%d/%d] Querying: %s", i + 1, len(NYC_QUERIES), query)
        places = fetch_places(query, limit=args.limit)
        log.info("  → %d results", len(places))
        all_places.extend(places)
        time.sleep(2)  # polite rate limiting

    log.info("Total raw results: %d", len(all_places))

    # Dedupe + filter
    deduped  = dedupe_by_place_id(all_places)
    filtered = [p for p in deduped if not is_blacklisted(p)]

    log.info("After dedup: %d", len(deduped))
    log.info("After blacklist filter: %d", len(filtered))

    if not filtered:
        log.warning("No results after filtering — check blacklist or queries")
        return

    # Write CSV
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    fields = [
        "place_id", "name", "category", "subtypes",
        "phone", "website", "address", "city", "state",
        "postal_code", "latitude", "longitude",
        "rating", "reviews", "reviews_link",
    ]

    if HAS_PANDAS:
        import pandas as pd
        df = pd.DataFrame(filtered)
        # Keep only known fields, fill missing with None
        for f in fields:
            if f not in df.columns:
                df[f] = None
        df[fields].to_csv(out_path, index=False)
    else:
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(filtered)

    log.info("\n✓ Wrote %d candidates → %s", len(filtered), out_path)
    log.info("Next step: run 03_verify_backflow.py against this CSV")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rescrape NYC backflow testers")
    parser.add_argument("--out",   default=str(DEFAULT_OUT), help="Output CSV path")
    parser.add_argument("--limit", type=int, default=100,    help="Results per query")
    main(parser.parse_args())
