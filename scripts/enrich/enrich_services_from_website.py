#!/usr/bin/env python3
"""
Enrich provider_services table by crawling provider websites and classifying
them with Claude into canonical service tags.

For each provider with a website:
  - Crawl homepage + likely service pages (/services, /backflow, /plumbing, etc.)
  - Extract clean text
  - Ask Claude Haiku to classify into canonical service tags + evidence snippets
  - Upsert into provider_services
  - Update providers.service_tags (denormalised text[] for card display)

Usage:
    python scripts/enrich/enrich_services_from_website.py
    python scripts/enrich/enrich_services_from_website.py --limit 50
    python scripts/enrich/enrich_services_from_website.py --resume
    python scripts/enrich/enrich_services_from_website.py --place-id ChIJ...

Requirements (.env):
    ANTHROPIC_API_KEY=...
    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import anthropic
import httpx
from crawl4ai import AsyncWebCrawler
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ─── Config ───────────────────────────────────────────────────────────────────

ROOT        = Path(__file__).parent.parent.parent
LOG_DIR     = ROOT / "data" / "services_raw"
LOG_DIR.mkdir(parents=True, exist_ok=True)

ANTHROPIC_KEY   = os.environ.get("ANTHROPIC_API_KEY", "")
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
VISION_MODEL    = "claude-haiku-4-5-20251001"

CONCURRENCY     = 4
RATE_LIMIT_SLEEP = 1.0
MAX_PAGE_TEXT   = 6000   # chars fed to Claude per provider
RETRY_DELAYS    = [5, 15, 30]

# Subpaths to probe for service pages
SERVICE_SUBPATHS = [
    "/services", "/backflow", "/plumbing", "/testing",
    "/cross-connection", "/rpz", "/backflow-testing",
    "/backflow-prevention", "/services/backflow",
]

# Canonical tags the LLM must output
CANONICAL_TAGS = [
    "backflow_testing",
    "rpz_testing",
    "dcva_testing",
    "pvb_testing",
    "preventer_installation",
    "preventer_repair",
    "cross_connection_control",
    "annual_certification_filing",
    "sprinkler_backflow",
    "commercial",
    "residential",
    "emergency_service",
    "free_estimates",
    "same_day_service",
]

TAG_LABELS = {
    "backflow_testing":            "Backflow Testing",
    "rpz_testing":                 "RPZ Testing",
    "dcva_testing":                "DCVA Testing",
    "pvb_testing":                 "PVB Testing",
    "preventer_installation":      "Preventer Installation",
    "preventer_repair":            "Preventer Repair",
    "cross_connection_control":    "Cross-Connection Control",
    "annual_certification_filing": "Annual Certification",
    "sprinkler_backflow":          "Sprinkler Backflow",
    "commercial":                  "Commercial",
    "residential":                 "Residential",
    "emergency_service":           "Emergency Service",
    "free_estimates":              "Free Estimates",
    "same_day_service":            "Same-Day Service",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len].rsplit(" ", 1)[0] + "…"


async def crawl_page(crawler: AsyncWebCrawler, url: str) -> str:
    """Return cleaned markdown text from a URL, or ''."""
    try:
        result = await crawler.arun(
            url=url,
            bypass_cache=True,
            word_count_threshold=50,
            page_timeout=20000,
        )
        if result.success and result.markdown:
            # Strip nav/footer noise: remove lines shorter than 20 chars (link-only lines)
            lines = [l for l in result.markdown.splitlines() if len(l.strip()) > 20]
            return "\n".join(lines)
    except Exception as exc:
        log.debug("  crawl error %s: %s", url, exc)
    return ""


async def gather_page_text(crawler: AsyncWebCrawler, website: str) -> str:
    """Crawl homepage + plausible service pages; return combined text."""
    base = website.rstrip("/")
    urls_to_try = [base] + [base + sp for sp in SERVICE_SUBPATHS]

    texts: list[str] = []
    for url in urls_to_try[:5]:  # cap at 5 pages
        text = await crawl_page(crawler, url)
        if text:
            texts.append(f"[Page: {url}]\n{text[:2000]}")
        if sum(len(t) for t in texts) >= MAX_PAGE_TEXT:
            break

    return "\n\n".join(texts)[:MAX_PAGE_TEXT]


def build_classification_prompt(provider_name: str, website: str, page_text: str) -> str:
    tags_list = "\n".join(f"  - {t}: {TAG_LABELS[t]}" for t in CANONICAL_TAGS)
    return f"""You are extracting structured service data from a plumbing/HVAC business website.

Business: {provider_name}
Website: {website}

Website text (extracted):
---
{page_text}
---

Return a JSON object with exactly this structure:
{{
  "services": {{
    {', '.join(f'"{t}": true/false' for t in CANONICAL_TAGS[:5])},
    ...all {len(CANONICAL_TAGS)} tags
  }},
  "evidence": {{
    "tag_name": [{{"source": "website", "url": "page_url", "snippet": "exact quote from text"}}]
    // only include tags where evidence was found
  }}
}}

Canonical tags to classify:
{tags_list}

Rules:
- Set a tag to true ONLY if the website text clearly mentions that service.
- For evidence, extract a direct quote (≤ 120 chars) from the text that supports the tag.
- If uncertain, set false.
- Return ONLY the JSON object, no explanation."""


async def classify_with_claude(
    client: anthropic.AsyncAnthropic,
    provider_name: str,
    website: str,
    page_text: str,
) -> dict | None:
    """Call Claude Haiku to classify services. Returns parsed dict or None."""
    prompt = build_classification_prompt(provider_name, website, page_text)

    for attempt, delay in enumerate([0] + RETRY_DELAYS, 1):
        if delay:
            log.warning("  Claude retry %d after %ds …", attempt, delay)
            await asyncio.sleep(delay)
        try:
            msg = await client.messages.create(
                model=VISION_MODEL,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text.strip()
            # Extract JSON block if wrapped in markdown fences
            json_match = re.search(r"```(?:json)?\s*([\s\S]+?)```", raw)
            json_str = json_match.group(1) if json_match else raw
            return json.loads(json_str)
        except json.JSONDecodeError as exc:
            log.warning("  JSON parse error: %s", exc)
            return None
        except anthropic.RateLimitError:
            if attempt > len(RETRY_DELAYS):
                return None
        except Exception as exc:
            log.error("  Claude error: %s", exc)
            return None
    return None


async def process_provider(
    crawler: AsyncWebCrawler,
    claude: anthropic.AsyncAnthropic,
    supabase: Client,
    provider: dict,
    sem: asyncio.Semaphore,
) -> bool:
    place_id = provider["place_id"]
    name     = provider.get("name", "?")
    website  = provider.get("website_clean") or provider.get("website", "")

    if not website or not website.startswith("http"):
        log.info("Skip (no website): %s", name[:40])
        return False

    async with sem:
        log.info("Processing: %s → %s", name[:40], website[:50])

        page_text = await gather_page_text(crawler, website)
        if not page_text.strip():
            log.info("  no page text extracted")
            return False

        # Save raw for debugging
        (LOG_DIR / f"{place_id}.txt").write_text(page_text[:5000])

        result = await classify_with_claude(claude, name, website, page_text)

    if not result:
        log.info("  classification failed")
        return False

    services_json = result.get("services", {})
    evidence_json = result.get("evidence", {})

    # Normalise: ensure all canonical tags present as bool
    for tag in CANONICAL_TAGS:
        if tag not in services_json:
            services_json[tag] = False

    # Build tag label list for denormalised column (true tags only, ordered by importance)
    true_tags = [t for t in CANONICAL_TAGS if services_json.get(t)]
    tag_labels = [TAG_LABELS[t] for t in true_tags]

    log.info("  services: %s", ", ".join(tag_labels[:5]) or "none")

    try:
        supabase.table("provider_services").upsert({
            "place_id":      place_id,
            "services_json": services_json,
            "evidence_json": evidence_json,
            "updated_at":    datetime.now(timezone.utc).isoformat(),
        }, on_conflict="place_id").execute()

        # Update denormalised service_tags on providers
        supabase.table("providers").update(
            {"service_tags": tag_labels[:8]}  # cap to 8 tags
        ).eq("place_id", place_id).execute()

    except Exception as exc:
        log.error("  supabase error: %s", exc)
        return False

    return True


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    if not ANTHROPIC_KEY:
        log.error("ANTHROPIC_API_KEY not set in .env")
        sys.exit(1)

    supabase = get_supabase()
    claude   = anthropic.AsyncAnthropic(api_key=ANTHROPIC_KEY)

    if args.place_id:
        res = supabase.table("providers").select("place_id,name,website,website_clean").eq("place_id", args.place_id).execute()
        providers = res.data or []
    elif args.resume:
        done_res  = supabase.table("provider_services").select("place_id").execute()
        done_ids  = {r["place_id"] for r in (done_res.data or [])}
        all_res   = supabase.table("providers").select("place_id,name,website,website_clean").not_.is_("website", "null").execute()
        providers = [p for p in (all_res.data or []) if p["place_id"] not in done_ids]
        log.info("%d already done; %d remaining", len(done_ids), len(providers))
    else:
        res = supabase.table("providers").select("place_id,name,website,website_clean").not_.is_("website", "null").execute()
        providers = res.data or []

    if args.limit:
        providers = providers[:args.limit]

    log.info("Processing %d providers …", len(providers))

    sem     = asyncio.Semaphore(CONCURRENCY)
    success = 0

    async with AsyncWebCrawler(verbose=False) as crawler:
        for i in range(0, len(providers), CONCURRENCY):
            batch = providers[i : i + CONCURRENCY]
            tasks = [process_provider(crawler, claude, supabase, p, sem) for p in batch]
            results = await asyncio.gather(*tasks)
            success += sum(1 for r in results if r)
            log.info("Progress: %d/%d ✓", i + len(batch), len(providers))
            await asyncio.sleep(RATE_LIMIT_SLEEP)

    log.info("\n✓ Done. Enriched %d/%d providers with services.", success, len(providers))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich provider_services via website crawl + Claude")
    parser.add_argument("--limit",    type=int, help="Only process first N providers")
    parser.add_argument("--resume",   action="store_true", help="Skip providers already in DB")
    parser.add_argument("--place-id", type=str, help="Process a single provider by place_id")
    asyncio.run(main(parser.parse_args()))
