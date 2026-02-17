# Enrichment Scripts

Three scripts that enrich provider data beyond the base verified dataset.

## Setup

All scripts share the same `.env` at the project root:

```env
ANTHROPIC_API_KEY=sk-ant-...
OUTSCRAPER_API_KEY=...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Install dependencies (already in `crawler/requirements.txt`):
```bash
pip install outscraper crawl4ai anthropic httpx supabase python-dotenv pandas tqdm
```

## 1. Database Migration (run once)

In Supabase SQL editor, run:

```
supabase/migrations/005_provider_services_reviews.sql
```

This creates:
- `provider_services` — service tags + evidence per provider
- `provider_reviews` — 3-4 best Google review excerpts per provider
- Adds `service_tags text[]` and `top_review_excerpt text` to `providers`

---

## 2. `enrich_reviews_outscraper.py`

Fetches real Google reviews via Outscraper and populates `provider_reviews`.

### What it does
- Calls `GET https://api.app.outscraper.com/maps/reviews-v2` per provider
- Fetches up to 30 reviews (most_relevant sort)
- Selects 3–4 best: non-empty, ≥ 50 chars, rating ≥ 4 (falls back to 3+)
- Stores initials only (e.g. `J.D.`) — never full names
- Updates `providers.top_review_excerpt` for fast card display

### Usage
```bash
# Full run (all providers)
python scripts/enrich/enrich_reviews_outscraper.py

# First 50 providers only (test run)
python scripts/enrich/enrich_reviews_outscraper.py --limit 50

# Skip providers that already have reviews
python scripts/enrich/enrich_reviews_outscraper.py --resume

# Single provider debug
python scripts/enrich/enrich_reviews_outscraper.py --place-id ChIJxxxxxx
```

### Output
- `provider_reviews` table populated
- `data/reviews_raw/{place_id}.json` — raw Outscraper responses

### Cost estimate
~750 providers × 30 reviews = ~22,500 review fetches.
Check Outscraper pricing at https://app.outscraper.com/pricing.

---

## 3. `enrich_services_from_website.py`

Crawls provider websites and uses Claude Haiku to classify services.

### What it does
- Crawls homepage + service subpaths (`/services`, `/backflow`, `/rpz`, etc.)
- Passes clean text to Claude Haiku with a structured classification prompt
- Outputs 14 canonical service tag booleans + evidence snippets
- Updates `provider_services` table + `providers.service_tags` array

### Canonical tags
| Tag | Label |
|-----|-------|
| `backflow_testing` | Backflow Testing |
| `rpz_testing` | RPZ Testing |
| `dcva_testing` | DCVA Testing |
| `pvb_testing` | PVB Testing |
| `preventer_installation` | Preventer Installation |
| `preventer_repair` | Preventer Repair |
| `cross_connection_control` | Cross-Connection Control |
| `annual_certification_filing` | Annual Certification |
| `sprinkler_backflow` | Sprinkler Backflow |
| `commercial` | Commercial |
| `residential` | Residential |
| `emergency_service` | Emergency Service |
| `free_estimates` | Free Estimates |
| `same_day_service` | Same-Day Service |

### Usage
```bash
# Full run
python scripts/enrich/enrich_services_from_website.py

# Test run (first 20)
python scripts/enrich/enrich_services_from_website.py --limit 20

# Skip already-processed
python scripts/enrich/enrich_services_from_website.py --resume

# Single provider
python scripts/enrich/enrich_services_from_website.py --place-id ChIJxxxxxx
```

### Output
- `provider_services` table populated
- `data/services_raw/{place_id}.txt` — raw crawled text for debugging

### Cost estimate
~600 providers with websites × 1 Claude Haiku call ≈ small (Haiku is ~$0.25/1M input tokens).

---

## 4. `nyc_rescrape.py`

Rescrapes Google Maps for NYC boroughs to find new backflow tester candidates.

### What it does
- Runs 11 targeted queries across Manhattan, Brooklyn, Queens, Bronx, Staten Island
- Applies a category blacklist (training schools, supply houses, etc.)
- Deduplicates by `place_id`
- Outputs a CSV of new candidates

### Usage
```bash
python scripts/enrich/nyc_rescrape.py
python scripts/enrich/nyc_rescrape.py --out data/nyc_candidates.csv --limit 100
```

### Next steps after running
```bash
# Verify the candidates through the backflow verification pipeline
python crawler/03_verify_backflow.py --input data/nyc_candidates.csv
```

---

## Monthly Refresh Cron

To keep reviews and services fresh, run monthly:

```bash
# 1. Refresh reviews (skip providers already done this month)
python scripts/enrich/enrich_reviews_outscraper.py --resume

# 2. Refresh services for any new providers
python scripts/enrich/enrich_services_from_website.py --resume

# 3. Optionally rescrape NYC for new providers
python scripts/enrich/nyc_rescrape.py
```

Example cron entry (runs 1st of each month at 2am):
```
0 2 1 * * cd /path/to/crawler && python scripts/enrich/enrich_reviews_outscraper.py --resume >> logs/enrich.log 2>&1
```

Or as a GitHub Actions scheduled workflow:
```yaml
on:
  schedule:
    - cron: '0 2 1 * *'
```
