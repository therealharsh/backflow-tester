#!/usr/bin/env python3
"""
Advanced data cleaning for Backflow Testers directory.

Takes raw Outscraper Google Maps data and produces:
- clean_places.csv (high-quality, relevant businesses)
- rejected_places.csv (removed records with reasons)
- cleaning_report.md (detailed statistics)

Removal criteria:
1. Missing required fields (name, address, city, state, place_id)
2. Not OPERATIONAL business status
3. Quality threshold (reviews <= 3, or no rating + reviews <= 10)
4. Not a backflow testing business (95%+ confidence only)

Deduplication:
- Primary: place_id → keep best website → highest reviews → highest rating
"""

import argparse
import json
import logging
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse, unquote

import pandas as pd
import numpy as np


# Setup paths
DATA_DIR = Path(__file__).parent / "data"
RAW_CSV = DATA_DIR / "raw_places.csv"
CLEAN_CSV = DATA_DIR / "clean_places.csv"
REJECTED_CSV = DATA_DIR / "rejected_places.csv"
REPORT_MD = DATA_DIR / "cleaning_report.md"
LOG_FILE = DATA_DIR / "02_clean_places.log"

# Backflow-related keywords (positive signals)
BACKFLOW_KEYWORDS = {
    'backflow', 'back flow', 'rpz', 'cross connection', 'cross-connection',
    'backflow preventer', 'dcva', 'double check valve', 'pvb',
    'pressure vacuum breaker', 'tester certification', 'rpz testing',
    'backflow testing', 'backflow repair', 'backflow installation',
    'backflow service', 'backflow inspection', 'backflow certification'
}

# Booking/aggregator domains to deprioritize
BOOKING_DOMAINS = {
    'housecallpro.com', 'servicetitan.com', 'jobber.com', 'yelp.com',
    'angi.com', 'angieslist.com', 'homeadvisor.com', 'thumbtack.com',
    'porch.com', 'houzz.com', 'nextdoor.com', 'facebook.com'
}

# Categories/types that suggest backflow relevance
RELEVANT_TYPES = {
    'plumber', 'plumbing', 'irrigation', 'sprinkler', 'water testing',
    'fire protection', 'backflow', 'cross connection', 'rpz'
}

# Categories/types to remove (high confidence non-matches)
IRRELEVANT_TYPES = {
    'restaurant', 'grocery', 'retail', 'store', 'shop', 'mall',
    'school', 'hospital', 'hotel', 'apartment', 'lawyer', 'attorney',
    'dentist', 'doctor', 'clinic', 'pharmacy', 'bank', 'insurance',
    'real estate', 'car dealer', 'auto repair', 'gas station',
    'hair salon', 'nail salon', 'spa', 'gym', 'fitness'
}


def setup_logging():
    """Configure logging."""
    DATA_DIR.mkdir(exist_ok=True)

    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger

    # File handler
    fh = logging.FileHandler(LOG_FILE)
    fh.setLevel(logging.INFO)
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    fh.setFormatter(formatter)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(formatter)

    logger.addHandler(fh)
    logger.addHandler(ch)

    return logger


def extract_urls_from_list_string(s: str) -> List[str]:
    """Extract URLs from string that looks like a Python list."""
    if pd.isna(s) or not s:
        return []

    s = str(s).strip()

    # If it looks like a list string
    if s.startswith('[') and s.endswith(']'):
        # Extract URLs with regex
        urls = re.findall(r'https?://[^\s\'"]+', s)
        return urls

    # Otherwise treat as single URL
    return [s] if s else []


def normalize_website(url: Optional[str]) -> Dict[str, any]:
    """
    Normalize website URL and extract metadata.

    Returns dict with:
    - url: cleaned URL
    - domain: domain without www
    - is_booking: whether it's a booking aggregator
    - is_valid: whether URL is valid
    """
    result = {
        'url': None,
        'domain': None,
        'is_booking': False,
        'is_valid': False
    }

    if pd.isna(url) or not url or str(url).strip() == '':
        return result

    url = str(url).strip()

    # Handle list-like strings
    urls = extract_urls_from_list_string(url)
    if not urls:
        return result

    # Choose best URL (prefer non-booking)
    best_url = None
    for candidate in urls:
        try:
            parsed = urlparse(candidate if candidate.startswith('http') else 'https://' + candidate)
            domain = parsed.netloc.lower().replace('www.', '')

            if domain not in BOOKING_DOMAINS:
                best_url = candidate
                break
        except:
            continue

    # If all are booking sites, use first
    if not best_url:
        best_url = urls[0]

    # Normalize the chosen URL
    try:
        if not best_url.startswith(('http://', 'https://')):
            best_url = 'https://' + best_url

        # KEY FIX: decode percent-encoded characters FIRST.
        # Outscraper stores URLs like https://example.com/%3Futm_source%3Dgoogle
        # where %3F=? %26=& %3D== — decode so the param stripper can see them.
        best_url = unquote(best_url)

        parsed = urlparse(best_url)

        # Tracking params to strip
        TRACKING_PARAMS = {
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'utm_id', 'utm_source_platform',
            'fbclid', 'gclid', 'msclkid', '_ga', 'mc_cid', 'mc_eid',
            'ref', 'referrer', 'source',
        }

        # Remove tracking params
        if parsed.query:
            params = parse_qs(parsed.query, keep_blank_values=False)
            cleaned_params = {k: v for k, v in params.items() if k not in TRACKING_PARAMS}
            query = urlencode(cleaned_params, doseq=True) if cleaned_params else ''
        else:
            query = ''

        # Clean domain (strip www.)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]

        # Reconstruct — force https, no fragment, strip trailing slash
        scheme = 'https'
        path = parsed.path.rstrip('/') if parsed.path not in ('', '/') else ''

        clean_url = urlunparse((scheme, domain, path, '', query, ''))

        result['url'] = clean_url
        result['domain'] = domain
        result['is_booking'] = domain in BOOKING_DOMAINS
        result['is_valid'] = True

    except Exception:
        result['url'] = best_url
        result['is_valid'] = False

    return result


def calculate_backflow_relevance_score(row: pd.Series) -> float:
    """
    Calculate backflow relevance score (0-100).

    Higher score = more likely to be a backflow testing business.
    """
    score = 0.0

    # Collect text to search
    text_fields = [
        str(row.get('name', '')),
        str(row.get('about', '')),
        str(row.get('description', '')),
        str(row.get('reviews_tags', '')),
        str(row.get('category', '')),
        str(row.get('type', '')),
        str(row.get('subtypes', ''))
    ]
    text = ' '.join(text_fields).lower()

    # Keyword matching
    keyword_matches = sum(1 for kw in BACKFLOW_KEYWORDS if kw in text)
    score += keyword_matches * 10  # Each keyword worth 10 points

    # Name/URL bonus (strong signals)
    name_lower = str(row.get('name', '')).lower()
    website_lower = str(row.get('website', '')).lower()

    if 'backflow' in name_lower:
        score += 30
    if 'backflow' in website_lower:
        score += 20
    if 'rpz' in name_lower or 'cross connection' in name_lower:
        score += 25

    # Category/type matching
    category_text = (str(row.get('category', '')) + ' ' + str(row.get('subtypes', ''))).lower()

    if any(rt in category_text for rt in RELEVANT_TYPES):
        score += 15

    # Plumber is relevant if backflow mentioned
    if 'plumber' in category_text or 'plumbing' in category_text:
        if keyword_matches > 0:
            score += 20
        else:
            score += 5  # Plumber without backflow mention = weak signal

    # Penalty for clearly irrelevant types
    if any(it in text for it in IRRELEVANT_TYPES):
        score -= 50

    return min(100.0, max(0.0, score))


def check_removal_reason(row: pd.Series, idx: int, logger: logging.Logger) -> Optional[str]:
    """
    Check if row should be removed. Return reason code or None.

    Reason codes:
    - MISSING_REQUIRED: missing name/address/city/state/place_id
    - NOT_OPERATIONAL: business_status is not OPERATIONAL
    - LOW_QUALITY: reviews <= 3 OR (no rating AND reviews <= 10)
    - NOT_RELEVANT: not a backflow testing business (95%+ confidence)
    """

    # 1. Missing required fields
    required = ['name', 'address', 'city']

    # Need at least one state field
    has_state = False
    for state_col in ['state', 'state_code']:
        if state_col in row.index and pd.notna(row.get(state_col)) and str(row.get(state_col)).strip():
            has_state = True
            break

    # Need at least one ID field
    has_id = False
    for id_col in ['place_id', 'google_id', 'cid']:
        if id_col in row.index and pd.notna(row.get(id_col)) and str(row.get(id_col)).strip():
            has_id = True
            break

    # Check required fields
    for field in required:
        if field not in row.index or pd.isna(row.get(field)) or str(row.get(field)).strip() == '':
            return 'MISSING_REQUIRED'

    if not has_state:
        return 'MISSING_REQUIRED'

    if not has_id:
        return 'MISSING_REQUIRED'

    # 2. Business status
    status = str(row.get('business_status', '')).upper()
    name = str(row.get('name', '')).lower()

    if status and status != 'OPERATIONAL' and status != 'NAN':
        return 'NOT_OPERATIONAL'

    if 'permanently closed' in name or 'closed' in name:
        return 'NOT_OPERATIONAL'

    # 3. Quality threshold
    reviews = row.get('reviews', 0)
    rating = row.get('rating', None)

    try:
        reviews = int(reviews) if pd.notna(reviews) else 0
    except:
        reviews = 0

    try:
        rating = float(rating) if pd.notna(rating) else None
    except:
        rating = None

    # Remove if reviews <= 3
    if reviews <= 3:
        return 'LOW_QUALITY'

    # Remove if no rating AND reviews <= 10
    if rating is None and reviews <= 10:
        return 'LOW_QUALITY'

    # 4. Backflow relevance (only remove if 95%+ confident it's not relevant)
    relevance_score = calculate_backflow_relevance_score(row)

    # Only remove if score is very low (< 5)
    # This means we're 95%+ confident it's not relevant
    if relevance_score < 5:
        return 'NOT_RELEVANT'

    # Keep the row
    return None


def score_record_quality(row: pd.Series) -> float:
    """
    Score record quality for deduplication tiebreaking.

    Higher score = better record to keep.
    """
    score = 0.0

    # Website quality
    website = str(row.get('website', ''))
    website_norm = normalize_website(website)

    if website_norm['is_valid'] and not website_norm['is_booking']:
        score += 50  # Has real business website
    elif website_norm['is_valid'] and website_norm['is_booking']:
        score += 20  # Has booking site
    elif website and website != 'nan':
        score += 10  # Has something

    # Reviews count (normalized)
    try:
        reviews = int(row.get('reviews', 0)) if pd.notna(row.get('reviews')) else 0
        score += min(30, reviews / 10)  # Up to 30 points
    except:
        pass

    # Rating
    try:
        rating = float(row.get('rating', 0)) if pd.notna(row.get('rating')) else 0
        score += rating * 4  # Up to 20 points (5 * 4)
    except:
        pass

    # Has phone
    if pd.notna(row.get('phone')) and str(row.get('phone')).strip():
        score += 10

    # Backflow relevance
    score += calculate_backflow_relevance_score(row) * 0.3  # Up to 30 points

    return score


def deduplicate_records(df: pd.DataFrame, logger: logging.Logger) -> pd.DataFrame:
    """
    Deduplicate records, keeping the best version of each business.

    Deduplication keys (in order):
    1. place_id
    2. google_id
    3. normalized (name + street + postal_code)
    """
    logger.info("\nDeduplicating records...")

    initial_count = len(df)

    # Add quality score
    df['_quality_score'] = df.apply(score_record_quality, axis=1)

    # Dedupe by place_id
    if 'place_id' in df.columns:
        logger.info("  Deduping by place_id...")
        before = len(df)
        df = df.sort_values('_quality_score', ascending=False)
        df = df.drop_duplicates(subset=['place_id'], keep='first')
        after = len(df)
        logger.info(f"    Removed {before - after:,} duplicates by place_id")

    # Dedupe by google_id
    if 'google_id' in df.columns:
        logger.info("  Deduping by google_id...")
        before = len(df)
        df = df.sort_values('_quality_score', ascending=False)
        df = df.drop_duplicates(subset=['google_id'], keep='first')
        after = len(df)
        logger.info(f"    Removed {before - after:,} duplicates by google_id")

    # Dedupe by normalized name + address
    logger.info("  Deduping by normalized name + street + postal_code...")

    # Create normalized keys
    df['_norm_name'] = df['name'].astype(str).str.lower().str.strip()
    df['_norm_street'] = df.get('street', df.get('address', '')).astype(str).str.lower().str.strip()
    df['_norm_zip'] = df.get('postal_code', '').astype(str).str.strip()

    before = len(df)
    df = df.sort_values('_quality_score', ascending=False)
    df = df.drop_duplicates(subset=['_norm_name', '_norm_street', '_norm_zip'], keep='first')
    after = len(df)
    logger.info(f"    Removed {before - after:,} duplicates by name+street+zip")

    # Clean up temporary columns
    df = df.drop(columns=['_quality_score', '_norm_name', '_norm_street', '_norm_zip'])

    total_removed = initial_count - len(df)
    logger.info(f"  Total duplicates removed: {total_removed:,}")

    return df


def add_computed_fields(df: pd.DataFrame, logger: logging.Logger) -> pd.DataFrame:
    """Add computed/normalized fields."""
    logger.info("\nAdding computed fields...")

    # Website normalization
    logger.info("  Normalizing websites...")
    website_data = df.get('website', pd.Series()).apply(normalize_website)

    df['website_clean'] = website_data.apply(lambda x: x['url'])
    df['website_domain'] = website_data.apply(lambda x: x['domain'])
    df['website_is_booking'] = website_data.apply(lambda x: x['is_booking'])
    df['website_missing'] = df['website_clean'].isna()

    valid_websites = df['website_clean'].notna().sum()
    booking_websites = df['website_is_booking'].sum()
    logger.info(f"    Valid websites: {valid_websites:,}")
    logger.info(f"    Booking sites: {booking_websites:,}")

    # Backflow relevance score
    logger.info("  Calculating backflow relevance scores...")
    df['backflow_score'] = df.apply(calculate_backflow_relevance_score, axis=1)

    avg_score = df['backflow_score'].mean()
    logger.info(f"    Average relevance score: {avg_score:.1f}")

    # Normalize state
    if 'state_code' in df.columns and 'state' in df.columns:
        df['state'] = df['state_code'].fillna(df['state'])
    elif 'state_code' in df.columns:
        df['state'] = df['state_code']

    return df


def generate_report(
    raw_count: int,
    clean_count: int,
    rejected_count: int,
    rejection_reasons: Counter,
    clean_df: pd.DataFrame,
    output_path: Path,
    logger: logging.Logger
):
    """Generate cleaning report markdown."""
    logger.info(f"\nGenerating report: {output_path}")

    lines = []
    lines.append("# Data Cleaning Report")
    lines.append("")
    lines.append(f"**Generated**: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # Summary
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Input records**: {raw_count:,}")
    lines.append(f"- **Clean records**: {clean_count:,}")
    lines.append(f"- **Rejected records**: {rejected_count:,}")
    lines.append(f"- **Acceptance rate**: {clean_count/raw_count*100:.1f}%")
    lines.append("")

    # Rejection reasons
    lines.append("## Rejection Reasons")
    lines.append("")
    lines.append("| Reason | Count | % of Rejected |")
    lines.append("|--------|-------|---------------|")

    for reason, count in rejection_reasons.most_common():
        pct = count / rejected_count * 100 if rejected_count > 0 else 0
        lines.append(f"| {reason} | {count:,} | {pct:.1f}% |")

    lines.append("")

    # Data quality
    lines.append("## Data Quality (Clean Records)")
    lines.append("")

    website_count = clean_df['website_clean'].notna().sum()
    phone_count = clean_df.get('phone', pd.Series()).notna().sum()
    rating_count = clean_df.get('rating', pd.Series()).notna().sum()

    lines.append(f"- **With website**: {website_count:,} ({website_count/clean_count*100:.1f}%)")
    lines.append(f"- **With phone**: {phone_count:,} ({phone_count/clean_count*100:.1f}%)")
    lines.append(f"- **With rating**: {rating_count:,} ({rating_count/clean_count*100:.1f}%)")
    lines.append("")

    # Backflow relevance scores
    lines.append("## Backflow Relevance Scores")
    lines.append("")
    lines.append(f"- **Average**: {clean_df['backflow_score'].mean():.1f}")
    lines.append(f"- **Median**: {clean_df['backflow_score'].median():.1f}")
    lines.append(f"- **Min**: {clean_df['backflow_score'].min():.1f}")
    lines.append(f"- **Max**: {clean_df['backflow_score'].max():.1f}")
    lines.append("")

    score_bins = pd.cut(clean_df['backflow_score'], bins=[0, 25, 50, 75, 100], labels=['Low', 'Medium', 'High', 'Very High'])
    score_dist = score_bins.value_counts().sort_index()

    lines.append("### Score Distribution")
    lines.append("")
    for label, count in score_dist.items():
        lines.append(f"- **{label}** (score range): {count:,} ({count/clean_count*100:.1f}%)")
    lines.append("")

    # Top cities
    lines.append("## Top 20 Cities")
    lines.append("")
    lines.append("| City | State | Count |")
    lines.append("|------|-------|-------|")

    if 'city' in clean_df.columns and 'state' in clean_df.columns:
        city_state = clean_df.groupby(['city', 'state']).size().sort_values(ascending=False).head(20)
        for (city, state), count in city_state.items():
            lines.append(f"| {city} | {state} | {count:,} |")

    lines.append("")

    # Top categories
    lines.append("## Top 20 Categories/Types")
    lines.append("")

    if 'category' in clean_df.columns:
        # Split multi-value categories
        all_cats = []
        for cats in clean_df['category'].dropna():
            cats_str = str(cats)
            if ',' in cats_str:
                all_cats.extend([c.strip() for c in cats_str.split(',')])
            else:
                all_cats.append(cats_str)

        cat_counts = Counter(all_cats)

        lines.append("| Category | Count |")
        lines.append("|----------|-------|")

        for cat, count in cat_counts.most_common(20):
            if cat and cat != 'nan':
                lines.append(f"| {cat} | {count:,} |")

    lines.append("")

    # Website domains
    lines.append("## Top 15 Website Domains")
    lines.append("")

    if 'website_domain' in clean_df.columns:
        domain_counts = clean_df['website_domain'].value_counts().head(15)

        lines.append("| Domain | Count |")
        lines.append("|--------|-------|")

        for domain, count in domain_counts.items():
            if domain and domain != 'nan':
                lines.append(f"| {domain} | {count:,} |")

    lines.append("")

    # Save report
    with open(output_path, 'w') as f:
        f.write('\n'.join(lines))

    logger.info(f"  Report saved: {output_path}")


def main():
    """Main execution."""
    parser = argparse.ArgumentParser(description='Clean and deduplicate Outscraper data')
    parser.add_argument('--input', default=str(RAW_CSV), help='Input raw CSV')
    parser.add_argument('--output', default=str(CLEAN_CSV), help='Output clean CSV')
    parser.add_argument('--rejected', default=str(REJECTED_CSV), help='Output rejected CSV')
    parser.add_argument('--report', default=str(REPORT_MD), help='Output report markdown')
    parser.add_argument('--min-reviews', type=int, default=3, help='Minimum reviews threshold')

    args = parser.parse_args()

    logger = setup_logging()

    logger.info("=" * 70)
    logger.info("BACKFLOW TESTERS DIRECTORY - DATA CLEANING")
    logger.info("=" * 70)

    # Load data
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    logger.info(f"\nLoading data from: {input_path}")

    try:
        # Handle CSV parsing errors
        try:
            df = pd.read_csv(input_path, low_memory=False, on_bad_lines='skip')
        except TypeError:
            df = pd.read_csv(input_path, low_memory=False, error_bad_lines=False, warn_bad_lines=True)
    except Exception as e:
        logger.error(f"Failed to load CSV: {e}")
        sys.exit(1)

    raw_count = len(df)
    logger.info(f"Loaded {raw_count:,} raw records")
    logger.info(f"Columns: {len(df.columns)}")

    # Process removals
    logger.info("\nChecking removal criteria...")

    rejected_rows = []
    rejection_reasons = Counter()

    for idx, row in df.iterrows():
        reason = check_removal_reason(row, idx, logger)
        if reason:
            rejected_rows.append({
                **row.to_dict(),
                'rejection_reason': reason
            })
            rejection_reasons[reason] += 1

    logger.info(f"\nRejection summary:")
    for reason, count in rejection_reasons.most_common():
        logger.info(f"  {reason}: {count:,} ({count/raw_count*100:.1f}%)")

    # Create clean dataframe
    rejected_indices = [r['place_id'] if 'place_id' in r else r.get('google_id', idx)
                       for idx, r in enumerate(rejected_rows)]

    # Filter to keep only non-rejected
    clean_df = df[~df.index.isin([i for i, r in enumerate(rejected_rows)])].copy()

    logger.info(f"\nAfter removals: {len(clean_df):,} records")

    # Add computed fields
    clean_df = add_computed_fields(clean_df, logger)

    # Deduplicate
    clean_df = deduplicate_records(clean_df, logger)

    logger.info(f"\nAfter deduplication: {len(clean_df):,} records")

    # Sort by quality
    logger.info("\nSorting by quality (backflow score + reviews)...")
    clean_df['_sort_score'] = clean_df['backflow_score'] + clean_df.get('reviews', 0).fillna(0) / 10
    clean_df = clean_df.sort_values('_sort_score', ascending=False)
    clean_df = clean_df.drop(columns=['_sort_score'])

    # Save outputs
    logger.info("\nSaving outputs...")

    # Clean CSV
    clean_output = Path(args.output)
    clean_df.to_csv(clean_output, index=False)
    logger.info(f"  Clean records: {clean_output} ({len(clean_df):,} records)")

    # Rejected CSV
    if rejected_rows:
        rejected_df = pd.DataFrame(rejected_rows)
        rejected_output = Path(args.rejected)
        rejected_df.to_csv(rejected_output, index=False)
        logger.info(f"  Rejected records: {rejected_output} ({len(rejected_rows):,} records)")

    # Report
    generate_report(
        raw_count=raw_count,
        clean_count=len(clean_df),
        rejected_count=len(rejected_rows),
        rejection_reasons=rejection_reasons,
        clean_df=clean_df,
        output_path=Path(args.report),
        logger=logger
    )

    # Final summary
    logger.info("\n" + "=" * 70)
    logger.info("CLEANING COMPLETE")
    logger.info("=" * 70)
    logger.info(f"Input: {raw_count:,} records")
    logger.info(f"Output: {len(clean_df):,} clean records")
    logger.info(f"Rejected: {len(rejected_rows):,} records")
    logger.info(f"Acceptance rate: {len(clean_df)/raw_count*100:.1f}%")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
