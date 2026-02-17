#!/usr/bin/env python3
"""
Image enrichment pipeline for backflow testing providers.

Three-stage pipeline:
  A. Crawl4AI candidate image discovery
       - Homepage + best_evidence_url + up to 2 service-related internal pages
       - Google Maps 'photo' field as fallback when no website candidates found
  B. Heuristic junk filter
       - Drop SVGs, ICOs, logos, favicons, icons, sprites, social/payment/map images
       - Drop data: URIs and very small images (URL dimension hints < 200 px)
  C. Claude Vision relevance verification
       - Send up to 3 candidates at a time (max 6 evaluated = 2 Vision rounds)
       - RELEVANT / NOT_RELEVANT label + confidence (0-100) + brief reason
       - Keep best 1-3 images above confidence threshold

Output files:
  images_enriched.csv     – all verified.csv rows + image_1..3 columns
  images_rejected.csv     – providers with no images after enrichment
  image_enrichment_report.md

Usage:
    python crawler/05_enrich_images.py
    python crawler/05_enrich_images.py --input crawler/data/verified.csv
    python crawler/05_enrich_images.py --resume
    python crawler/05_enrich_images.py --batch-size 10 --dry-run
    python crawler/05_enrich_images.py --no-crawl    # Google photo fallback only
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
import pandas as pd
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# Optional Crawl4AI import
try:
    from crawl4ai import AsyncWebCrawler
    CRAWL4AI_AVAILABLE = True
except ImportError:
    CRAWL4AI_AVAILABLE = False

# ─── Paths ────────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent / "data"
DEFAULT_INPUT    = DATA_DIR / "verified.csv"
DEFAULT_OUTPUT   = DATA_DIR / "images_enriched.csv"
DEFAULT_REJECTED = DATA_DIR / "images_rejected.csv"
DEFAULT_REPORT   = DATA_DIR / "image_enrichment_report.md"
STATE_FILE       = DATA_DIR / "image_state.json"
LOG_FILE         = DATA_DIR / "image_enrichment.log"

# ─── Tuning constants ─────────────────────────────────────────────────────────

VISION_MODEL        = "claude-haiku-4-5-20251001"  # cost-efficient for batch filtering
MAX_CANDIDATES      = 6       # max images sent to Vision per provider (2 rounds × 3)
VISION_BATCH_SIZE   = 3       # images per Vision API call
MAX_SELECTED        = 3       # max images kept per provider
MAX_PAGES           = 4       # homepage + best_evidence + 2 internal pages
IMAGE_TIMEOUT       = 15      # seconds to download one image
IMAGE_MAX_BYTES     = 5 * 1024 * 1024   # 5 MB hard cap
VISION_CONCURRENCY  = 2       # max concurrent Vision calls (rate limiting)
CRAWL_TIMEOUT       = 30      # seconds per page crawl
DEFAULT_BATCH_SIZE  = 25      # providers per processing batch

# ─── Heuristic filter patterns ────────────────────────────────────────────────

JUNK_URL_RE = re.compile(
    r"("
    r"logo|favicon|icon|sprite|badge|social|payment|map|avatar|"
    r"placeholder|loading|spinner|arrow|bullet|star-rating|"
    r"flag|1x1|pixel|tracking|analytics|\bads?\b|banner|"
    r"facebook|twitter|instagram|youtube|linkedin|pinterest|yelp|tiktok|"
    r"background|bg[-_]|pattern|texture|separator|divider|"
    r"header[-_]|footer[-_]|nav[-_]|menu[-_]|sidebar[-_]"
    r")",
    re.IGNORECASE,
)

JUNK_EXTENSIONS = {".svg", ".ico", ".gif", ".bmp", ".tiff"}

# Internal pages likely to have real service photos
SERVICE_PAGE_RE = re.compile(
    r"/(about|services?|gallery|photos?|portfolio|work|projects?|"
    r"backflow|plumbing|hvac|heating|cooling|team|our[-_]work|"
    r"completed|before[-_]after|testimonials?)",
    re.IGNORECASE,
)

# Dimension hint in URL path (e.g. "250x200", "w300-h200")
DIM_RE = re.compile(r"(?:^|[-_x])(\d{2,4})(?:[-_x])(\d{2,4})(?:$|[-_.])", re.IGNORECASE)

# ─── Logging ─────────────────────────────────────────────────────────────────


def setup_logging(log_file: Path) -> logging.Logger:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("image_enrichment")
    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter(
        "%(asctime)s %(levelname)-8s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


logger = setup_logging(LOG_FILE)

# ─── State / Checkpoint helpers ───────────────────────────────────────────────


def load_state(state_file: Path) -> Dict[str, Any]:
    if state_file.exists():
        try:
            with open(state_file) as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "processed_ids": [],
        "enriched_count": 0,
        "no_image_count": 0,
        "error_count": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


def save_state(state: Dict[str, Any], state_file: Path) -> None:
    state_file.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_file.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    tmp.replace(state_file)


# ─── Heuristic image filter ───────────────────────────────────────────────────


def _dim_too_small(url: str) -> bool:
    """Return True if URL contains a dimension hint smaller than 200×200."""
    path = urlparse(url).path
    m = DIM_RE.search(Path(path).stem)
    if m:
        w, h = int(m.group(1)), int(m.group(2))
        if w < 200 and h < 200:
            return True
    return False


def is_junk_url(url: str) -> bool:
    """Heuristic check — True means this URL is likely a logo/icon/junk image."""
    if not url or url.startswith("data:"):
        return True

    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower()
    if ext in JUNK_EXTENSIONS:
        return True

    url_lower = url.lower()
    if JUNK_URL_RE.search(url_lower):
        return True

    if _dim_too_small(url):
        return True

    return False


def heuristic_filter(urls: List[str]) -> List[str]:
    """Remove junk URLs, deduplicate, preserve order."""
    seen: set = set()
    result: List[str] = []
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        if not is_junk_url(url):
            result.append(url)
    return result


# ─── HTML parsing helpers ─────────────────────────────────────────────────────


def extract_images_from_html(html: str, base_url: str) -> List[str]:
    """Return all candidate absolute image URLs found in HTML."""
    soup = BeautifulSoup(html, "html.parser")
    urls: List[str] = []

    # <img src="..."> and srcset="..."
    for tag in soup.find_all("img"):
        src = tag.get("src", "").strip()
        if src:
            abs_url = urljoin(base_url, src)
            if abs_url.startswith("http"):
                urls.append(abs_url)

        srcset = tag.get("srcset", "")
        for part in srcset.split(","):
            tokens = part.strip().split()
            if not tokens:
                continue
            s = tokens[0]
            if s:
                abs_url = urljoin(base_url, s)
                if abs_url.startswith("http"):
                    urls.append(abs_url)

    # Open Graph / Twitter card images
    for meta in soup.find_all("meta"):
        prop = (meta.get("property") or meta.get("name") or "").lower()
        if prop in ("og:image", "twitter:image", "twitter:image:src"):
            content = (meta.get("content") or "").strip()
            if content.startswith("http"):
                urls.append(content)

    return urls


def extract_service_links(html: str, base_url: str) -> List[str]:
    """Extract same-domain links to service-related pages."""
    soup = BeautifulSoup(html, "html.parser")
    base_domain = urlparse(base_url).netloc
    links: List[str] = []

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        abs_url = urljoin(base_url, href)
        parsed = urlparse(abs_url)
        if parsed.netloc != base_domain:
            continue
        if SERVICE_PAGE_RE.search(parsed.path):
            links.append(abs_url)

    return list(dict.fromkeys(links))  # deduplicate, preserve order


# ─── Image download ───────────────────────────────────────────────────────────


async def download_image(
    client: httpx.AsyncClient,
    url: str,
) -> Optional[Tuple[bytes, str]]:
    """
    Download image bytes. Returns (bytes, media_type) or None on failure.
    Filters out non-image content-types and oversized files.
    """
    try:
        resp = await client.get(
            url,
            timeout=IMAGE_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ImageEnrichBot/1.0)"},
        )
        if resp.status_code != 200:
            return None

        ct = resp.headers.get("content-type", "").split(";")[0].strip().lower()
        if not ct.startswith("image/"):
            return None

        # Reject SVG and ICO at content-type level
        if ct in ("image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"):
            return None

        data = resp.content
        if len(data) > IMAGE_MAX_BYTES:
            logger.debug(f"Image too large ({len(data) // 1024}KB): {url}")
            return None

        # Normalise ambiguous media types
        if ct == "image/jpg":
            ct = "image/jpeg"
        if ct not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
            ct = "image/jpeg"

        return data, ct

    except Exception as e:
        logger.debug(f"Download failed for {url}: {e}")
        return None


# ─── Claude Vision verification ───────────────────────────────────────────────

_VISION_SYSTEM = """\
You are evaluating images for a plumbing / backflow testing services directory.

For each image decide:
1. RELEVANT — shows something related to plumbing or backflow testing:
   • plumbers or technicians working
   • backflow preventers, water meters, RPZ valves, pipes, fittings
   • service vans with company branding
   • shop / office exterior
   • equipment and tools
   NOT relevant: stock water photos, abstract art, food, unrelated people,
   city skylines, generic home exteriors with no service context.

2. confidence — integer 0-100 (how certain you are).

3. reason — brief explanation, ≤ 12 words.

Respond with a JSON array in the SAME ORDER as the images provided:
[
  {"relevant": true,  "confidence": 85, "reason": "Technician installing backflow preventer valve"},
  {"relevant": false, "confidence": 92, "reason": "Generic stock photo of water droplet"}
]
Output ONLY the JSON array, no markdown fences."""


async def vision_verify_batch(
    client: Any,  # anthropic.AsyncAnthropic
    image_data: List[Tuple[str, bytes, str]],
    semaphore: asyncio.Semaphore,
    model: str,
) -> List[Dict[str, Any]]:
    """
    Send a batch of (url, bytes, media_type) tuples to Claude Vision.
    Returns a list of verdict dicts in the same order.
    """
    if not image_data:
        return []

    pessimistic = [
        {"relevant": False, "confidence": 0, "reason": "vision error"} for _ in image_data
    ]

    content: List[Dict[str, Any]] = [
        {"type": "text", "text": f"Evaluate the following {len(image_data)} image(s):"}
    ]
    for i, (url, data, media_type) in enumerate(image_data, 1):
        content.append({"type": "text", "text": f"\nImage {i}:"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.standard_b64encode(data).decode("utf-8"),
                },
            }
        )

    async with semaphore:
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=512,
                system=_VISION_SYSTEM,
                messages=[{"role": "user", "content": content}],
            )
            text = response.content[0].text.strip()

            # Strip accidental markdown fences
            if "```" in text:
                text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()

            verdicts = json.loads(text)
            if not isinstance(verdicts, list):
                verdicts = [verdicts]

            # Pad/truncate to match input count
            while len(verdicts) < len(image_data):
                verdicts.append({"relevant": False, "confidence": 0, "reason": "missing verdict"})

            return verdicts[: len(image_data)]

        except json.JSONDecodeError as e:
            logger.warning(f"Vision JSON parse error: {e}")
            return pessimistic
        except Exception as e:
            logger.error(f"Vision API error: {e}")
            return pessimistic


# ─── Crawl4AI page helper ─────────────────────────────────────────────────────


async def crawl_page(crawler: Any, url: str) -> Optional[str]:
    """Crawl a single URL and return raw HTML. Returns None on failure."""
    try:
        result = await crawler.arun(
            url=url,
            bypass_cache=True,
            word_count_threshold=0,
            page_timeout=CRAWL_TIMEOUT * 1000,
        )
        if result.success and result.html:
            return result.html
    except Exception as e:
        logger.debug(f"Crawl error for {url}: {e}")
    return None


# ─── Per-provider pipeline ────────────────────────────────────────────────────


async def enrich_provider(
    row: Dict[str, Any],
    crawler: Any,
    http_client: httpx.AsyncClient,
    vision_client: Any,
    vision_semaphore: asyncio.Semaphore,
    args: argparse.Namespace,
) -> Dict[str, Any]:
    """
    Run the full A→B→C pipeline for one provider.
    Returns a flat result dict with image_1..3 columns populated.
    """
    place_id     = str(row.get("place_id", ""))
    name         = str(row.get("name", ""))
    website      = str(row.get("website_clean") or row.get("website") or "").strip()
    best_evidence = str(row.get("best_evidence_url") or "").strip()
    photo_field   = str(row.get("photo") or "").strip()

    base = {
        "place_id":        place_id,
        "name":            name,
        "enrichment_status": "pending",
        "images_found":      0,
        "images_evaluated":  0,
        "images_selected":   0,
        "image_1_url":    None, "image_1_source": None,
        "image_1_quality": None, "image_1_reason": None,
        "image_2_url":    None, "image_2_source": None,
        "image_2_quality": None, "image_2_reason": None,
        "image_3_url":    None, "image_3_source": None,
        "image_3_quality": None, "image_3_reason": None,
        "image_selected_at": None,
    }

    # ── A: Candidate discovery ────────────────────────────────────────────────
    candidate_urls: List[str] = []

    if website and CRAWL4AI_AVAILABLE and not args.no_crawl:
        pages_to_crawl = [website]
        if best_evidence and best_evidence != website:
            pages_to_crawl.append(best_evidence)

        crawled: set = set()
        for page_url in pages_to_crawl[:MAX_PAGES]:
            if page_url in crawled:
                continue
            crawled.add(page_url)

            html = await crawl_page(crawler, page_url)
            if not html:
                continue

            imgs = extract_images_from_html(html, page_url)
            candidate_urls.extend(imgs)
            logger.debug(f"  {name}: {len(imgs)} imgs from {page_url}")

            # Discover service links for extra crawling
            if len(pages_to_crawl) < MAX_PAGES:
                links = extract_service_links(html, page_url)
                for link in links:
                    if link not in crawled and len(pages_to_crawl) < MAX_PAGES:
                        pages_to_crawl.append(link)

    # Google Maps photo as fallback (only if no crawled candidates)
    if not candidate_urls and photo_field and photo_field.startswith("http"):
        candidate_urls.append(photo_field)
        logger.debug(f"  {name}: using Google photo fallback")

    # ── B: Heuristic filter ───────────────────────────────────────────────────
    candidates = heuristic_filter(candidate_urls)
    candidates = candidates[:MAX_CANDIDATES]
    base["images_found"] = len(candidates)

    if not candidates:
        base["enrichment_status"] = "no_candidates"
        logger.info(f"  {name}: no candidates after filter")
        return base

    if args.dry_run:
        base["enrichment_status"] = "dry_run"
        base["images_evaluated"] = len(candidates)
        logger.info(f"  {name}: [dry-run] {len(candidates)} candidates")
        return base

    # ── C: Claude Vision verification ─────────────────────────────────────────
    selected: List[Dict[str, Any]] = []
    evaluated = 0

    for batch_start in range(0, len(candidates), VISION_BATCH_SIZE):
        if evaluated >= MAX_CANDIDATES or len(selected) >= MAX_SELECTED:
            break

        batch_urls = candidates[batch_start : batch_start + VISION_BATCH_SIZE]

        # Download in parallel
        downloads = await asyncio.gather(
            *[download_image(http_client, u) for u in batch_urls],
            return_exceptions=True,
        )

        image_data: List[Tuple[str, bytes, str]] = []
        for url, dl in zip(batch_urls, downloads):
            if isinstance(dl, Exception) or dl is None:
                logger.debug(f"  Skip (no download): {url}")
                continue
            data, media_type = dl
            image_data.append((url, data, media_type))

        if not image_data:
            continue

        verdicts = await vision_verify_batch(
            vision_client, image_data, vision_semaphore, args.model
        )
        evaluated += len(image_data)

        for (url, _, _), verdict in zip(image_data, verdicts):
            confidence = int(verdict.get("confidence", 0))
            if (
                verdict.get("relevant", False)
                and confidence >= args.vision_threshold
                and len(selected) < MAX_SELECTED
            ):
                selected.append(
                    {
                        "url":        url,
                        "confidence": confidence,
                        "reason":     str(verdict.get("reason", "")),
                        "source":     "crawled" if not (url == photo_field) else "google_photo",
                    }
                )

    # ── Fill output ───────────────────────────────────────────────────────────
    base["images_evaluated"] = evaluated
    base["images_selected"]  = len(selected)

    if selected:
        base["enrichment_status"]  = "enriched"
        base["image_selected_at"]  = datetime.now(timezone.utc).isoformat()
        for i, img in enumerate(selected[:MAX_SELECTED], 1):
            base[f"image_{i}_url"]     = img["url"]
            base[f"image_{i}_source"]  = img["source"]
            base[f"image_{i}_quality"] = img["confidence"]
            base[f"image_{i}_reason"]  = img["reason"]
        logger.info(f"  {name}: {len(selected)} image(s) selected")
    else:
        base["enrichment_status"] = "no_images_passed"
        logger.info(f"  {name}: 0 images passed Vision threshold")

    return base


# ─── Output helpers ───────────────────────────────────────────────────────────

IMAGE_COLS = [
    "enrichment_status",
    "images_found", "images_evaluated", "images_selected",
    "image_1_url", "image_1_source", "image_1_quality", "image_1_reason",
    "image_2_url", "image_2_source", "image_2_quality", "image_2_reason",
    "image_3_url", "image_3_source", "image_3_quality", "image_3_reason",
    "image_selected_at",
]


def merge_result(original_row: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    """Merge enrichment result columns into the original row dict."""
    merged = dict(original_row)
    for col in IMAGE_COLS:
        merged[col] = result.get(col)
    return merged


def append_rows(rows: List[Dict[str, Any]], path: Path) -> None:
    """Append rows to a CSV, writing header only if file is new."""
    if not rows:
        return
    df = pd.DataFrame(rows)
    write_header = not path.exists()
    df.to_csv(path, mode="a", header=write_header, index=False)


# ─── Report generation ────────────────────────────────────────────────────────


def write_report(state: Dict[str, Any], report_path: Path, input_total: int) -> None:
    enriched     = state.get("enriched_count", 0)
    no_image     = state.get("no_image_count", 0)
    errors       = state.get("error_count", 0)
    total_processed = len(state.get("processed_ids", []))

    lines = [
        "# Image Enrichment Report",
        "",
        f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Summary",
        "",
        f"- **Input records**: {input_total:,}",
        f"- **Processed**: {total_processed:,}",
        f"- **Enriched** (≥1 image): {enriched:,}",
        f"- **No images found**: {no_image:,}",
        f"- **Errors**: {errors:,}",
        f"- **Enrichment rate**: "
        f"{enriched / total_processed * 100:.1f}%"
        if total_processed
        else "- **Enrichment rate**: N/A",
        "",
    ]

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines))
    logger.info(f"Report saved → {report_path}")


# ─── Main ─────────────────────────────────────────────────────────────────────


async def run(args: argparse.Namespace) -> None:
    # Validate API key
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key and not args.dry_run:
        logger.error("ANTHROPIC_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)

    if not CRAWL4AI_AVAILABLE and not args.no_crawl:
        logger.warning(
            "crawl4ai not available — falling back to Google photo field only. "
            "Use --no-crawl to silence this warning."
        )

    # Load input
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        sys.exit(1)

    df = pd.read_csv(input_path, low_memory=False)
    logger.info(f"Loaded {len(df):,} rows from {input_path}")

    # Load state
    state = load_state(STATE_FILE)
    if not args.resume:
        state = {
            "processed_ids": [],
            "enriched_count": 0,
            "no_image_count": 0,
            "error_count": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        # Remove old output files if starting fresh
        for p in (DEFAULT_OUTPUT, DEFAULT_REJECTED, STATE_FILE):
            if p.exists():
                p.unlink()
                logger.debug(f"Removed existing {p.name}")

    processed_ids = set(state["processed_ids"])
    remaining = df[~df["place_id"].astype(str).isin(processed_ids)]
    logger.info(f"Already processed: {len(processed_ids):,} | Remaining: {len(remaining):,}")

    if remaining.empty:
        logger.info("All providers already processed. Use without --resume to restart.")
        write_report(state, Path(args.report), len(df))
        return

    # Initialise clients
    import anthropic as _anthropic

    vision_client   = _anthropic.AsyncAnthropic(api_key=api_key)
    vision_semaphore = asyncio.Semaphore(VISION_CONCURRENCY)

    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(IMAGE_TIMEOUT, connect=10),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        follow_redirects=True,
    )

    rows_list = remaining.to_dict("records")
    batch_size = args.batch_size

    enriched_rows: List[Dict[str, Any]] = []
    rejected_rows: List[Dict[str, Any]] = []

    try:
        async def _process_batch(
            batch: List[Dict[str, Any]], crawler: Any
        ) -> None:
            """Process one batch of providers."""
            nonlocal enriched_rows, rejected_rows

            tasks = [
                enrich_provider(
                    row, crawler, http_client, vision_client, vision_semaphore, args
                )
                for row in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for row, result in zip(batch, results):
                pid = str(row.get("place_id", ""))

                if isinstance(result, Exception):
                    logger.error(f"Error for {row.get('name', '?')}: {result}")
                    state["error_count"] += 1
                    result = {
                        "place_id": pid,
                        "enrichment_status": "error",
                        "images_found": 0,
                        "images_evaluated": 0,
                        "images_selected": 0,
                        **{
                            f"image_{i}_{k}": None
                            for i in range(1, 4)
                            for k in ("url", "source", "quality", "reason")
                        },
                        "image_selected_at": None,
                    }

                merged = merge_result(row, result)

                if result.get("images_selected", 0) > 0:
                    enriched_rows.append(merged)
                    state["enriched_count"] += 1
                else:
                    rejected_rows.append(merged)
                    state["no_image_count"] += 1

                state["processed_ids"].append(pid)

        async def _run_batches(crawler: Any) -> None:
            for batch_start in range(0, len(rows_list), batch_size):
                batch = rows_list[batch_start : batch_start + batch_size]
                logger.info(
                    f"Batch {batch_start // batch_size + 1} | "
                    f"providers {batch_start + 1}–{batch_start + len(batch)}"
                )
                await _process_batch(batch, crawler)

                # Flush to disk after every batch
                append_rows(enriched_rows, Path(args.output))
                append_rows(rejected_rows, Path(args.rejected))
                enriched_rows.clear()
                rejected_rows.clear()

                save_state(state, STATE_FILE)
                logger.info(
                    f"  Checkpoint: enriched={state['enriched_count']}, "
                    f"no_image={state['no_image_count']}, "
                    f"errors={state['error_count']}"
                )

        if CRAWL4AI_AVAILABLE and not args.no_crawl:
            async with AsyncWebCrawler(verbose=False) as crawler:
                await _run_batches(crawler)
        else:
            await _run_batches(None)

    finally:
        await http_client.aclose()

    write_report(state, Path(args.report), len(df))
    logger.info(
        f"\n✓ Image enrichment complete\n"
        f"  Enriched : {state['enriched_count']:,}\n"
        f"  No image : {state['no_image_count']:,}\n"
        f"  Errors   : {state['error_count']:,}\n"
        f"  Output   : {args.output}\n"
        f"  Rejected : {args.rejected}"
    )


# ─── CLI ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich verified backflow providers with service photos",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input", default=str(DEFAULT_INPUT),
        help="Path to verified.csv"
    )
    parser.add_argument(
        "--output", default=str(DEFAULT_OUTPUT),
        help="Path to images_enriched.csv"
    )
    parser.add_argument(
        "--rejected", default=str(DEFAULT_REJECTED),
        help="Path to images_rejected.csv"
    )
    parser.add_argument(
        "--report", default=str(DEFAULT_REPORT),
        help="Path to image_enrichment_report.md"
    )
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH_SIZE,
        help="Providers processed per batch (checkpoint written after each)"
    )
    parser.add_argument(
        "--vision-threshold", type=int, default=60,
        help="Minimum Vision confidence (0-100) to accept an image"
    )
    parser.add_argument(
        "--model", default=VISION_MODEL,
        help="Claude model for Vision verification"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Resume from last checkpoint (skip already-processed place_ids)"
    )
    parser.add_argument(
        "--no-crawl", action="store_true",
        help="Skip Crawl4AI; use only Google Maps 'photo' field as candidate"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Discover and filter candidates but skip Vision API calls"
    )
    args = parser.parse_args()

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
