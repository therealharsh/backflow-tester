#!/usr/bin/env python3
"""
Image enrichment for providers already in Supabase that lack images.

Queries the providers table for rows with empty image_urls, runs the same
three-stage pipeline as 05_enrich_images.py (Crawl4AI → heuristic filter →
Claude Vision), and updates image_urls directly in the database.

Usage:
    python crawler/06_enrich_images_db.py
    python crawler/06_enrich_images_db.py --dry-run
    python crawler/06_enrich_images_db.py --resume
    python crawler/06_enrich_images_db.py --batch-size 10
    python crawler/06_enrich_images_db.py --no-crawl
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
from bs4 import BeautifulSoup
from dotenv import load_dotenv

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env")
load_dotenv(_root / "web" / ".env.local")

# Optional Crawl4AI import
try:
    from crawl4ai import AsyncWebCrawler
    CRAWL4AI_AVAILABLE = True
except ImportError:
    CRAWL4AI_AVAILABLE = False

# ─── Paths ────────────────────────────────────────────────────────────────────

DATA_DIR = Path(__file__).parent / "data"
STATE_FILE       = DATA_DIR / "image_db_state.json"
LOG_FILE         = DATA_DIR / "image_db_enrichment.log"

# ─── Tuning constants ─────────────────────────────────────────────────────────

VISION_MODEL        = "claude-haiku-4-5-20251001"
MAX_CANDIDATES      = 6
VISION_BATCH_SIZE   = 3
MAX_SELECTED        = 3
MAX_PAGES           = 4
IMAGE_TIMEOUT       = 15
IMAGE_MAX_BYTES     = 5 * 1024 * 1024
VISION_CONCURRENCY  = 2
CRAWL_TIMEOUT       = 30
DEFAULT_BATCH_SIZE  = 25
DB_PAGE_SIZE        = 1000

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

SERVICE_PAGE_RE = re.compile(
    r"/(about|services?|gallery|photos?|portfolio|work|projects?|"
    r"backflow|plumbing|hvac|heating|cooling|team|our[-_]work|"
    r"completed|before[-_]after|testimonials?)",
    re.IGNORECASE,
)

DIM_RE = re.compile(r"(?:^|[-_x])(\d{2,4})(?:[-_x])(\d{2,4})(?:$|[-_.])", re.IGNORECASE)

# ─── Logging ─────────────────────────────────────────────────────────────────


def setup_logging(log_file: Path) -> logging.Logger:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("image_db_enrichment")
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


# ─── Supabase helpers ────────────────────────────────────────────────────────


def get_supabase_client():
    """Create Supabase client using service role key."""
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        sys.exit(1)
    return create_client(url, key)


def fetch_providers_needing_images(supabase, fetch_all: bool = False) -> List[Dict[str, Any]]:
    """Fetch providers that need image enrichment from Supabase.

    By default fetches ALL providers (--all). Most have at best a single
    Google Maps photo that should be replaced with real service images.
    Use --only-empty to restrict to providers with null/empty image_urls.
    """
    providers: List[Dict[str, Any]] = []
    offset = 0

    while True:
        query = (
            supabase.table("providers")
            .select("place_id,name,website,website_clean,best_evidence_url,location_link,image_urls")
        )
        if not fetch_all:
            query = query.or_("image_urls.is.null,image_urls.eq.[]")
        resp = query.range(offset, offset + DB_PAGE_SIZE - 1).execute()
        rows = resp.data or []
        if not rows:
            break
        providers.extend(rows)
        if len(rows) < DB_PAGE_SIZE:
            break
        offset += DB_PAGE_SIZE

    if fetch_all:
        # Skip providers that already have 2+ non-Google-photo images
        def _needs_enrichment(p: Dict[str, Any]) -> bool:
            urls = p.get("image_urls")
            if not urls or not isinstance(urls, list):
                return True
            # Filter out Google Maps photo URLs (not real enriched images)
            real = [u for u in urls if u and isinstance(u, str)
                    and not u.startswith("https://lh5.googleusercontent.com")]
            return len(real) < 2
        before = len(providers)
        providers = [p for p in providers if _needs_enrichment(p)]
        skipped = before - len(providers)
        if skipped:
            logger.info(f"  Skipped {skipped:,} providers already enriched (2+ real images)")

    return providers


def update_provider_images(supabase, place_id: str, image_urls: List[str]) -> bool:
    """Update image_urls for a single provider in the DB."""
    try:
        supabase.table("providers").update(
            {"image_urls": image_urls}
        ).eq("place_id", place_id).execute()
        return True
    except Exception as e:
        logger.error(f"  DB update failed for {place_id}: {e}")
        return False


# ─── Heuristic image filter ───────────────────────────────────────────────────


def _dim_too_small(url: str) -> bool:
    path = urlparse(url).path
    m = DIM_RE.search(Path(path).stem)
    if m:
        w, h = int(m.group(1)), int(m.group(2))
        if w < 200 and h < 200:
            return True
    return False


def is_junk_url(url: str) -> bool:
    if not url or url.startswith("data:"):
        return True
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower()
    if ext in JUNK_EXTENSIONS:
        return True
    if JUNK_URL_RE.search(url.lower()):
        return True
    if _dim_too_small(url):
        return True
    return False


def heuristic_filter(urls: List[str]) -> List[str]:
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
    soup = BeautifulSoup(html, "html.parser")
    urls: List[str] = []

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

    for meta in soup.find_all("meta"):
        prop = (meta.get("property") or meta.get("name") or "").lower()
        if prop in ("og:image", "twitter:image", "twitter:image:src"):
            content = (meta.get("content") or "").strip()
            if content.startswith("http"):
                urls.append(content)

    return urls


def extract_service_links(html: str, base_url: str) -> List[str]:
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

    return list(dict.fromkeys(links))


# ─── Image download ───────────────────────────────────────────────────────────


async def download_image(
    client: httpx.AsyncClient,
    url: str,
) -> Optional[Tuple[bytes, str]]:
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
        if ct in ("image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"):
            return None

        data = resp.content
        if len(data) > IMAGE_MAX_BYTES:
            logger.debug(f"Image too large ({len(data) // 1024}KB): {url}")
            return None

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
   * plumbers or technicians working
   * backflow preventers, water meters, RPZ valves, pipes, fittings
   * service vans with company branding
   * shop / office exterior
   * equipment and tools
   NOT relevant: stock water photos, abstract art, food, unrelated people,
   city skylines, generic home exteriors with no service context.

2. confidence — integer 0-100 (how certain you are).

3. reason — brief explanation, <= 12 words.

Respond with a JSON array in the SAME ORDER as the images provided:
[
  {"relevant": true,  "confidence": 85, "reason": "Technician installing backflow preventer valve"},
  {"relevant": false, "confidence": 92, "reason": "Generic stock photo of water droplet"}
]
Output ONLY the JSON array, no markdown fences."""


async def vision_verify_batch(
    client: Any,
    image_data: List[Tuple[str, bytes, str]],
    semaphore: asyncio.Semaphore,
    model: str,
) -> List[Dict[str, Any]]:
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

            if "```" in text:
                text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()

            verdicts = json.loads(text)
            if not isinstance(verdicts, list):
                verdicts = [verdicts]

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
    provider: Dict[str, Any],
    crawler: Any,
    http_client: httpx.AsyncClient,
    vision_client: Any,
    vision_semaphore: asyncio.Semaphore,
    args: argparse.Namespace,
) -> Dict[str, Any]:
    """
    Run the full A->B->C pipeline for one provider from DB.
    Returns dict with place_id, status, and image_urls list.
    """
    place_id      = str(provider.get("place_id", ""))
    name          = str(provider.get("name", ""))
    website       = str(provider.get("website_clean") or provider.get("website") or "").strip()
    best_evidence = str(provider.get("best_evidence_url") or "").strip()

    # Extract existing Google Maps photo URLs as fallback candidates
    existing_urls = provider.get("image_urls") or []
    if isinstance(existing_urls, str):
        try:
            existing_urls = json.loads(existing_urls)
        except (json.JSONDecodeError, TypeError):
            existing_urls = []
    google_photo_urls = [
        u for u in existing_urls
        if u and isinstance(u, str) and u.startswith("http")
    ]

    result = {
        "place_id": place_id,
        "name": name,
        "status": "pending",
        "image_urls": [],
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

            if len(pages_to_crawl) < MAX_PAGES:
                links = extract_service_links(html, page_url)
                for link in links:
                    if link not in crawled and len(pages_to_crawl) < MAX_PAGES:
                        pages_to_crawl.append(link)

    # Google Maps photo as fallback (only if no crawled candidates found)
    if not candidate_urls and google_photo_urls:
        candidate_urls.extend(google_photo_urls)
        logger.debug(f"  {name}: using {len(google_photo_urls)} Google photo fallback(s)")

    # ── B: Heuristic filter ───────────────────────────────────────────────────
    candidates = heuristic_filter(candidate_urls)
    candidates = candidates[:MAX_CANDIDATES]

    if not candidates:
        result["status"] = "no_candidates"
        logger.info(f"  {name}: no candidates after filter")
        return result

    if args.dry_run:
        result["status"] = "dry_run"
        logger.info(f"  {name}: [dry-run] {len(candidates)} candidates")
        return result

    # ── C: Claude Vision verification ─────────────────────────────────────────
    selected_urls: List[str] = []
    evaluated = 0

    for batch_start in range(0, len(candidates), VISION_BATCH_SIZE):
        if evaluated >= MAX_CANDIDATES or len(selected_urls) >= MAX_SELECTED:
            break

        batch_urls = candidates[batch_start : batch_start + VISION_BATCH_SIZE]

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
                and len(selected_urls) < MAX_SELECTED
            ):
                selected_urls.append(url)

    if selected_urls:
        result["status"] = "enriched"
        result["image_urls"] = selected_urls
        logger.info(f"  {name}: {len(selected_urls)} image(s) selected")
    else:
        result["status"] = "no_images_passed"
        logger.info(f"  {name}: 0 images passed Vision threshold")

    return result


# ─── Main ─────────────────────────────────────────────────────────────────────


async def run(args: argparse.Namespace) -> None:
    # Validate API key
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key and not args.dry_run:
        logger.error("ANTHROPIC_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)

    if not CRAWL4AI_AVAILABLE and not args.no_crawl:
        logger.warning(
            "crawl4ai not available — will skip website crawling. "
            "Use --no-crawl to silence this warning."
        )

    # Connect to Supabase
    logger.info("Connecting to Supabase...")
    supabase = get_supabase_client()

    # Fetch providers needing images
    logger.info("Fetching providers with empty image_urls...")
    providers = fetch_providers_needing_images(supabase, fetch_all=not args.only_empty)
    logger.info(f"Found {len(providers):,} providers needing images")

    if not providers:
        logger.info("All providers already have images. Nothing to do.")
        return

    # Load state for resume
    state = load_state(STATE_FILE)
    if not args.resume:
        state = {
            "processed_ids": [],
            "enriched_count": 0,
            "no_image_count": 0,
            "error_count": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        if STATE_FILE.exists():
            STATE_FILE.unlink()

    processed_ids = set(state["processed_ids"])
    remaining = [p for p in providers if p["place_id"] not in processed_ids]
    logger.info(f"Already processed: {len(processed_ids):,} | Remaining: {len(remaining):,}")

    if not remaining:
        logger.info("All providers already processed. Use without --resume to restart.")
        return

    # Initialise clients
    import anthropic as _anthropic

    vision_client    = _anthropic.AsyncAnthropic(api_key=api_key)
    vision_semaphore = asyncio.Semaphore(VISION_CONCURRENCY)

    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(IMAGE_TIMEOUT, connect=10),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        follow_redirects=True,
    )

    batch_size = args.batch_size

    try:
        async def _process_batch(batch: List[Dict[str, Any]], crawler: Any) -> None:
            tasks = [
                enrich_provider(
                    provider, crawler, http_client, vision_client, vision_semaphore, args
                )
                for provider in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for provider, result in zip(batch, results):
                pid = provider["place_id"]

                if isinstance(result, Exception):
                    logger.error(f"Error for {provider.get('name', '?')}: {result}")
                    state["error_count"] += 1
                    state["processed_ids"].append(pid)
                    continue

                if result["status"] == "enriched" and result["image_urls"]:
                    if not args.dry_run:
                        ok = update_provider_images(supabase, pid, result["image_urls"])
                        if ok:
                            state["enriched_count"] += 1
                            logger.info(f"  Updated {result['name']} with {len(result['image_urls'])} image(s)")
                        else:
                            state["error_count"] += 1
                    else:
                        state["enriched_count"] += 1
                else:
                    state["no_image_count"] += 1

                state["processed_ids"].append(pid)

        async def _run_batches(crawler: Any) -> None:
            for batch_start in range(0, len(remaining), batch_size):
                batch = remaining[batch_start : batch_start + batch_size]
                logger.info(
                    f"Batch {batch_start // batch_size + 1} | "
                    f"providers {batch_start + 1}–{batch_start + len(batch)} of {len(remaining)}"
                )
                await _process_batch(batch, crawler)

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

    total_processed = len(state["processed_ids"])
    enriched = state["enriched_count"]
    rate = f"{enriched / total_processed * 100:.1f}%" if total_processed else "N/A"

    logger.info(
        f"\n{'=' * 60}\n"
        f"Image enrichment complete\n"
        f"{'=' * 60}\n"
        f"  Total providers queried : {len(providers):,}\n"
        f"  Processed this run      : {total_processed - len(processed_ids):,}\n"
        f"  Enriched (>= 1 image)   : {enriched:,}\n"
        f"  No images found         : {state['no_image_count']:,}\n"
        f"  Errors                  : {state['error_count']:,}\n"
        f"  Enrichment rate         : {rate}\n"
        f"{'=' * 60}"
    )


# ─── CLI ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich providers in Supabase with service photos via Claude Vision",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
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
        "--only-empty", action="store_true",
        help="Only process providers with null/empty image_urls (default: all under-enriched)"
    )
    parser.add_argument(
        "--no-crawl", action="store_true",
        help="Skip Crawl4AI website crawling (no candidates without Google photo fallback)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Discover and filter candidates but skip Vision API calls and DB updates"
    )
    args = parser.parse_args()

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
