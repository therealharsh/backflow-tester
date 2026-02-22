#!/usr/bin/env python3
"""
Step 3: Crawl4AI-based website verifier & enricher for backflow testing directory.

Crawls provider websites to:
1. Verify they actually offer backflow services (two-pass: homepage + internal pages)
2. Extract service tags, service area, description, and booking URLs

Outputs:
- verified.csv (businesses that mention backflow services, with enrichment)
- rejected_by_verifier.csv (no site, unreachable, no backflow evidence)
- verifier_report.md (statistics)
- verifier_state.json (checkpoint for resume)

Usage:
    python crawler/03_verify_and_enrich.py
    python crawler/03_verify_and_enrich.py --resume
    python crawler/03_verify_and_enrich.py --batch-size 10 --max-pages 3
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

# ── Backflow verification terms with weights ─────────────────────────────────

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

TESTING_TIER_TERMS = {
    'backflow testing', 'backflow tester', 'backflow test',
    'rpz testing', 'backflow inspection', 'backflow certification',
    'backflow certified', 'annual backflow test', 'test report',
    'cross connection control',
}

TIER_TESTING_DEFAULT = 4
TIER_SERVICE_DEFAULT = 2

# ── Service tag extraction ────────────────────────────────────────────────────

# Maps canonical service tags to trigger phrases found in website text
SERVICE_TAG_TRIGGERS = {
    'Backflow Testing': [
        'backflow testing', 'backflow test', 'backflow tester',
        'backflow inspection', 'annual backflow',
    ],
    'RPZ Testing': [
        'rpz testing', 'rpz test', 'rpz inspection', 'rpz valve',
        'reduced pressure zone', 'rp assembly',
    ],
    'DCVA Testing': [
        'dcva testing', 'dcva test', 'double check valve',
        'double-check valve', 'dc assembly',
    ],
    'PVB Testing': [
        'pvb testing', 'pvb test', 'pressure vacuum breaker',
    ],
    'Preventer Installation': [
        'backflow installation', 'preventer installation', 'install backflow',
        'backflow device installation', 'assembly installation',
    ],
    'Preventer Repair': [
        'backflow repair', 'preventer repair', 'repair backflow',
        'backflow device repair', 'assembly repair',
    ],
    'Cross-Connection Control': [
        'cross connection control', 'cross-connection control',
        'cross connection program', 'cross-connection program',
    ],
    'Annual Certification Filing': [
        'certification filing', 'annual certification',
        'test report filing', 'compliance filing',
        'submit test report', 'file report',
    ],
    'Sprinkler Backflow': [
        'sprinkler backflow', 'irrigation backflow',
        'lawn sprinkler', 'fire sprinkler backflow',
    ],
    'Commercial': [
        'commercial backflow', 'commercial property',
        'commercial building', 'commercial plumbing',
    ],
    'Residential': [
        'residential backflow', 'residential property',
        'home backflow', 'residential plumbing',
    ],
    'Emergency Service': [
        'emergency service', 'emergency plumbing',
        'emergency repair', '24/7', '24 hour',
    ],
    'Free Estimates': [
        'free estimate', 'free quote', 'no obligation',
        'complimentary estimate',
    ],
    'Same Day Service': [
        'same day', 'same-day', 'next day', 'next-day',
    ],
}

# Booking link indicators
BOOKING_INDICATORS = [
    'book', 'quote', 'schedule', 'appointment',
    'contact', 'request', 'estimate', 'get-started',
]

# Service page indicators for internal link discovery
SERVICE_PAGE_INDICATORS = {
    'backflow', 'rpz', 'cross', 'service', 'services',
    'plumbing', 'testing', 'preventer', 'irrigation',
    'sprinkler', 'prevention', 'repair', 'installation'
}


# ── Helper functions ──────────────────────────────────────────────────────────

def setup_logging():
    """Configure logging."""
    DATA_DIR.mkdir(exist_ok=True)

    logger = logging.getLogger("03_verify")
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


def assign_tier(score: int, matched_terms: List[str], testing_threshold: int) -> str:
    """Classify a verified business into a tier."""
    has_testing_term = any(t in TESTING_TIER_TERMS for t in matched_terms)
    if score >= testing_threshold and has_testing_term:
        return 'testing'
    elif score >= TIER_SERVICE_DEFAULT:
        return 'service'
    return 'none'


def normalize_url(url: str) -> Optional[str]:
    """Normalize URL for crawling."""
    if pd.isna(url) or not url or str(url).strip() == '':
        return None
    url = str(url).strip()
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
    """Score text for backflow relevance. Returns (score, matched_terms)."""
    if not text:
        return 0, []

    text_lower = text.lower()
    matched_terms = []
    score = 0

    for term, weight in BACKFLOW_TERMS.items():
        if term in text_lower:
            matched_terms.append(term)
            score += weight

    score = min(10, score)
    return score, list(set(matched_terms))


def extract_service_tags(text: str) -> List[str]:
    """Extract canonical service tags from crawled text."""
    if not text:
        return []

    text_lower = text.lower()
    tags = []

    for tag, triggers in SERVICE_TAG_TRIGGERS.items():
        if any(trigger in text_lower for trigger in triggers):
            tags.append(tag)

    return tags


def extract_service_area(text: str) -> Optional[str]:
    """Extract service area description from text."""
    if not text:
        return None

    # Common patterns for service area descriptions
    patterns = [
        r'(?:serving|service area|we serve|areas?\s+(?:we\s+)?served?)[:\s]+([^.]{10,150})',
        r'(?:proudly\s+serving|coverage\s+area)[:\s]+([^.]{10,150})',
        r'(?:service\s+(?:locations?|cities|counties|areas?))[:\s]+([^.]{10,150})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            area = match.group(1).strip()
            # Clean up the extracted text
            area = re.sub(r'\s+', ' ', area)
            if len(area) > 10:
                return area[:250]

    return None


def extract_description(text: str) -> Optional[str]:
    """Extract a description snippet from crawled text."""
    if not text:
        return None

    # Look for about/description sections
    patterns = [
        r'(?:about\s+us|who\s+we\s+are|our\s+company)[:\s]+(.{50,300})',
        r'(?:welcome\s+to|we\s+are\s+a|we\s+provide)[:\s]*(.{50,250})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            desc = match.group(1).strip()
            # Truncate at sentence boundary near 200 chars
            if len(desc) > 200:
                cut = desc[:200].rfind('.')
                if cut > 100:
                    desc = desc[:cut + 1]
                else:
                    desc = desc[:200].rsplit(' ', 1)[0] + '...'
            return desc

    # Fallback: use first meaningful paragraph
    lines = [l.strip() for l in text.split('\n') if len(l.strip()) > 50]
    if lines:
        desc = lines[0][:200]
        if len(desc) == 200:
            desc = desc.rsplit(' ', 1)[0] + '...'
        return desc

    return None


def extract_booking_url(html: str, base_url: str) -> Optional[str]:
    """Extract booking/quote URL from HTML."""
    if not html:
        return None

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
    except:
        return None

    for a in soup.find_all('a', href=True):
        href = a['href'].lower()
        anchor = a.get_text(strip=True).lower()

        # Check if link or anchor text contains booking indicators
        combined = href + ' ' + anchor
        if any(ind in combined for ind in BOOKING_INDICATORS):
            try:
                abs_url = urljoin(base_url, a['href'])
                # Only return same-domain or well-known booking URLs
                if is_same_domain(abs_url, base_url) or any(
                    d in abs_url for d in ['calendly.com', 'acuityscheduling.com', 'square.site']
                ):
                    return abs_url
            except:
                continue

    return None


def extract_internal_links(
    html: str,
    base_url: str,
    max_links: int = 10
) -> List[Tuple[str, str]]:
    """Extract internal links that might be service pages."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
    except:
        return []

    links = []
    base_domain = extract_domain(base_url)

    for a in soup.find_all('a', href=True):
        href = a['href']
        anchor = a.get_text(strip=True).lower()

        try:
            abs_url = urljoin(base_url, href)
        except:
            continue

        if not is_same_domain(base_url, abs_url):
            continue
        if abs_url.rstrip('/') == base_url.rstrip('/'):
            continue

        url_lower = abs_url.lower()
        relevance_score = 0

        for indicator in SERVICE_PAGE_INDICATORS:
            if indicator in url_lower:
                relevance_score += 2
            if indicator in anchor:
                relevance_score += 1

        if relevance_score > 0:
            links.append((abs_url, anchor, relevance_score))

    links.sort(key=lambda x: x[2], reverse=True)
    return [(url, anchor) for url, anchor, _ in links[:max_links]]


# ── Crawling ──────────────────────────────────────────────────────────────────

async def crawl_url(
    crawler: AsyncWebCrawler,
    url: str,
    timeout: int,
    logger: logging.Logger
) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
    """Crawl a single URL. Returns (success, text, html, error_msg)."""
    try:
        result = await crawler.arun(
            url=url,
            bypass_cache=True,
            word_count_threshold=10,
            page_timeout=timeout * 1000,
        )

        if result.success:
            text = result.markdown or result.cleaned_html or ""
            html = result.html or ""
            return True, text, html, None
        else:
            return False, None, None, result.error_message or "Unknown error"

    except asyncio.TimeoutError:
        return False, None, None, "Timeout"
    except Exception as e:
        return False, None, None, str(e)


async def verify_and_enrich(
    row: pd.Series,
    crawler: AsyncWebCrawler,
    max_pages: int,
    threshold: int,
    testing_threshold: int,
    timeout: int,
    logger: logging.Logger
) -> Dict:
    """Verify a business website and extract enrichment data."""
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
        # Enrichment fields
        'service_tags': '',
        'service_area_text': None,
        'description_snippet': None,
        'booking_url': None,
    }

    website = normalize_url(row.get('website', ''))

    if not website:
        result['crawl_status'] = 'NO_WEBSITE'
        return result

    all_matched_terms = set()
    all_text = ""
    all_html = ""
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
    all_text = text or ""
    all_html = html or ""

    # Score homepage
    score, matched = score_text(text, logger)

    if score > best_score:
        best_score = score
        best_url = website

    all_matched_terms.update(matched)

    logger.info(f"    Homepage score: {score} (matches: {len(matched)})")

    # If homepage score meets threshold, we're verified
    if score >= threshold:
        result['backflow_score'] = score
        result['backflow_hits'] = '|'.join(sorted(all_matched_terms))
        result['matched_on'] = 'HOMEPAGE'
        result['best_evidence_url'] = best_url
        result['tier'] = assign_tier(score, list(all_matched_terms), testing_threshold)

        # Extract enrichment from homepage
        result['service_tags'] = '|'.join(extract_service_tags(all_text))
        result['service_area_text'] = extract_service_area(all_text)
        result['description_snippet'] = extract_description(all_text)
        result['booking_url'] = extract_booking_url(all_html, website)

        logger.info(f"    Verified on homepage (score: {score}, tier: {result['tier']})")
        return result

    # Pass 2: Crawl internal pages if needed
    if max_pages > 1 and html:
        logger.info(f"    Homepage insufficient (score: {score}), crawling internal pages...")

        internal_links = extract_internal_links(html, website, max_links=max_pages - 1)

        if internal_links:
            logger.info(f"    Found {len(internal_links)} potential service pages")

            for i, (url, anchor) in enumerate(internal_links[:max_pages - 1]):
                logger.info(f"      [{i+1}] {url} ('{anchor[:50]}')")

                success, page_text, page_html, error = await crawl_url(crawler, url, timeout, logger)

                if not success:
                    logger.warning(f"        Failed: {error}")
                    continue

                result['pages_crawled'] += 1

                if page_text:
                    all_text += "\n" + page_text
                if page_html:
                    all_html += "\n" + page_html

                page_score, page_matched = score_text(page_text, logger)

                if page_score > 0:
                    all_matched_terms.update(page_matched)
                    logger.info(f"        Score: {page_score} (matches: {len(page_matched)})")

                    if page_score > best_score:
                        best_score = page_score
                        best_url = url

                if best_score >= threshold * 2:
                    logger.info(f"        Strong evidence found, stopping")
                    break

        result['backflow_score'] = best_score
        result['backflow_hits'] = '|'.join(sorted(all_matched_terms))

        if best_score >= threshold:
            result['matched_on'] = 'BOTH' if score > 0 else 'INTERNAL'
            result['best_evidence_url'] = best_url
            result['tier'] = assign_tier(best_score, list(all_matched_terms), testing_threshold)

            # Extract enrichment from all crawled text
            result['service_tags'] = '|'.join(extract_service_tags(all_text))
            result['service_area_text'] = extract_service_area(all_text)
            result['description_snippet'] = extract_description(all_text)
            result['booking_url'] = extract_booking_url(all_html, website)

            logger.info(f"    Verified on internal pages (score: {best_score}, tier: {result['tier']})")
        else:
            result['crawl_status'] = 'NOT_RELEVANT'
            result['tier'] = 'none'
            logger.info(f"    No sufficient evidence (score: {best_score})")
    else:
        result['backflow_score'] = score
        result['backflow_hits'] = '|'.join(sorted(all_matched_terms))
        result['crawl_status'] = 'NOT_RELEVANT'
        result['matched_on'] = 'HOMEPAGE'
        result['best_evidence_url'] = website
        result['tier'] = 'none'
        logger.info(f"    Homepage only, insufficient (score: {score})")

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
    """Process a batch of websites."""
    logger.info(f"\nBatch {batch_num}: Processing {len(batch_df)} websites")
    results = []

    async with AsyncWebCrawler(verbose=False) as crawler:
        for idx, row in batch_df.iterrows():
            name = row.get('name', 'Unknown')
            logger.info(f"\n[{idx}] {name}")

            try:
                result = await verify_and_enrich(
                    row=row,
                    crawler=crawler,
                    max_pages=max_pages,
                    threshold=threshold,
                    testing_threshold=testing_threshold,
                    timeout=timeout,
                    logger=logger
                )
            except Exception as e:
                logger.error(f"  Unexpected error for {name}: {e}")
                result = {**row.to_dict()}
                result['crawl_status'] = 'ERROR'
                result['crawl_error'] = str(e)
                result['backflow_score'] = 0
                result['tier'] = 'none'
                result['service_tags'] = ''

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
    lines.append("# Website Verification & Enrichment Report")
    lines.append("")
    lines.append(f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    verified_count = len(verified_df)
    rejected_count = len(rejected_df)
    total_processed = verified_count + rejected_count

    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Input records**: {input_count:,}")
    lines.append(f"- **Processed**: {total_processed:,}")
    lines.append(f"- **Verified (kept)**: {verified_count:,} ({verified_count/max(total_processed,1)*100:.1f}%)")
    lines.append(f"- **Rejected**: {rejected_count:,} ({rejected_count/max(total_processed,1)*100:.1f}%)")
    lines.append("")

    # Crawl status breakdown
    all_df = pd.concat([verified_df, rejected_df], ignore_index=True)
    if 'crawl_status' in all_df.columns:
        lines.append("## Crawl Status")
        lines.append("")
        lines.append("| Status | Count | % |")
        lines.append("|--------|-------|---|")
        for status, count in all_df['crawl_status'].value_counts().items():
            lines.append(f"| {status} | {count:,} | {count/max(total_processed,1)*100:.1f}% |")
        lines.append("")

    # Tier breakdown
    if verified_count > 0 and 'tier' in verified_df.columns:
        lines.append("## Tier Breakdown (Verified)")
        lines.append("")
        lines.append("| Tier | Count | % |")
        lines.append("|------|-------|---|")
        for tier, count in verified_df['tier'].value_counts().items():
            lines.append(f"| {tier} | {count:,} | {count/verified_count*100:.1f}% |")
        lines.append("")

    # Service tags distribution
    if verified_count > 0 and 'service_tags' in verified_df.columns:
        lines.append("## Service Tags Distribution")
        lines.append("")
        all_tags = []
        for tags in verified_df['service_tags'].dropna():
            if tags:
                all_tags.extend(str(tags).split('|'))
        if all_tags:
            tag_counts = Counter(all_tags)
            lines.append("| Tag | Count |")
            lines.append("|-----|-------|")
            for tag, count in tag_counts.most_common():
                lines.append(f"| {tag} | {count:,} |")
            lines.append("")

    # Top cities
    if verified_count > 0 and 'city' in verified_df.columns:
        lines.append("## Top 15 Cities (Verified)")
        lines.append("")
        lines.append("| City | Count |")
        lines.append("|------|-------|")
        for city, count in verified_df['city'].value_counts().head(15).items():
            lines.append(f"| {city} | {count:,} |")
        lines.append("")

    with open(output_path, 'w') as f:
        f.write('\n'.join(lines))

    logger.info(f"  Report saved: {output_path}")


async def main_async(args, logger):
    """Main async execution."""
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    logger.info(f"Loading data from: {input_path}")
    df = pd.read_csv(input_path, low_memory=False)

    input_count = len(df)
    logger.info(f"Loaded {input_count:,} records")

    if args.only_with_website:
        df = df[df['website'].notna() & (df['website'] != '')]
        logger.info(f"Filtered to {len(df):,} records with websites")

    # Load checkpoint
    state = {}
    if args.resume:
        state = load_checkpoint(logger)
        processed_ids = set(state.get('processed_place_ids', []))

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

    verified_results = []
    rejected_results = []

    total_batches = (len(df) + args.batch_size - 1) // args.batch_size

    logger.info("")
    logger.info("=" * 70)
    logger.info("STARTING WEBSITE VERIFICATION & ENRICHMENT")
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

        batch_results = await process_batch(
            batch_df=batch_df,
            batch_num=batch_num,
            max_pages=args.max_pages,
            threshold=args.threshold,
            testing_threshold=args.testing_threshold,
            timeout=args.timeout,
            logger=logger
        )

        for result in batch_results:
            if result.get('crawl_status') == 'OK' and result.get('backflow_score', 0) >= args.threshold:
                verified_results.append(result)
                state['verified_count'] += 1
                tier = result.get('tier', 'service')
                state['testing_count'] = state.get('testing_count', 0) + (1 if tier == 'testing' else 0)
                state['service_count'] = state.get('service_count', 0) + (1 if tier == 'service' else 0)
            else:
                rejected_results.append(result)
                state['rejected_count'] += 1

            state['processed_count'] += 1
            state['processed_place_ids'].append(result.get('place_id', ''))

        save_checkpoint(state, logger)

        logger.info(f"\nBatch {batch_num}/{total_batches} complete")
        logger.info(f"  Verified so far: {state['verified_count']:,}"
                    f" (testing: {state.get('testing_count',0):,}"
                    f", service: {state.get('service_count',0):,})")
        logger.info(f"  Rejected so far: {state['rejected_count']:,}")

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

    if verified_results or rejected_results:
        generate_report(input_count, verified_df, rejected_df, REPORT_MD, logger)

    # Final summary
    total = state['processed_count']
    logger.info("\n" + "=" * 70)
    logger.info("VERIFICATION & ENRICHMENT COMPLETE")
    logger.info("=" * 70)
    logger.info(f"Total processed:   {total:,}")
    logger.info(f"Verified (kept):   {state['verified_count']:,} ({state['verified_count']/max(total,1)*100:.1f}%)")
    logger.info(f"  tier=testing:    {state.get('testing_count', 0):,}")
    logger.info(f"  tier=service:    {state.get('service_count', 0):,}")
    logger.info(f"Rejected:          {state['rejected_count']:,} ({state['rejected_count']/max(total,1)*100:.1f}%)")
    logger.info("=" * 70)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Step 3: Verify backflow services and extract enrichment data'
    )
    parser.add_argument('--input', default=str(INPUT_CSV), help='Input CSV file')
    parser.add_argument('--batch-size', type=int, default=25, help='Websites per batch (default: 25)')
    parser.add_argument('--max-pages', type=int, default=4, help='Max pages per site (default: 4)')
    parser.add_argument('--threshold', type=int, default=2, help='Min backflow score (default: 2)')
    parser.add_argument('--timeout', type=int, default=60, help='Per-page timeout seconds (default: 60)')
    parser.add_argument('--sleep', type=float, default=0.3, help='Sleep between batches (default: 0.3)')
    parser.add_argument('--resume', action='store_true', help='Resume from checkpoint')
    parser.add_argument('--only-with-website', action='store_true', help='Skip records without websites')
    parser.add_argument(
        '--testing-threshold', type=int, default=TIER_TESTING_DEFAULT,
        help=f'Min score for tier=testing (default: {TIER_TESTING_DEFAULT})'
    )

    args = parser.parse_args()
    logger = setup_logging()
    asyncio.run(main_async(args, logger))


if __name__ == "__main__":
    main()
