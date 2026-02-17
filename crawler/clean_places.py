#!/usr/bin/env python3
"""
Clean and deduplicate raw Google Maps scraper data.

Transforms raw_places.csv into clean_places.csv with:
- Deduplication by place_id
- Website normalization (remove tracking, canonicalize)
- Data validation (require name + address)
- Column standardization
- Statistics and logging
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import pandas as pd
import numpy as np


# Setup paths
DATA_DIR = Path(__file__).parent / "data"
RAW_CSV = DATA_DIR / "raw_places.csv"
CLEAN_CSV = DATA_DIR / "clean_places.csv"
CLEAN_LOG = DATA_DIR / "clean_places.log"

# Columns to keep (in priority order - will try multiple field names)
COLUMN_MAPPINGS = {
    'place_id': ['place_id', 'google_id', 'cid', 'data_id'],
    'name': ['name', 'title', 'business_name'],
    'full_address': ['full_address', 'address', 'full_address_street', 'street'],
    'city': ['city', 'locality'],
    'state': ['state', 'region', 'province'],
    'zip': ['zip', 'postal_code', 'postcode', 'zip_code'],
    'country': ['country', 'country_code'],
    'latitude': ['latitude', 'lat'],
    'longitude': ['longitude', 'lng', 'lon', 'long'],
    'website': ['website', 'url', 'site'],
    'phone': ['phone', 'phone_number', 'tel', 'telephone'],
    'rating': ['rating', 'stars', 'reviews_rating'],
    'reviews': ['reviews', 'review_count', 'reviews_count', 'number_of_reviews'],
    'categories': ['categories', 'category', 'type', 'types'],
}


def setup_logging():
    """Configure logging to both file and console."""
    DATA_DIR.mkdir(exist_ok=True)

    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)

    # Prevent duplicate handlers
    if logger.handlers:
        return logger

    # File handler
    file_handler = logging.FileHandler(CLEAN_LOG)
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

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


def find_column(df: pd.DataFrame, target: str, alternatives: list) -> Optional[str]:
    """Find the first matching column from a list of alternatives."""
    for col in alternatives:
        if col in df.columns:
            return col
    return None


def normalize_website(url: Optional[str]) -> Optional[str]:
    """
    Normalize website URL:
    - Remove tracking parameters (utm_*, fbclid, etc.)
    - Prefer https over http
    - Remove www. for consistency
    - Remove trailing slashes
    - Handle None/NaN values
    """
    if pd.isna(url) or not url or url.strip() == '':
        return None

    url = str(url).strip()

    # Add protocol if missing
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    try:
        parsed = urlparse(url)

        # Remove tracking parameters
        if parsed.query:
            params = parse_qs(parsed.query)
            # Remove common tracking params
            tracking_params = {
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                'fbclid', 'gclid', 'msclkid', '_ga', 'mc_cid', 'mc_eid'
            }
            cleaned_params = {k: v for k, v in params.items() if k not in tracking_params}

            # Rebuild query string
            if cleaned_params:
                query = urlencode(cleaned_params, doseq=True)
            else:
                query = ''
        else:
            query = ''

        # Prefer https
        scheme = 'https' if parsed.scheme in ('http', 'https') else parsed.scheme

        # Remove www. for canonicalization
        netloc = parsed.netloc
        if netloc.startswith('www.'):
            netloc = netloc[4:]

        # Remove trailing slash from path
        path = parsed.path.rstrip('/') if parsed.path != '/' else ''

        # Reconstruct URL
        normalized = urlunparse((
            scheme,
            netloc,
            path,
            parsed.params,
            query,
            ''  # Remove fragment
        ))

        return normalized

    except Exception:
        # If parsing fails, return original
        return url


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    """Normalize phone number - remove non-digits, keep only if valid length."""
    if pd.isna(phone) or not phone:
        return None

    # Extract digits only
    digits = ''.join(c for c in str(phone) if c.isdigit())

    # US phone numbers should be 10 or 11 digits (with country code)
    if len(digits) == 11 and digits.startswith('1'):
        # Remove leading 1 for US numbers
        digits = digits[1:]
    elif len(digits) < 10:
        return None

    # Format as (XXX) XXX-XXXX
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"

    return phone  # Return original if doesn't match pattern


def normalize_categories(cats: Optional[str]) -> Optional[str]:
    """Normalize categories - convert list-like strings to comma-separated."""
    if pd.isna(cats) or not cats:
        return None

    cats_str = str(cats)

    # If it looks like a Python list string, clean it up
    if cats_str.startswith('[') and cats_str.endswith(']'):
        # Remove brackets and quotes
        cats_str = cats_str[1:-1].replace("'", "").replace('"', '')

    # Split and clean
    parts = [p.strip() for p in cats_str.split(',')]
    parts = [p for p in parts if p]  # Remove empty

    if not parts:
        return None

    return ', '.join(parts)


def is_backflow_relevant(row: pd.Series) -> bool:
    """
    Check if a business is relevant to backflow testing.

    Look for backflow-related keywords in name and categories.
    """
    keywords = [
        'backflow', 'plumb', 'water', 'pipe', 'rpz',
        'cross connection', 'irrigation', 'sprinkler',
        'fire protection', 'contractor', 'maintenance',
        'testing', 'inspection', 'repair', 'service'
    ]

    text_to_check = ' '.join([
        str(row.get('name', '')),
        str(row.get('categories', ''))
    ]).lower()

    # Must have at least one keyword
    return any(keyword in text_to_check for keyword in keywords)


def clean_data(df: pd.DataFrame, logger: logging.Logger) -> pd.DataFrame:
    """Main data cleaning pipeline."""

    logger.info("=" * 70)
    logger.info("STARTING DATA CLEANING")
    logger.info("=" * 70)
    logger.info(f"Raw records: {len(df):,}")

    # Map columns to standardized names
    logger.info("\nMapping columns to standard names...")
    cleaned = pd.DataFrame()

    for target, alternatives in COLUMN_MAPPINGS.items():
        found_col = find_column(df, target, alternatives)
        if found_col:
            cleaned[target] = df[found_col]
            logger.info(f"  {target}: using '{found_col}'")
        else:
            cleaned[target] = None
            logger.info(f"  {target}: NOT FOUND (will be null)")

    initial_count = len(cleaned)

    # Step 1: Drop rows missing critical fields
    logger.info("\nStep 1: Dropping rows with missing name or address...")
    before = len(cleaned)
    cleaned = cleaned.dropna(subset=['name', 'full_address'])
    cleaned = cleaned[cleaned['name'].str.strip() != '']
    cleaned = cleaned[cleaned['full_address'].str.strip() != '']
    after = len(cleaned)
    logger.info(f"  Dropped {before - after:,} rows | Remaining: {after:,}")

    # Step 2: Filter for backflow relevance
    logger.info("\nStep 2: Filtering for backflow-relevant businesses...")
    before = len(cleaned)
    cleaned['is_relevant'] = cleaned.apply(is_backflow_relevant, axis=1)
    cleaned = cleaned[cleaned['is_relevant'] == True]
    cleaned = cleaned.drop(columns=['is_relevant'])
    after = len(cleaned)
    logger.info(f"  Dropped {before - after:,} non-relevant | Remaining: {after:,}")

    # Step 3: Deduplicate by place_id
    logger.info("\nStep 3: Deduplicating by place_id...")
    before = len(cleaned)

    # First, try to dedupe by place_id if it exists
    if cleaned['place_id'].notna().any():
        # Keep first occurrence of each place_id
        cleaned = cleaned.drop_duplicates(subset=['place_id'], keep='first')
        after = len(cleaned)
        logger.info(f"  Removed {before - after:,} duplicate place_ids | Remaining: {after:,}")
    else:
        logger.info("  No place_id column - deduping by name + address...")
        # Fallback: dedupe by name + address
        before = len(cleaned)
        cleaned = cleaned.drop_duplicates(subset=['name', 'full_address'], keep='first')
        after = len(cleaned)
        logger.info(f"  Removed {before - after:,} duplicates | Remaining: {after:,}")

    # Step 4: Normalize websites
    logger.info("\nStep 4: Normalizing websites...")
    before_valid = cleaned['website'].notna().sum()
    cleaned['website'] = cleaned['website'].apply(normalize_website)
    after_valid = cleaned['website'].notna().sum()
    logger.info(f"  Valid websites: {after_valid:,} (cleaned {before_valid - after_valid:,})")

    # Step 5: Normalize phone numbers
    logger.info("\nStep 5: Normalizing phone numbers...")
    before_valid = cleaned['phone'].notna().sum()
    cleaned['phone'] = cleaned['phone'].apply(normalize_phone)
    after_valid = cleaned['phone'].notna().sum()
    logger.info(f"  Valid phones: {after_valid:,} (cleaned {before_valid - after_valid:,})")

    # Step 6: Normalize categories
    logger.info("\nStep 6: Normalizing categories...")
    cleaned['categories'] = cleaned['categories'].apply(normalize_categories)
    valid_categories = cleaned['categories'].notna().sum()
    logger.info(f"  Records with categories: {valid_categories:,}")

    # Step 7: Clean up coordinates
    logger.info("\nStep 7: Validating coordinates...")
    before = len(cleaned)
    cleaned['latitude'] = pd.to_numeric(cleaned['latitude'], errors='coerce')
    cleaned['longitude'] = pd.to_numeric(cleaned['longitude'], errors='coerce')

    # US latitude roughly 25-50, longitude roughly -125 to -65
    cleaned = cleaned[
        (cleaned['latitude'].between(24, 50)) &
        (cleaned['longitude'].between(-125, -65))
    ]
    after = len(cleaned)
    logger.info(f"  Dropped {before - after:,} with invalid coords | Remaining: {after:,}")

    # Step 8: Clean numeric fields
    logger.info("\nStep 8: Cleaning rating and review counts...")
    cleaned['rating'] = pd.to_numeric(cleaned['rating'], errors='coerce')
    cleaned['reviews'] = pd.to_numeric(cleaned['reviews'], errors='coerce')

    valid_ratings = cleaned['rating'].notna().sum()
    valid_reviews = cleaned['reviews'].notna().sum()
    logger.info(f"  Records with ratings: {valid_ratings:,}")
    logger.info(f"  Records with review counts: {valid_reviews:,}")

    # Step 9: Sort by quality (prefer businesses with more data)
    logger.info("\nStep 9: Sorting by data quality...")

    # Create quality score
    cleaned['quality_score'] = (
        cleaned['website'].notna().astype(int) * 3 +
        cleaned['phone'].notna().astype(int) * 2 +
        cleaned['rating'].notna().astype(int) * 2 +
        cleaned['reviews'].fillna(0) / 100  # Normalize reviews
    )

    cleaned = cleaned.sort_values('quality_score', ascending=False)
    cleaned = cleaned.drop(columns=['quality_score'])

    # Step 10: Final column selection and ordering
    logger.info("\nStep 10: Final column selection...")

    final_columns = [
        'place_id', 'name', 'full_address', 'city', 'state', 'zip', 'country',
        'latitude', 'longitude', 'phone', 'website', 'categories',
        'rating', 'reviews'
    ]

    # Only keep columns that exist
    final_columns = [col for col in final_columns if col in cleaned.columns]
    cleaned = cleaned[final_columns]

    logger.info(f"  Final columns: {len(final_columns)}")

    # Statistics
    logger.info("\n" + "=" * 70)
    logger.info("CLEANING SUMMARY")
    logger.info("=" * 70)
    logger.info(f"Input records: {initial_count:,}")
    logger.info(f"Output records: {len(cleaned):,}")
    logger.info(f"Reduction: {initial_count - len(cleaned):,} ({(1 - len(cleaned)/initial_count)*100:.1f}%)")
    logger.info("\nData completeness:")
    logger.info(f"  With website: {cleaned['website'].notna().sum():,} ({cleaned['website'].notna().sum()/len(cleaned)*100:.1f}%)")
    logger.info(f"  With phone: {cleaned['phone'].notna().sum():,} ({cleaned['phone'].notna().sum()/len(cleaned)*100:.1f}%)")
    logger.info(f"  With rating: {cleaned['rating'].notna().sum():,} ({cleaned['rating'].notna().sum()/len(cleaned)*100:.1f}%)")
    logger.info(f"  With categories: {cleaned['categories'].notna().sum():,} ({cleaned['categories'].notna().sum()/len(cleaned)*100:.1f}%)")

    # Top cities
    if 'city' in cleaned.columns:
        logger.info("\nTop 10 cities by business count:")
        top_cities = cleaned['city'].value_counts().head(10)
        for city, count in top_cities.items():
            logger.info(f"  {city}: {count:,}")

    # Top categories
    if 'categories' in cleaned.columns:
        logger.info("\nMost common categories:")
        all_cats = []
        for cats in cleaned['categories'].dropna():
            all_cats.extend([c.strip() for c in str(cats).split(',')])
        if all_cats:
            from collections import Counter
            top_cats = Counter(all_cats).most_common(10)
            for cat, count in top_cats:
                logger.info(f"  {cat}: {count:,}")

    logger.info("=" * 70)

    return cleaned


def main():
    """Main execution."""
    parser = argparse.ArgumentParser(
        description='Clean and deduplicate raw Google Maps data'
    )
    parser.add_argument(
        '--input',
        default=str(RAW_CSV),
        help='Path to raw CSV file'
    )
    parser.add_argument(
        '--output',
        default=str(CLEAN_CSV),
        help='Path to output clean CSV file'
    )

    args = parser.parse_args()

    logger = setup_logging()

    # Check input exists
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        logger.error("Run the scraper first to generate raw_places.csv")
        sys.exit(1)

    # Load raw data
    logger.info(f"Loading raw data from {input_path}")
    try:
        # Use error_bad_lines=False to skip problematic rows (pandas <2.0)
        # or on_bad_lines='skip' for pandas >=2.0
        try:
            df = pd.read_csv(input_path, low_memory=False, on_bad_lines='skip')
        except TypeError:
            # Fallback for older pandas
            df = pd.read_csv(input_path, low_memory=False, error_bad_lines=False, warn_bad_lines=True)
    except Exception as e:
        logger.error(f"Failed to load CSV: {e}")
        sys.exit(1)

    logger.info(f"Loaded {len(df):,} raw records")
    logger.info(f"Columns found: {len(df.columns)}")

    # Clean data
    cleaned = clean_data(df, logger)

    # Save cleaned data
    output_path = Path(args.output)
    logger.info(f"\nSaving cleaned data to {output_path}")

    try:
        cleaned.to_csv(output_path, index=False)
        logger.info(f"SUCCESS! Saved {len(cleaned):,} clean records")
    except Exception as e:
        logger.error(f"Failed to save CSV: {e}")
        sys.exit(1)

    logger.info(f"\nOutput file: {output_path}")
    logger.info(f"Log file: {CLEAN_LOG}")
    logger.info("\nCleaning complete!")


if __name__ == "__main__":
    main()
