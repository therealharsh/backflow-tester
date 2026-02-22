#!/usr/bin/env python3
"""
Step 4: Upsert verified providers into Supabase.

Reads crawler/data/verified.csv, transforms rows to match the existing DB schema,
and upserts into providers, cities, and provider_services tables.

Requirements:
    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env

Usage:
    python crawler/04_upsert_supabase.py
    python crawler/04_upsert_supabase.py --dry-run
    python crawler/04_upsert_supabase.py --input crawler/data/verified.csv
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env")
load_dotenv(_root / "web" / ".env.local")

# Paths
DATA_DIR = Path(__file__).parent / "data"
INPUT_CSV = DATA_DIR / "verified.csv"
LOG_FILE = DATA_DIR / "04_upsert.log"

BATCH_SIZE = 100

# ── Columns written to the providers table ────────────────────────────────────

PROVIDER_COLS = [
    "place_id", "google_id", "name", "phone", "website",
    "website_clean", "website_domain", "website_missing",
    "address", "city", "state_code", "postal_code",
    "latitude", "longitude",
    "type", "subtypes", "category",
    "rating", "reviews",
    "backflow_score", "tier",
    "best_evidence_url",
    "location_link", "reviews_link",
    "image_urls",
    "reviews_per_score",
    "service_tags",
    "top_review_excerpt",
    "provider_slug", "city_slug",
]

# ── 14 canonical service tags from provider_services table ────────────────────

CANONICAL_SERVICE_KEYS = [
    'backflow_testing', 'rpz_testing', 'dcva_testing', 'pvb_testing',
    'preventer_installation', 'preventer_repair',
    'cross_connection_control', 'annual_certification_filing',
    'sprinkler_backflow',
    'commercial', 'residential',
    'emergency_service', 'free_estimates', 'same_day_service',
]

# Maps display tag names → canonical DB keys
TAG_TO_KEY = {
    'Backflow Testing': 'backflow_testing',
    'RPZ Testing': 'rpz_testing',
    'DCVA Testing': 'dcva_testing',
    'PVB Testing': 'pvb_testing',
    'Preventer Installation': 'preventer_installation',
    'Preventer Repair': 'preventer_repair',
    'Cross-Connection Control': 'cross_connection_control',
    'Annual Certification Filing': 'annual_certification_filing',
    'Sprinkler Backflow': 'sprinkler_backflow',
    'Commercial': 'commercial',
    'Residential': 'residential',
    'Emergency Service': 'emergency_service',
    'Free Estimates': 'free_estimates',
    'Same Day Service': 'same_day_service',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def setup_logging():
    """Configure logging."""
    DATA_DIR.mkdir(exist_ok=True)

    logger = logging.getLogger("04_upsert")
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger

    fh = logging.FileHandler(LOG_FILE)
    fh.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    fh.setFormatter(formatter)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(formatter)

    logger.addHandler(fh)
    logger.addHandler(ch)

    return logger


def slugify(text: str) -> str:
    """URL-friendly slug from text."""
    if not text:
        return ""
    text = str(text).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")


def make_provider_slug(name: str, city: str, state: str) -> str:
    """Generate provider slug: name-city-state."""
    n = slugify(name)[:50].rstrip("-")
    c = slugify(city)
    s = slugify(state)
    return f"{n}-{c}-{s}"


def dedupe_slugs(series: pd.Series, existing_slugs: set[str] | None = None) -> pd.Series:
    """Append -2, -3, ... to duplicate slugs (including those already in DB)."""
    taken: set[str] = set(existing_slugs) if existing_slugs else set()
    # Track highest used suffix number per base slug for efficiency
    counters: dict[str, int] = {}
    if existing_slugs:
        for slug in existing_slugs:
            m = re.match(r'^(.+)-(\d+)$', slug)
            if m:
                base, num = m.group(1), int(m.group(2))
                counters[base] = max(counters.get(base, 0), num)
    result = []
    for slug in series:
        if slug not in taken:
            taken.add(slug)
            result.append(slug)
        else:
            n = counters.get(slug, 1) + 1
            candidate = f"{slug}-{n}"
            while candidate in taken:
                n += 1
                candidate = f"{slug}-{n}"
            counters[slug] = n
            taken.add(candidate)
            result.append(candidate)
    return pd.Series(result, index=series.index)


def _isnan(v: object) -> bool:
    if v is None:
        return True
    try:
        return math.isnan(float(v))
    except (TypeError, ValueError):
        return False


def clean_row(row: dict, cols: list[str]) -> dict:
    """Normalise a pandas row for Supabase upsert."""
    out: dict = {}
    for col in cols:
        val = row.get(col)
        if _isnan(val):
            out[col] = None
        elif col == "postal_code":
            s = str(val).strip().split(".")[0].strip()
            if s and s.isdigit():
                out[col] = s.zfill(5)
            elif s and s not in ("nan", "none", ""):
                out[col] = s
            else:
                out[col] = None
        elif col in ("rating", "latitude", "longitude"):
            out[col] = float(val) if val is not None else None
        elif col in ("reviews", "backflow_score"):
            try:
                out[col] = int(float(val)) if val is not None else 0
            except (ValueError, TypeError):
                out[col] = 0
        elif col == "website_missing":
            out[col] = bool(val) if val is not None else None
        elif col == "image_urls":
            if isinstance(val, list):
                out[col] = val
            else:
                try:
                    out[col] = json.loads(val) if val else []
                except (json.JSONDecodeError, TypeError):
                    out[col] = []
        elif col == "reviews_per_score":
            if isinstance(val, dict):
                out[col] = {str(k): int(v) for k, v in val.items()}
            elif isinstance(val, str) and val.strip():
                try:
                    out[col] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    try:
                        import ast
                        parsed = ast.literal_eval(val)
                        out[col] = {str(k): int(v) for k, v in parsed.items()}
                    except Exception:
                        out[col] = None
            else:
                out[col] = None
        elif col == "service_tags":
            # Convert pipe-delimited string to array
            if isinstance(val, list):
                out[col] = val
            elif isinstance(val, str) and val.strip():
                out[col] = [t.strip() for t in val.split('|') if t.strip()]
            else:
                out[col] = []
        else:
            out[col] = str(val) if val is not None else None
    return out


def get_client():
    """Create Supabase client using service role key."""
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    return create_client(url, key)


def fetch_existing_slugs(supabase, logger, exclude_place_ids: set[str] | None = None) -> set[str]:
    """Fetch existing provider_slug values from DB to avoid collisions.

    Excludes slugs belonging to place_ids in our CSV — those will be
    overwritten by the upsert, so they shouldn't block slug assignment.
    """
    slugs: set[str] = set()
    page_size = 1000
    offset = 0
    try:
        while True:
            resp = (
                supabase.table("providers")
                .select("provider_slug,place_id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for r in rows:
                pid = r.get("place_id", "")
                s = r.get("provider_slug")
                # Skip slugs that belong to providers we're about to upsert
                # (their slug will be overwritten anyway)
                if exclude_place_ids and str(pid) in exclude_place_ids:
                    continue
                if s:
                    slugs.add(str(s))
            if len(rows) < page_size:
                break
            offset += page_size
        logger.info(f"  Loaded {len(slugs):,} existing provider slugs from DB (excluding {len(exclude_place_ids or set()):,} in CSV)")
    except Exception as exc:
        logger.warning(f"  Could not fetch existing slugs: {exc}")
    return slugs


# ── Upsert functions ─────────────────────────────────────────────────────────

def upsert_providers(supabase, df: pd.DataFrame, dry_run: bool, logger) -> tuple[int, int, set[str]]:
    """Upsert providers in batches. Returns (success_count, failed_count, successful_place_ids)."""
    rows = df.to_dict("records")
    success = 0
    failed = 0
    total = len(rows)
    ok_place_ids: set[str] = set()

    for i in range(0, total, BATCH_SIZE):
        batch = rows[i: i + BATCH_SIZE]
        clean = [clean_row(r, PROVIDER_COLS) for r in batch]

        if dry_run:
            logger.info(f"  [DRY RUN] providers [{i + len(batch):,}/{total:,}]")
            success += len(batch)
            for r in clean:
                ok_place_ids.add(r["place_id"])
            continue

        try:
            supabase.table("providers").upsert(clean, on_conflict="place_id").execute()
            success += len(batch)
            for r in clean:
                ok_place_ids.add(r["place_id"])
            logger.info(f"  providers [{i + len(batch):,}/{total:,}]")
        except Exception:
            # Batch failed — fall back to row-by-row
            logger.warning(f"  providers batch {i // BATCH_SIZE + 1} failed, retrying row-by-row...")
            for r in clean:
                try:
                    supabase.table("providers").upsert(r, on_conflict="place_id").execute()
                    success += 1
                    ok_place_ids.add(r["place_id"])
                except Exception as row_exc:
                    logger.error(f"  provider {r.get('place_id')} ({r.get('name')}) ERROR: {row_exc}")
                    failed += 1

    return success, failed, ok_place_ids


def upsert_cities(supabase, df: pd.DataFrame, dry_run: bool, logger) -> int:
    """Recompute city counts and upsert cities table."""
    agg = (
        df.groupby(["city_slug", "state_code", "city"])
        .agg(
            provider_count=("place_id", "count"),
            latitude=("latitude", "mean"),
            longitude=("longitude", "mean"),
        )
        .reset_index()
    )

    city_rows = []
    for _, row in agg.iterrows():
        city_rows.append({
            "city":           str(row["city"]),
            "city_slug":      str(row["city_slug"]),
            "state_code":     str(row["state_code"]),
            "provider_count": int(row["provider_count"]),
            "latitude":       float(row["latitude"]) if not _isnan(row["latitude"]) else None,
            "longitude":      float(row["longitude"]) if not _isnan(row["longitude"]) else None,
        })

    total = len(city_rows)

    if dry_run:
        logger.info(f"  [DRY RUN] Would upsert {total} cities")
        return total

    for i in range(0, total, BATCH_SIZE):
        batch = city_rows[i: i + BATCH_SIZE]
        try:
            supabase.table("cities").upsert(
                batch, on_conflict="city_slug,state_code"
            ).execute()
            logger.info(f"  cities [{i + len(batch):,}/{total:,}]")
        except Exception as exc:
            logger.error(f"  cities batch {i // BATCH_SIZE + 1} ERROR: {exc}")

    return total


def upsert_provider_services(
    supabase, df: pd.DataFrame, dry_run: bool, logger,
    ok_place_ids: set[str] | None = None,
) -> int:
    """Upsert provider_services from extracted service_tags (batched)."""
    records: list[dict] = []
    skipped_fk = 0

    for _, row in df.iterrows():
        place_id = row.get('place_id')
        tags_raw = row.get('service_tags')

        if not place_id or not tags_raw:
            continue

        # Skip if this provider wasn't successfully upserted
        if ok_place_ids is not None and str(place_id) not in ok_place_ids:
            skipped_fk += 1
            continue

        # Parse tags
        if isinstance(tags_raw, list):
            tags = tags_raw
        elif isinstance(tags_raw, str) and tags_raw.strip():
            tags = [t.strip() for t in tags_raw.split('|') if t.strip()]
        else:
            continue

        if not tags:
            continue

        # Build services_json
        services_json = {key: False for key in CANONICAL_SERVICE_KEYS}
        for tag in tags:
            db_key = TAG_TO_KEY.get(tag)
            if db_key:
                services_json[db_key] = True

        if not any(services_json.values()):
            continue

        records.append({
            'place_id': str(place_id),
            'services_json': services_json,
        })

    total = len(records)

    if dry_run:
        logger.info(f"  [DRY RUN] Would upsert {total} provider_services records")
        if skipped_fk > 0:
            logger.info(f"  provider_services: {skipped_fk} skipped (provider not in DB)")
        return total

    success = 0
    for i in range(0, total, BATCH_SIZE):
        batch = records[i: i + BATCH_SIZE]
        try:
            supabase.table("provider_services").upsert(
                batch, on_conflict="place_id"
            ).execute()
            success += len(batch)
            logger.info(f"  provider_services [{i + len(batch):,}/{total:,}]")
        except Exception as exc:
            logger.error(f"  provider_services batch {i // BATCH_SIZE + 1} ERROR: {exc}")

    logger.info(f"  provider_services: {success} records upserted")
    if skipped_fk > 0:
        logger.info(f"  provider_services: {skipped_fk} skipped (provider not in DB)")

    return success


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Step 4: Upsert verified providers into Supabase"
    )
    parser.add_argument(
        "--input", default=str(INPUT_CSV),
        help="Input verified CSV (default: crawler/data/verified.csv)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be done without writing to DB"
    )

    args = parser.parse_args()
    logger = setup_logging()

    csv_path = Path(args.input)
    if not csv_path.exists():
        logger.error(f"Input file not found: {csv_path}")
        sys.exit(1)

    logger.info("=" * 70)
    logger.info("STEP 4: UPSERT TO SUPABASE")
    logger.info("=" * 70)
    if args.dry_run:
        logger.info("*** DRY RUN MODE — no database writes ***")

    logger.info(f"Loading from {csv_path} ...")
    df = pd.read_csv(csv_path, low_memory=False)
    # Drop duplicate columns (keep first occurrence)
    df = df.loc[:, ~df.columns.duplicated()]
    logger.info(f"  {len(df):,} rows")

    # ── Drop rows missing required fields ─────────────────────────────────────
    n_before = len(df)
    df = df.dropna(subset=["place_id", "name"])
    df = df[df["city"].notna() & (df["city"].astype(str).str.strip() != "")]

    # Normalize state column
    if 'state_code' not in df.columns and 'state' in df.columns:
        df['state_code'] = df['state']
    df = df[df["state_code"].notna() & (df["state_code"].astype(str).str.strip() != "")]

    # ── Rename Outscraper columns that don't match DB schema ───────────────
    col_renames = {
        'location_reviews_link': 'reviews_link',
        'full_address': 'address',
    }
    df = df.rename(columns={k: v for k, v in col_renames.items() if k in df.columns})

    dropped = n_before - len(df)
    if dropped > 0:
        logger.info(f"  Dropped {dropped:,} rows (missing required fields)")

    # ── Dedupe by place_id ────────────────────────────────────────────────────
    n_before = len(df)
    df = df.drop_duplicates(subset=["place_id"], keep="first")
    deduped = n_before - len(df)
    if deduped > 0:
        logger.info(f"  Deduped {deduped:,} duplicate place_ids")

    # ── Normalize ─────────────────────────────────────────────────────────────
    df["state_code"] = df["state_code"].str.upper().str.strip()
    df["city"] = df["city"].str.strip()
    df["name"] = df["name"].str.strip()

    for col in ("rating", "latitude", "longitude"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in ("reviews", "backflow_score"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    # ── Connect to Supabase (early, to fetch existing slugs) ────────────────
    supabase = None
    existing_slugs: set[str] = set()
    if not args.dry_run:
        supabase = get_client()
        csv_place_ids = set(df["place_id"].astype(str).tolist())
        logger.info("Fetching existing provider slugs from DB...")
        existing_slugs = fetch_existing_slugs(supabase, logger, exclude_place_ids=csv_place_ids)

    # ── Generate slugs ────────────────────────────────────────────────────────
    df["city_slug"] = df["city"].apply(slugify)

    raw_slugs = df.apply(
        lambda r: make_provider_slug(r["name"], r["city"], r["state_code"].lower()), axis=1
    )
    df["provider_slug"] = dedupe_slugs(raw_slugs, existing_slugs)

    # ── Image URLs ────────────────────────────────────────────────────────────
    if "image_urls" not in df.columns:
        def _google_photo(r):
            ph = r.get("photo", "")
            if pd.notna(ph) and str(ph).strip().startswith("http"):
                return json.dumps([str(ph).strip()])
            return json.dumps([])
        df["image_urls"] = df.apply(_google_photo, axis=1)

    logger.info(f"\nReady to upsert {len(df):,} providers")

    # ── Upsert providers ──────────────────────────────────────────────────────
    logger.info("\n── Upserting providers ─────────────────────────────")
    success, failed, ok_place_ids = upsert_providers(supabase, df, args.dry_run, logger)

    # ── Upsert cities ─────────────────────────────────────────────────────────
    logger.info("\n── Upserting cities ────────────────────────────────")
    cities_count = upsert_cities(supabase, df, args.dry_run, logger)

    # ── Upsert provider_services ──────────────────────────────────────────────
    logger.info("\n── Upserting provider_services ─────────────────────")
    services_count = upsert_provider_services(supabase, df, args.dry_run, logger, ok_place_ids)

    # ── Summary ───────────────────────────────────────────────────────────────
    logger.info("\n" + "=" * 70)
    logger.info("UPSERT COMPLETE" + (" (DRY RUN)" if args.dry_run else ""))
    logger.info("=" * 70)
    logger.info(f"Providers:  {success:,} upserted, {failed:,} failed")
    logger.info(f"Cities:     {cities_count:,} upserted")
    logger.info(f"Services:   {services_count:,} upserted")
    logger.info(f"States:     {df['state_code'].nunique()}")
    logger.info(f"Cities:     {df['city'].nunique()}")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
