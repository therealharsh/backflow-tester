#!/usr/bin/env python3
"""
Merge verified.csv + images_enriched.csv → data/providers_final.csv

Usage:
    python scripts/merge_final_dataset.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

ROOT      = Path(__file__).parent.parent
DATA_DIR  = ROOT / "crawler" / "data"
OUT_DIR   = ROOT / "data"

VERIFIED_CSV = DATA_DIR / "verified.csv"
IMAGES_CSV   = DATA_DIR / "images_enriched.csv"
OUT_CSV      = OUT_DIR / "providers_final.csv"

# ─── Helpers ──────────────────────────────────────────────────────────────────


def slugify(text: str) -> str:
    if not text:
        return ""
    text = str(text).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")


def make_provider_slug(name: str, city: str, state: str) -> str:
    n = slugify(name)[:50].rstrip("-")
    c = slugify(city)
    s = slugify(state)
    return f"{n}-{c}-{s}"


def dedupe_slugs(series: pd.Series) -> pd.Series:
    """Append -2, -3, … to duplicate slugs."""
    seen: dict[str, int] = {}
    result = []
    for slug in series:
        if slug not in seen:
            seen[slug] = 0
            result.append(slug)
        else:
            seen[slug] += 1
            result.append(f"{slug}-{seen[slug] + 1}")
    return pd.Series(result, index=series.index)


def parse_image_urls(row: pd.Series) -> list[str]:
    urls = []
    for i in (1, 2, 3):
        url = row.get(f"image_{i}_url")
        if pd.notna(url) and str(url).strip().startswith("http"):
            urls.append(str(url).strip())
    return urls


def safe_str(val: object) -> str | None:
    if pd.isna(val):
        return None
    s = str(val).strip()
    return s if s else None


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Load verified.csv ───────────────────────────────────────────────────
    if not VERIFIED_CSV.exists():
        print(f"ERROR: {VERIFIED_CSV} not found")
        sys.exit(1)

    print(f"Loading {VERIFIED_CSV} …")
    verified = pd.read_csv(VERIFIED_CSV, low_memory=False)
    print(f"  {len(verified):,} rows, {len(verified.columns)} columns")

    # ── Load images_enriched.csv (optional) ────────────────────────────────
    images: pd.DataFrame | None = None
    if IMAGES_CSV.exists():
        print(f"Loading {IMAGES_CSV} …")
        images = pd.read_csv(IMAGES_CSV, low_memory=False)
        print(f"  {len(images):,} rows")
    else:
        print(f"  WARN: {IMAGES_CSV} not found — will fall back to Google 'photo' field")

    # ── Merge ───────────────────────────────────────────────────────────────
    df = verified.copy()
    if images is not None:
        img_cols = ["place_id"] + [c for c in images.columns if c.startswith("image_")]
        img_df = images[img_cols].drop_duplicates("place_id")
        df = df.merge(img_df, on="place_id", how="left")

    # ── Drop rows missing required fields ───────────────────────────────────
    n_before = len(df)
    df = df.dropna(subset=["place_id", "name"])
    df = df[df["city"].notna() & (df["city"].astype(str).str.strip() != "")]
    df = df[df["state_code"].notna() & (df["state_code"].astype(str).str.strip() != "")]
    print(f"\nDropped {n_before - len(df):,} rows (missing place_id/name/city/state)")

    # ── Dedupe by place_id ──────────────────────────────────────────────────
    n_before = len(df)
    df = df.drop_duplicates(subset=["place_id"], keep="first")
    print(f"Deduped  {n_before - len(df):,} duplicate place_ids")

    # ── Normalize ───────────────────────────────────────────────────────────
    df["state_code"] = df["state_code"].str.upper().str.strip()
    df["city"]       = df["city"].str.strip()
    df["name"]       = df["name"].str.strip()

    for col in ("rating", "latitude", "longitude"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in ("reviews", "backflow_score"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    # Clean postal_code: pandas reads int ZIPs as float (e.g. 10019.0) when NaN rows exist
    if "postal_code" in df.columns:
        def _clean_zip(v: object) -> str | None:
            if pd.isna(v) or str(v).strip() in ("", "nan"):
                return None
            # Strip decimal part: "10019.0" → "10019"
            s = str(v).strip().split(".")[0].strip()
            if not s or not s.isdigit():
                return s if s else None
            # Zero-pad to 5 digits for leading-zero ZIPs (e.g. 2134 → 02134)
            return s.zfill(5)
        df["postal_code"] = df["postal_code"].apply(_clean_zip)

    # ── Slugs ───────────────────────────────────────────────────────────────
    df["city_slug"]  = df["city"].apply(slugify)
    df["state_slug"] = df["state_code"].str.lower()

    raw_slugs = df.apply(
        lambda r: make_provider_slug(r["name"], r["city"], r["state_slug"]), axis=1
    )
    df["provider_slug"] = dedupe_slugs(raw_slugs)

    # ── Image URLs ──────────────────────────────────────────────────────────
    if images is not None:
        df["image_urls"] = df.apply(
            lambda r: json.dumps(parse_image_urls(r)), axis=1
        )
    else:
        # Fallback: use Google Maps photo field
        def _google_photo(r: pd.Series) -> str:
            ph = r.get("photo", "")
            if pd.notna(ph) and str(ph).strip().startswith("http"):
                return json.dumps([str(ph).strip()])
            return json.dumps([])

        df["image_urls"] = df.apply(_google_photo, axis=1)

    # ── Select and rename final columns ─────────────────────────────────────
    col_map: dict[str, str] = {
        "place_id":           "place_id",
        "google_id":          "google_id",
        "name":               "name",
        "phone":              "phone",
        "website":            "website",
        "website_clean":      "website_clean",
        "website_domain":     "website_domain",
        "website_missing":    "website_missing",
        "address":            "address",
        "city":               "city",
        "state_code":         "state_code",
        "postal_code":        "postal_code",
        "latitude":           "latitude",
        "longitude":          "longitude",
        "type":               "type",
        "subtypes":           "subtypes",
        "category":           "category",
        "rating":             "rating",
        "reviews":            "reviews",
        "backflow_score":     "backflow_score",
        "tier":               "tier",
        "best_evidence_url":  "best_evidence_url",
        "location_link":      "location_link",
        "reviews_link":       "reviews_link",
        "image_urls":         "image_urls",
        "provider_slug":      "provider_slug",
        "city_slug":          "city_slug",
        "state_slug":         "state_slug",
    }

    present_src  = [s for s in col_map if s in df.columns]
    missing_src  = [s for s in col_map if s not in df.columns]
    for m in missing_src:
        print(f"  WARN: column '{m}' not in source — will be NULL")
        df[m] = None

    final = df[list(col_map.keys())].rename(columns=col_map)

    final.to_csv(OUT_CSV, index=False)

    # ── Report ───────────────────────────────────────────────────────────────
    print(f"\n✓ Wrote {len(final):,} providers → {OUT_CSV}")
    print("\n── Report ──────────────────────────────────────────")
    print(f"Total providers : {len(final):,}")
    print(f"States          : {final['state_code'].nunique()}")
    print(f"Cities          : {final['city'].nunique()}")
    with_site = final["website"].notna().sum()
    print(f"With website    : {with_site:,} ({with_site/len(final)*100:.1f}%)")
    imgs = final["image_urls"].apply(lambda x: len(json.loads(x or "[]")) > 0).sum()
    print(f"With images     : {imgs:,} ({imgs/len(final)*100:.1f}%)")
    print(f"Avg rating      : {final['rating'].mean():.2f}")
    print("\nTop 10 states:")
    print(final.groupby("state_code").size().sort_values(ascending=False).head(10).to_string())


if __name__ == "__main__":
    main()
