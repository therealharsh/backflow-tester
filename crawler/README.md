# Crawler Pipeline

End-to-end pipeline to discover, verify, and ingest backflow service providers from Google Maps into the Supabase database.

## Pipeline Overview

```
target_cities.csv
    |
01_outscrape.py        -> raw_places.csv        (Google Maps scrape via Outscraper API)
    |
02_clean.py            -> clean_places.csv      (dedup, filter, normalize)
    |
03_verify_and_enrich.py -> verified.csv          (Crawl4AI website verification + enrichment)
    |
04_upsert_supabase.py  -> providers + cities DB  (idempotent upsert)
    |
05_refresh_sitemap.sh  -> rebuilt Next.js app    (sitemap + static pages)
```

## Setup

### 1. Create virtual environment

```bash
cd crawler
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install
```

### 2. Environment variables

Create a `.env` file in the **repo root**:

```
OUTSCRAPER_API_KEY=your-outscraper-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Cities file

The pipeline reads `crawler/data/target_cities.csv` with columns:

```
priority_tier,city,state,metro_or_region,notes
```

## Running the Pipeline

### Via Make (recommended)

```bash
# Full pipeline
make crawl-all

# Individual steps
make crawl-outscrape
make crawl-clean
make crawl-verify
make crawl-upsert
make crawl-sitemap
```

### Via npm (from web/)

```bash
npm run crawl:all        # full pipeline
npm run crawl:outscrape  # step 1 only
npm run crawl:clean      # step 2 only
npm run crawl:verify     # step 3 only
npm run crawl:upsert     # step 4 only
npm run crawl:sitemap    # step 5 only
```

### Manual execution

```bash
source crawler/.venv/bin/activate

# Step 1: Scrape Google Maps (test with 3 cities first)
python crawler/01_outscrape.py --cities crawler/data/target_cities.csv --head 3

# Step 2: Clean and deduplicate
python crawler/02_clean.py

# Step 3: Verify websites and extract service tags
python crawler/03_verify_and_enrich.py --batch-size 10

# Step 4: Upsert to Supabase (dry-run first)
python crawler/04_upsert_supabase.py --dry-run
python crawler/04_upsert_supabase.py

# Step 5: Rebuild sitemap
bash crawler/05_refresh_sitemap.sh
```

## Pipeline Steps

### Step 1: `01_outscrape.py` — Google Maps Scrape (Outscraper API)

Scrapes Google Maps listings using the Outscraper API. Returns full business data: name, address, phone, website, rating, reviews, place_id, images, and more.

**Saves money**: At startup, queries Supabase for existing place_ids and filters them from results so you only pay for new data. Use `--no-skip-existing` to re-scrape everything.

**Keywords**: backflow testing, backflow preventer, rpz testing, cross connection control, backflow repair, plumber backflow

| Flag | Default | Description |
|------|---------|-------------|
| `--cities` | `crawler/data/target_cities.csv` | Cities CSV path |
| `--batch-size` | 10 | Queries per Outscraper batch |
| `--limit` | 50 | Max results per query |
| `--sleep` | 0.5 | Sleep between batches (seconds) |
| `--head` | 0 | Only first N cities (0 = all) |
| `--resume` | false | Resume from checkpoint |
| `--max-retries` | 5 | Retry attempts per batch |
| `--tier` | 0 | Filter to priority tier (0 = all) |
| `--no-skip-existing` | false | Re-scrape even if already in DB |

**Requires**: `OUTSCRAPER_API_KEY` in `.env`

**Output**: `crawler/data/raw_places.csv`

### Step 2: `02_clean.py` — Clean & Deduplicate

Filters raw data for quality and relevance:
- Removes records missing required fields (name, address, city, state, ID)
- Filters non-operational businesses
- Quality threshold: reviews > 3 or (has rating and reviews > 10)
- Backflow relevance scoring (keyword matching in name, categories)
- Dedup by place_id, then google_id, then normalized name+address
- Website normalization (strips tracking params, canonicalizes)

**Output**: `crawler/data/clean_places.csv`, `crawler/data/rejected_places.csv`, `crawler/data/cleaning_report.md`

### Step 3: `03_verify_and_enrich.py` — Website Verification + Enrichment

Crawls provider websites with Crawl4AI to verify backflow services and extract:
- **Backflow score** (weighted term matching, tier assignment: testing/service/none)
- **Service tags** (14 canonical tags: Backflow Testing, RPZ Testing, Residential, etc.)
- **Service area text** (from "serving..." patterns)
- **Description snippet** (first ~200 chars of about text)
- **Booking URL** (links containing "book", "quote", "schedule")

Two-pass strategy: homepage first, then internal service pages if needed.

| Flag | Default | Description |
|------|---------|-------------|
| `--batch-size` | 25 | Websites per batch |
| `--max-pages` | 4 | Max pages per site |
| `--threshold` | 2 | Min backflow score to keep |
| `--resume` | false | Resume from checkpoint |

**Output**: `crawler/data/verified.csv`, `crawler/data/rejected_by_verifier.csv`

### Step 4: `04_upsert_supabase.py` — Database Ingestion

Reads verified.csv and upserts to three Supabase tables:
- **providers** — main business records (on_conflict="place_id")
- **cities** — aggregated provider counts per city (on_conflict="city_slug,state_code")
- **provider_services** — canonical service tags (on_conflict="place_id")

Generates slugs, cleans data types, handles image URL parsing.

| Flag | Default | Description |
|------|---------|-------------|
| `--dry-run` | false | Show what would be upserted without writing |
| `--batch-size` | 100 | Providers per upsert batch |

### Step 5: `05_refresh_sitemap.sh` — Sitemap Rebuild

Runs `npm run build` in `web/` to regenerate the sitemap and static pages. The sitemap generator fetches live data from Supabase, so new providers are automatically included.

## Output Files

| File | Description |
|------|-------------|
| `data/raw_places.csv` | Raw Google Maps results |
| `data/run_state.json` | Scraper checkpoint |
| `data/clean_places.csv` | Cleaned, deduplicated records |
| `data/rejected_places.csv` | Records removed during cleaning |
| `data/cleaning_report.md` | Cleaning statistics |
| `data/verified.csv` | Website-verified providers with service tags |
| `data/rejected_by_verifier.csv` | Failed verification |
| `data/verifier_report.md` | Verification statistics |
| `data/crawler.log` | Step 1 log |
| `data/02_clean_places.log` | Step 2 log |
| `data/verifier.log` | Step 3 log |

## Resume / Checkpoint

Steps 1 and 3 support `--resume` to continue from where they left off:

```bash
# If step 1 was interrupted:
python crawler/01_outscrape.py --resume

# If step 3 was interrupted:
python crawler/03_verify_and_enrich.py --resume
```

Checkpoint state is saved to `data/run_state.json` (step 1) and `data/verifier_state.json` (step 3).

## Environment Variables

| Variable | Required By | Description |
|----------|-------------|-------------|
| `OUTSCRAPER_API_KEY` | Step 1 | Outscraper API key |
| `SUPABASE_URL` | Steps 1, 4 | Supabase project URL (step 1 uses it to skip existing) |
| `SUPABASE_SERVICE_ROLE_KEY` | Steps 1, 4 | Supabase service role key |
