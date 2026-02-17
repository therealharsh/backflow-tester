#!/usr/bin/env python3
"""
Crawl4AI-based website verifier for backflow testing directory.

Crawls provider websites to verify they actually offer backflow services.
Uses intelligent two-pass strategy:
1. Homepage crawl (fast)
2. Internal pages crawl (if homepage doesn't match)

Outputs:
- verified.csv (businesses that mention backflow services)
- rejected_by_verifier.csv (no website or no backflow mention)
- verifier_report.md (statistics and analysis)
- verifier_state.json (checkpoint for resume)
"""

import argparse
import asyncio
import json
import logging
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse, urljoin

import pandas as pd
import numpy as np
from tqdm import tqdm

try:
    from crawl4ai import AsyncWebCrawler
    from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy
except ImportError:
    print("ERROR: crawl4ai not installed. Install with:")
    print("  pip install crawl4ai")
    print("  playwright install")
    sys.exit(1)


# Paths
DATA_DIR = Path(__file__).parent / "data"
INPUT_CSV = DATA_DIR / "clean_places.csv"
VERIFIED_CSV = DATA_DIR / "verified.csv"
REJECTED_CSV = DATA_DIR / "rejected_by_verifier.csv"
REPORT_MD = DATA_DIR / "verifier_report.md"
STATE_JSON = DATA_DIR / "verifier_state.json"
LOG_FILE = DATA_DIR / "verifier.log"

# Backflow terms with weights
BACKFLOW_TERMS = {
    # High value terms (exact service names)
    'backflow testing': 3,
    'backflow tester': 3,
    'backflow test': 3,
    'backflow inspection': 2,
    'backflow preventer': 2,
    'backflow prevention': 2,
    'backflow installation': 2,
    'backflow repair': 2,
    'backflow service': 2,
    'backflow certification': 2,
    'backflow certified': 2,

    # Medium value terms
    'cross connection': 1,
    'cross-connection': 1,
    'cross connection control': 2,
    'rpz': 1,
    'rpz testing': 2,
    'reduced pressure zone': 1,
    'reduced pressure': 1,
    'dcva': 1,
    'double check valve': 1,
    'double-check valve': 1,
    'pvb': 1,
    'pressure vacuum breaker': 1,

    # Context terms (lower value)
    'backflow': 1,
    'back flow': 1,
    'irrigation backflow': 2,
    'sprinkler backflow': 2,
    'test report': 1,
    'annual test': 1,
}

# Terms that firmly indicate active backflow *testing* (not just service/repair)
TESTING_TIER_TERMS = {
    'backflow testing', 'backflow tester', 'backflow test',
    'rpz testing', 'backflow inspection', 'backflow certification',
    'backflow certified', 'annual backflow test', 'test report',
    'cross connection control',
}

# Default score thresholds
TIER_TESTING_DEFAULT = 4   # score >= 4 AND a testing term matched
TIER_SERVICE_DEFAULT = 2   # score >= 2 (mentions backflow/rpz etc.)


def assign_tier(score: int, matched_terms: List[str], testing_threshold: int) -> str:
    """
    Classify a verified business into a tier.

    Tiers (written into the 'tier' column):
      testing  – explicitly offers backflow *testing* / certification
                 (score >= testing_threshold AND a TESTING_TIER_TERMS match)
      service  – mentions backflow but not confirmed testing
                 (score >= general threshold but below testing tier)
      none     – below general threshold (should not appear in verified.csv)
    """
    has_testing_term = any(t in TESTING_TIER_TERMS for t in matched_terms)
    if score >= testing_threshold and has_testing_term:
        return 'testing'
    elif score >= TIER_SERVICE_DEFAULT:
        return 'service'
    return 'none'


# Service page indicators
SERVICE_PAGE_INDICATORS = {
    'backflow', 'rpz', 'cross', 'service', 'services',
    'plumbing', 'testing', 'preventer', 'irrigation',
    'sprinkler', 'prevention', 'repair', 'installation'
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


def normalize_url(url: str) -> Optional[str]:
    """Normalize URL for crawling."""
    if pd.isna(url) or not url or str(url).strip() == '':
        return None

    url = str(url).strip()

    # Add protocol if missing
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            return None
        return url
    except:
        return None


def extract_domain(url: str) -> Optional[str]:
    """Extract domain from URL."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except:
        return None


def is_same_domain(url1: str, url2: str) -> bool:
    """Check if two URLs are from the same domain."""
    d1 = extract_domain(url1)
    d2 = extract_domain(url2)
    return d1 and d2 and d1 == d2


def score_text(text: str, logger: logging.Logger) -> Tuple[int, List[str]]:
    """
    Score text for backflow relevance.

    Returns:
        (score, list of matched terms)
    """
    if not text:
        return 0, []

    text_lower = text.lower()

    matched_terms = []
    score = 0

    # Check each term
    for term, weight in BACKFLOW_TERMS.items():
        if term in text_lower:
            matched_terms.append(term)
            score += weight

    # Cap score at 10
    score = min(10, score)

    return score, list(set(matched_terms))


def extract_internal_links(
    html: str,
    base_url: str,
    max_links: int = 10
) -> List[Tuple[str, str]]:
    """
    Extract internal links from HTML that might be service pages.

    Returns:
        List of (url, anchor_text) tuples
    """
    from bs4 import BeautifulSoup

    try:
        soup = BeautifulSoup(html, 'html.parser')
    except:
        return []

    links = []
    base_domain = extract_domain(base_url)

    for a in soup.find_all('a', href=True):
        href = a['href']
        anchor = a.get_text(strip=True).lower()

        # Build absolute URL
        try:
            abs_url = urljoin(base_url, href)
        except:
            continue

        # Skip if different domain
        if not is_same_domain(base_url, abs_url):
            continue

        # Skip if same as base
        if abs_url.rstrip('/') == base_url.rstrip('/'):
            continue

        # Check if URL or anchor suggests service page
        url_lower = abs_url.lower()
        relevance_score = 0

        for indicator in SERVICE_PAGE_INDICATORS:
            if indicator in url_lower:
                relevance_score += 2
            if indicator in anchor:
                relevance_score += 1

        if relevance_score > 0:
            links.append((abs_url, anchor, relevance_score))

    # Sort by relevance and return top N
    links.sort(key=lambda x: x[2], reverse=True)
    return [(url, anchor) for url, anchor, _ in links[:max_links]]


async def crawl_url(
    crawler: AsyncWebCrawler,
    url: str,
    timeout: int,
    logger: logging.Logger
) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
    """
    Crawl a single URL.

    Returns:
        (success, text, html, error_msg)
    """
    try:
        result = await crawler.arun(
            url=url,
            bypass_cache=True,
            word_count_threshold=10,
            page_timeout=timeout * 1000,  # milliseconds
        )

        if result.success:
            # Extract text (prefer markdown)
            text = result.markdown or result.cleaned_html or ""
            html = result.html or ""
            return True, text, html, None
        else:
            return False, None, None, result.error_message or "Unknown error"

    except asyncio.TimeoutError:
        return False, None, None, "Timeout"
    except Exception as e:
        return False, None, None, str(e)


async def verify_website(
    row: pd.Series,
    crawler: AsyncWebCrawler,
    max_pages: int,
    threshold: int,
    testing_threshold: int,
    timeout: int,
    logger: logging.Logger
) -> Dict:
    """
    Verify a single business website.

    Returns dict with verification results.
    """
    result = {
        'place_id': row.get('place_id', ''),
        'name': row.get('name', ''),
        'website': row.get('website', ''),
        'backflow_score': 0,
        'backflow_hits': '',
        'verified_at': datetime.utcnow().isoformat(),
        'crawl_status': 'OK',
        'crawl_error': '',
        'pages_crawled': 0,
        'matched_on': '',
        'best_evidence_url': '',
        'tier': 'none',
    }

    website = normalize_url(row.get('website', ''))

    if not website:
        result['crawl_status'] = 'NO_WEBSITE'
        return result

    all_matched_terms = set()
    best_score = 0
    best_url = website

    # Pass 1: Crawl homepage
    logger.info(f"  Crawling homepage: {website}")

    success, text, html, error = await crawl_url(crawler, website, timeout, logger)

    if not success:
        result['crawl_status'] = 'CRAWL_FAILED'
        result['crawl_error'] = error or 'Unknown error'
        result['tier'] = 'none'
        logger.warning(f"    Failed: {error}")
        return result

    result['pages_crawled'] = 1

    # Score homepage
    score, matched = score_text(text, logger)

    if score > best_score:
        best_score = score
        best_url = website

    all_matched_terms.update(matched)

    logger.info(f"    Homepage score: {score} (matches: {len(matched)})")

    # If homepage score meets threshold, done
    if score >= threshold:
        result['backflow_score'] = score
        result['backflow_hits'] = '|'.join(sorted(all_matched_terms))
        result['matched_on'] = 'HOMEPAGE'
        result['best_evidence_url'] = best_url
        result['tier'] = assign_tier(score, list(all_matched_terms), testing_threshold)
        logger.info(f"    ✓ Verified on homepage (score: {score}, tier: {result['tier']})")
        return result

    # Pass 2: Crawl internal pages if needed
    if max_pages > 1 and html:
        logger.info(f"    Homepage insufficient (score: {score}), crawling internal pages...")

        internal_links = extract_internal_links(html, website, max_links=max_pages - 1)

        if internal_links:
            logger.info(f"    Found {len(internal_links)} potential service pages")

            # Crawl internal pages
            for i, (url, anchor) in enumerate(internal_links[:max_pages - 1]):
                logger.info(f"      [{i+1}] {url} ('{anchor[:50]}')")

                success, text, _, error = await crawl_url(crawler, url, timeout, logger)

                if not success:
                    logger.warning(f"        Failed: {error}")
                    continue

                result['pages_crawled'] += 1

                # Score this page
                page_score, page_matched = score_text(text, logger)

                if page_score > 0:
                    all_matched_terms.update(page_matched)
                    logger.info(f"        Score: {page_score} (matches: {len(page_matched)})")

                    if page_score > best_score:
                        best_score = page_score
                        best_url = url

                # Early exit if we have enough evidence
                if best_score >= threshold * 2:
                    logger.info(f"        ✓ Strong evidence found, stopping")
                    break

        # Calculate final score from all pages
        # Use best score (not sum, to avoid inflating from repetition)
        result['backflow_score'] = best_score
        result['backflow_hits'] = '|'.join(sorted(all_matched_terms))

        if best_score >= threshold:
            result['matched_on'] = 'BOTH' if score > 0 else 'INTERNAL'
            result['best_evidence_url'] = best_url
            result['tier'] = assign_tier(best_score, list(all_matched_terms), testing_threshold)
            logger.info(f"    ✓ Verified on internal pages (score: {best_score}, tier: {result['tier']})")
        else:
            result['crawl_status'] = 'NOT_RELEVANT'
            result['tier'] = 'none'
            logger.info(f"    ✗ No sufficient evidence (score: {best_score})")
    else:
        # No internal pages to crawl
        result['backflow_score'] = score
        result['backflow_hits'] = '|'.join(sorted(all_matched_terms))
        result['crawl_status'] = 'NOT_RELEVANT'
        result['matched_on'] = 'HOMEPAGE'
        result['best_evidence_url'] = website
        result['tier'] = 'none'
        logger.info(f"    ✗ Homepage only, insufficient (score: {score})")

    return result


async def process_batch(
    batch_df: pd.DataFrame,
    batch_num: int,
    max_pages: int,
    threshold: int,
    testing_threshold: int,
    timeout: int,
    logger: logging.Logger
) -> List[Dict]:
    """Process a batch of websites concurrently."""

    logger.info(f"\nBatch {batch_num}: Processing {len(batch_df)} websites")

    results = []

    async with AsyncWebCrawler(verbose=False) as crawler:
        for idx, row in batch_df.iterrows():
            name = row.get('name', 'Unknown')
            website = row.get('website', '')

            logger.info(f"\n[{idx}] {name}")

            result = await verify_website(
                row=row,
                crawler=crawler,
                max_pages=max_pages,
                threshold=threshold,
                testing_threshold=testing_threshold,
                timeout=timeout,
                logger=logger
            )

            # Merge with original row data
            full_result = {**row.to_dict(), **result}
            results.append(full_result)

    return results


def load_checkpoint(logger: logging.Logger) -> Dict:
    """Load checkpoint state."""
    if STATE_JSON.exists():
        try:
            with open(STATE_JSON, 'r') as f:
                state = json.load(f)
            logger.info(f"Loaded checkpoint: processed {state.get('processed_count', 0)} records")
            return state
        except Exception as e:
            logger.warning(f"Failed to load checkpoint: {e}")

    return {
        'processed_count': 0,
        'verified_count': 0,
        'rejected_count': 0,
        'last_processed_index': -1,
        'processed_place_ids': []
    }


def save_checkpoint(state: Dict, logger: logging.Logger):
    """Save checkpoint state."""
    try:
        with open(STATE_JSON, 'w') as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save checkpoint: {e}")


def generate_report(
    input_count: int,
    verified_df: pd.DataFrame,
    rejected_df: pd.DataFrame,
    output_path: Path,
    logger: logging.Logger
):
    """Generate verification report."""

    logger.info(f"\nGenerating report: {output_path}")

    lines = []
    lines.append("# Website Verification Report")
    lines.append("")
    lines.append(f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # Summary
    verified_count = len(verified_df)
    rejected_count = len(rejected_df)
    total_processed = verified_count + rejected_count

    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Input records**: {input_count:,}")
    lines.append(f"- **Processed**: {total_processed:,}")
    lines.append(f"- **Verified (kept)**: {verified_count:,} ({verified_count/total_processed*100:.1f}%)")
    lines.append(f"- **Rejected**: {rejected_count:,} ({rejected_count/total_processed*100:.1f}%)")
    lines.append("")

    # Crawl status breakdown
    lines.append("## Crawl Status Breakdown")
    lines.append("")

    all_df = pd.concat([verified_df, rejected_df], ignore_index=True)
    status_counts = all_df['crawl_status'].value_counts()

    lines.append("| Status | Count | % of Total |")
    lines.append("|--------|-------|------------|")

    for status, count in status_counts.items():
        pct = count / total_processed * 100
        lines.append(f"| {status} | {count:,} | {pct:.1f}% |")

    lines.append("")

    # Score distribution (verified only)
    if verified_count > 0:
        lines.append("## Backflow Score Distribution (Verified)")
        lines.append("")

        scores = verified_df['backflow_score'].value_counts().sort_index()

        lines.append("| Score | Count |")
        lines.append("|-------|-------|")

        for score, count in scores.items():
            lines.append(f"| {score} | {count:,} |")

        lines.append("")
        lines.append(f"- **Average score**: {verified_df['backflow_score'].mean():.1f}")
        lines.append(f"- **Median score**: {verified_df['backflow_score'].median():.1f}")
        lines.append(f"- **Max score**: {verified_df['backflow_score'].max():.0f}")
        lines.append("")

    # Matched terms frequency
    if verified_count > 0:
        lines.append("## Top 20 Matched Terms")
        lines.append("")

        all_terms = []
        for hits in verified_df['backflow_hits'].dropna():
            if hits:
                all_terms.extend(str(hits).split('|'))

        term_counts = Counter(all_terms)

        lines.append("| Term | Count |")
        lines.append("|------|-------|")

        for term, count in term_counts.most_common(20):
            lines.append(f"| {term} | {count:,} |")

        lines.append("")

    # Tier breakdown
    if verified_count > 0 and 'tier' in verified_df.columns:
        lines.append("## Tier Breakdown (Verified)")
        lines.append("")
        tier_counts = verified_df['tier'].value_counts()
        lines.append("| Tier | Count | % of Verified |")
        lines.append("|------|-------|---------------|")
        for tier, count in tier_counts.items():
            lines.append(f"| {tier} | {count:,} | {count/verified_count*100:.1f}% |")
        lines.append("")
        lines.append("**Tier definitions:**")
        lines.append("- `testing` – website explicitly mentions backflow *testing*, certification, or RPZ testing")
        lines.append("- `service`  – website mentions backflow but not confirmed active testing")
        lines.append("")

    # Matched on breakdown
    if verified_count > 0:
        lines.append("## Evidence Location")
        lines.append("")

        matched_on_counts = verified_df['matched_on'].value_counts()

        lines.append("| Location | Count |")
        lines.append("|----------|-------|")

        for loc, count in matched_on_counts.items():
            lines.append(f"| {loc} | {count:,} |")

        lines.append("")

    # Pages crawled stats
    lines.append("## Crawling Efficiency")
    lines.append("")

    pages_stats = all_df['pages_crawled'].describe()

    lines.append(f"- **Average pages per site**: {pages_stats['mean']:.1f}")
    lines.append(f"- **Max pages crawled**: {pages_stats['max']:.0f}")
    lines.append(f"- **Total pages crawled**: {all_df['pages_crawled'].sum():,.0f}")
    lines.append("")

    # Top cities (verified)
    if verified_count > 0 and 'city' in verified_df.columns:
        lines.append("## Top 15 Cities (Verified)")
        lines.append("")

        city_counts = verified_df['city'].value_counts().head(15)

        lines.append("| City | Count |")
        lines.append("|------|-------|")

        for city, count in city_counts.items():
            lines.append(f"| {city} | {count:,} |")

        lines.append("")

    # Top categories (verified)
    if verified_count > 0 and 'category' in verified_df.columns:
        lines.append("## Top 15 Categories (Verified)")
        lines.append("")

        all_cats = []
        for cats in verified_df['category'].dropna():
            cats_str = str(cats)
            if ',' in cats_str:
                all_cats.extend([c.strip() for c in cats_str.split(',')])
            else:
                all_cats.append(cats_str)

        cat_counts = Counter(all_cats)

        lines.append("| Category | Count |")
        lines.append("|----------|-------|")

        for cat, count in cat_counts.most_common(15):
            if cat and cat != 'nan':
                lines.append(f"| {cat} | {count:,} |")

        lines.append("")

    # Save report
    with open(output_path, 'w') as f:
        f.write('\n'.join(lines))

    logger.info(f"  Report saved: {output_path}")


async def main_async(args, logger):
    """Main async execution."""

    # Load input
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    logger.info(f"Loading data from: {input_path}")
    df = pd.read_csv(input_path, low_memory=False)

    input_count = len(df)
    logger.info(f"Loaded {input_count:,} records")

    # Filter to only rows with websites (if requested)
    if args.only_with_website:
        df = df[df['website'].notna() & (df['website'] != '')]
        logger.info(f"Filtered to {len(df):,} records with websites")

    # Load checkpoint
    state = {}
    if args.resume:
        state = load_checkpoint(logger)
        processed_ids = set(state.get('processed_place_ids', []))

        # Filter out already processed
        if processed_ids:
            df = df[~df['place_id'].isin(processed_ids)]
            logger.info(f"Resuming: {len(df):,} records remaining")
    else:
        state = {
            'processed_count': 0,
            'verified_count': 0,
            'rejected_count': 0,
            'processed_place_ids': []
        }

    if len(df) == 0:
        logger.info("No records to process!")
        return

    # Process in batches
    verified_results = []
    rejected_results = []

    total_batches = (len(df) + args.batch_size - 1) // args.batch_size

    logger.info("")
    logger.info("=" * 70)
    logger.info("STARTING WEBSITE VERIFICATION")
    logger.info("=" * 70)
    logger.info(f"Total records: {len(df):,}")
    logger.info(f"Batch size: {args.batch_size}")
    logger.info(f"Max pages per site: {args.max_pages}")
    logger.info(f"Score threshold: {args.threshold}")
    logger.info(f"Testing tier threshold: {args.testing_threshold}")
    logger.info(f"Total batches: {total_batches}")
    logger.info("=" * 70)

    for i in range(0, len(df), args.batch_size):
        batch_df = df.iloc[i:i + args.batch_size]
        batch_num = i // args.batch_size + 1

        # Process batch
        batch_results = await process_batch(
            batch_df=batch_df,
            batch_num=batch_num,
            max_pages=args.max_pages,
            threshold=args.threshold,
            testing_threshold=args.testing_threshold,
            timeout=args.timeout,
            logger=logger
        )

        # Separate verified vs rejected
        for result in batch_results:
            if result['crawl_status'] == 'OK' and result['backflow_score'] >= args.threshold:
                verified_results.append(result)
                state['verified_count'] += 1
                # Track tier counts
                tier = result.get('tier', 'service')
                state['testing_count'] = state.get('testing_count', 0) + (1 if tier == 'testing' else 0)
                state['service_count'] = state.get('service_count', 0) + (1 if tier == 'service' else 0)
            else:
                rejected_results.append(result)
                state['rejected_count'] += 1

            state['processed_count'] += 1
            state['processed_place_ids'].append(result.get('place_id', ''))

        # Save checkpoint
        save_checkpoint(state, logger)

        logger.info(f"\nBatch {batch_num}/{total_batches} complete")
        logger.info(f"  Verified so far: {state['verified_count']:,}"
                    f" (testing: {state.get('testing_count',0):,}"
                    f", service: {state.get('service_count',0):,})")
        logger.info(f"  Rejected so far: {state['rejected_count']:,}")

        # Rate limiting
        if i + args.batch_size < len(df):
            await asyncio.sleep(args.sleep)

    # Save results
    logger.info("\n" + "=" * 70)
    logger.info("SAVING RESULTS")
    logger.info("=" * 70)

    if verified_results:
        verified_df = pd.DataFrame(verified_results)
        verified_df.to_csv(VERIFIED_CSV, index=False)
        logger.info(f"Verified: {VERIFIED_CSV} ({len(verified_results):,} records)")
    else:
        logger.warning("No verified records!")
        verified_df = pd.DataFrame()

    if rejected_results:
        rejected_df = pd.DataFrame(rejected_results)
        rejected_df.to_csv(REJECTED_CSV, index=False)
        logger.info(f"Rejected: {REJECTED_CSV} ({len(rejected_results):,} records)")
    else:
        rejected_df = pd.DataFrame()

    # Generate report
    if verified_results or rejected_results:
        generate_report(
            input_count=input_count,
            verified_df=verified_df,
            rejected_df=rejected_df,
            output_path=REPORT_MD,
            logger=logger
        )

    # Final summary
    total = state['processed_count']
    logger.info("\n" + "=" * 70)
    logger.info("VERIFICATION COMPLETE")
    logger.info("=" * 70)
    logger.info(f"Total processed:   {total:,}")
    logger.info(f"Verified (kept):   {state['verified_count']:,} ({state['verified_count']/total*100:.1f}%)")
    logger.info(f"  ↳ tier=testing:  {state.get('testing_count', 0):,}")
    logger.info(f"  ↳ tier=service:  {state.get('service_count', 0):,}")
    logger.info(f"Rejected:          {state['rejected_count']:,} ({state['rejected_count']/total*100:.1f}%)")
    logger.info("=" * 70)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Verify backflow services by crawling provider websites'
    )
    parser.add_argument(
        '--input',
        default=str(INPUT_CSV),
        help='Input CSV file'
    )
    parser.add_argument(
        '--output',
        default=str(VERIFIED_CSV),
        help='Output verified CSV file'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=25,
        help='Number of websites per batch (default: 25)'
    )
    parser.add_argument(
        '--max-pages',
        type=int,
        default=4,
        help='Max pages to crawl per site (default: 4)'
    )
    parser.add_argument(
        '--threshold',
        type=int,
        default=2,
        help='Minimum backflow score to keep (default: 2)'
    )
    parser.add_argument(
        '--timeout',
        type=int,
        default=60,
        help='Per-page timeout in seconds (default: 60)'
    )
    parser.add_argument(
        '--sleep',
        type=float,
        default=0.3,
        help='Sleep between batches in seconds (default: 0.3)'
    )
    parser.add_argument(
        '--resume',
        action='store_true',
        help='Resume from checkpoint'
    )
    parser.add_argument(
        '--only-with-website',
        action='store_true',
        help='Only process records with websites'
    )
    parser.add_argument(
        '--testing-threshold',
        type=int,
        default=TIER_TESTING_DEFAULT,
        help=f'Min score required for tier=testing (default: {TIER_TESTING_DEFAULT}). '
             'Must also match a testing-specific term.'
    )

    args = parser.parse_args()

    logger = setup_logging()

    # Run async main
    asyncio.run(main_async(args, logger))


if __name__ == "__main__":
    main()
