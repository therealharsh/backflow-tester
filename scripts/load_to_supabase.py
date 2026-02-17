#!/usr/bin/env python3
"""
Load data/providers_final.csv into Supabase.

Requirements:
    pip install supabase python-dotenv pandas

Usage:
    # From project root, with .env containing SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
    python scripts/load_to_supabase.py

    # Retry only previously failed rows
    python scripts/load_to_supabase.py --retry
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

ROOT       = Path(__file__).parent.parent
DATA_CSV   = ROOT / "data" / "providers_final.csv"
FAILED_CSV = ROOT / "data" / "failed_rows.csv"

BATCH_SIZE = 100

# Columns written to the providers table
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
    "provider_slug", "city_slug",
]

# ─── Helpers ──────────────────────────────────────────────────────────────────


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    return create_client(url, key)


def _isnan(v: object) -> bool:
    if v is None:
        return True
    try:
        return math.isnan(float(v))  # type: ignore[arg-type]
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
            # Normalize float ZIPs: "10019.0" → "10019", preserve leading zeros
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
            # Scrapy exports as Python dict string: "{'1': 12, '5': 1500}"
            # Convert to proper JSON dict with int values
            if isinstance(val, dict):
                out[col] = {str(k): int(v) for k, v in val.items()}
            elif isinstance(val, str) and val.strip():
                try:
                    # Try standard JSON first
                    out[col] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    try:
                        # Fall back to Python literal eval for single-quote dicts
                        import ast
                        parsed = ast.literal_eval(val)
                        out[col] = {str(k): int(v) for k, v in parsed.items()}
                    except Exception:
                        out[col] = None
            else:
                out[col] = None
        else:
            out[col] = str(val) if val is not None else None
    return out


# ─── Loaders ──────────────────────────────────────────────────────────────────


def load_providers(supabase: Client, df: pd.DataFrame) -> list[dict]:
    """Upsert providers in batches. Returns list of failed rows."""
    rows = df.to_dict("records")
    failed: list[dict] = []
    total = len(rows)

    for i in range(0, total, BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        clean = [clean_row(r, PROVIDER_COLS) for r in batch]
        try:
            supabase.table("providers").upsert(clean, on_conflict="place_id").execute()
            print(f"  providers [{i + len(batch):,}/{total:,}] ✓")
        except Exception as exc:
            print(f"  providers batch {i // BATCH_SIZE + 1} ERROR: {exc}")
            failed.extend(batch)

    return failed


def load_cities(supabase: Client, df: pd.DataFrame) -> None:
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
    for i in range(0, total, BATCH_SIZE):
        batch = city_rows[i : i + BATCH_SIZE]
        try:
            supabase.table("cities").upsert(
                batch, on_conflict="city_slug,state_code"
            ).execute()
            print(f"  cities [{i + len(batch):,}/{total:,}] ✓")
        except Exception as exc:
            print(f"  cities batch {i // BATCH_SIZE + 1} ERROR: {exc}")


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Load providers_final.csv into Supabase")
    parser.add_argument(
        "--retry",
        action="store_true",
        help="Load from failed_rows.csv instead of providers_final.csv",
    )
    args = parser.parse_args()

    csv_path = FAILED_CSV if args.retry else DATA_CSV
    if not csv_path.exists():
        print(f"ERROR: {csv_path} not found.")
        if not args.retry:
            print("  Run: python scripts/merge_final_dataset.py")
        sys.exit(1)

    print(f"Loading from {csv_path} …")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  {len(df):,} rows")

    supabase = get_client()

    print("\n── Upserting providers ─────────────────────────────")
    failed = load_providers(supabase, df)

    print("\n── Upserting cities ────────────────────────────────")
    load_cities(supabase, df)

    if failed:
        FAILED_CSV.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(failed).to_csv(FAILED_CSV, index=False)
        print(f"\n⚠  {len(failed):,} failed rows → {FAILED_CSV}")
        print("   Re-run with --retry to attempt those rows again.")
    else:
        # Clean up old failed file if everything succeeded
        if FAILED_CSV.exists():
            FAILED_CSV.unlink()

    print(
        f"\n✓ Done. Loaded {len(df) - len(failed):,}/{len(df):,} providers."
        f"  Failed: {len(failed):,}"
    )


if __name__ == "__main__":
    main()
