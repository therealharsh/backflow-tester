#!/usr/bin/env python3
"""
One-shot patch for raw_places.csv.

Fixes issues in the existing raw file so you don't need to re-scrape:

  1. URL percent-decoding
     Outscraper encodes '?' as %3F, '&' as %26, '=' as %3D in the website
     column.  Decode them so downstream tools (cleaner, verifier) see real URLs.
     After decoding, strip tracking params (utm_*, fbclid, etc.).

  2. Nothing else is touched — all other columns are written back unchanged.

Creates a timestamped backup before overwriting so you can always roll back.
"""

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse, unquote

import pandas as pd


DATA_DIR = Path(__file__).parent / "data"
DEFAULT_INPUT = DATA_DIR / "raw_places.csv"

TRACKING_PARAMS = {
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'utm_source_platform',
    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_cid', 'mc_eid',
    'ref', 'referrer', 'source',
}


def clean_url(raw: object) -> str:
    """
    Decode a potentially percent-encoded URL and strip tracking params.

    Returns the cleaned URL string, or the original value on any failure.
    """
    if pd.isna(raw) or not str(raw).strip():
        return raw  # preserve NaN / empty as-is

    url = str(raw).strip()

    # Add scheme if missing so urlparse works correctly
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    try:
        # Decode %3F → ?  %26 → &  %3D → =  etc.
        url = unquote(url)

        parsed = urlparse(url)

        # Strip tracking params from the now-visible query string
        if parsed.query:
            params = parse_qs(parsed.query, keep_blank_values=False)
            cleaned = {k: v for k, v in params.items() if k not in TRACKING_PARAMS}
            query = urlencode(cleaned, doseq=True) if cleaned else ''
        else:
            query = ''

        # Normalise scheme to https, drop www., strip trailing slash + fragment
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]

        path = parsed.path.rstrip('/') if parsed.path not in ('', '/') else ''

        return urlunparse(('https', domain, path, '', query, ''))

    except Exception:
        return raw   # never lose the original value on failure


def main():
    parser = argparse.ArgumentParser(
        description='Patch URL encoding issues in raw_places.csv in-place'
    )
    parser.add_argument(
        '--input',
        default=str(DEFAULT_INPUT),
        help='Path to raw CSV (default: crawler/data/raw_places.csv)'
    )
    parser.add_argument(
        '--no-backup',
        action='store_true',
        help='Skip creating a timestamped backup before overwriting'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print a sample of changes without writing anything'
    )
    args = parser.parse_args()

    csv_path = Path(args.input)
    if not csv_path.exists():
        print(f"ERROR: file not found: {csv_path}")
        sys.exit(1)

    # Load — use on_bad_lines='skip' to tolerate the occasional malformed row
    print(f"Loading {csv_path} …")
    try:
        df = pd.read_csv(csv_path, on_bad_lines='skip', low_memory=False)
    except TypeError:
        df = pd.read_csv(csv_path, error_bad_lines=False, warn_bad_lines=True,
                         low_memory=False)

    total_rows = len(df)
    print(f"  {total_rows:,} rows  |  {len(df.columns)} columns")

    if 'website' not in df.columns:
        print("ERROR: 'website' column not found — nothing to patch.")
        sys.exit(1)

    # ── 1. Identify rows that will change ──────────────────────────────────
    original = df['website'].copy()
    patched  = df['website'].apply(clean_url)

    changed_mask = (original != patched) & original.notna()
    n_changed = changed_mask.sum()

    print(f"\nWebsite column:")
    print(f"  Rows with a value  : {original.notna().sum():,}")
    print(f"  Rows that will change: {n_changed:,}")

    if n_changed == 0:
        print("\nNothing to patch — file is already clean.")
        return

    # ── 2. Show sample ─────────────────────────────────────────────────────
    print("\nSample fixes (first 8):")
    sample = df[changed_mask].head(8)
    for _, row in sample.iterrows():
        before = str(original[row.name])
        after  = str(patched[row.name])
        print(f"  [{row.name}] {row.get('name', '')}")
        print(f"    BEFORE: {before[:90]}")
        print(f"    AFTER:  {after[:90]}")

    if args.dry_run:
        print("\n[dry-run] No files written.")
        return

    # ── 3. Backup ───────────────────────────────────────────────────────────
    if not args.no_backup:
        stamp  = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup = csv_path.with_name(f"{csv_path.stem}.bak_{stamp}.csv")
        shutil.copy2(csv_path, backup)
        print(f"\nBackup saved → {backup}")

    # ── 4. Apply patch and overwrite ────────────────────────────────────────
    df['website'] = patched
    df.to_csv(csv_path, index=False)

    print(f"\n✓ Patched {n_changed:,} URLs in {csv_path}")
    print("  Re-run 02_clean_places.py to get a fresh clean_places.csv.")


if __name__ == '__main__':
    main()
