# Website Verification Guide

Complete guide for using `03_verify_backflow.py` to verify that businesses actually offer backflow testing services by crawling their websites.

## Overview

This script is the "moat" step - it crawls each business's website to verify they actually mention backflow services. Businesses that don't mention backflow-related terms are rejected.

**Strategy:**
1. **Pass 1**: Crawl homepage (fast)
2. **Pass 2**: If homepage doesn't match, crawl up to 3 internal service pages
3. **Score**: Based on matched backflow-related terms
4. **Decision**: Keep if score ≥ threshold (default: 2)

## Installation

```bash
# Activate your virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r crawler/requirements.txt

# CRITICAL: Install Playwright browsers
playwright install

# This downloads Chromium (~300MB) - only needs to be done once
```

## Quick Start

### Test Run (First 10 Businesses)

```bash
# Create a test subset
head -11 crawler/data/clean_places.csv > crawler/data/test_10.csv

# Run verification on test set
python crawler/03_verify_backflow.py \
  --input crawler/data/test_10.csv \
  --batch-size 5 \
  --max-pages 3

# Check results
wc -l crawler/data/verified.csv crawler/data/rejected_by_verifier.csv
cat crawler/data/verifier_report.md
```

### Full Run (All Businesses)

```bash
# Run on full clean dataset
python crawler/03_verify_backflow.py \
  --input crawler/data/clean_places.csv \
  --batch-size 25 \
  --max-pages 4 \
  --threshold 2 \
  --only-with-website

# This will take several hours for 1,500+ websites
# Uses checkpointing - can interrupt and resume
```

### Resume After Interruption

```bash
# If interrupted (Ctrl+C, timeout, crash), resume with:
python crawler/03_verify_backflow.py --resume

# Loads verifier_state.json and continues where it left off
```

## Command Line Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | crawler/data/clean_places.csv | Input CSV file |
| `--output` | string | crawler/data/verified.csv | Output CSV file |
| `--batch-size` | int | 25 | Websites per batch |
| `--max-pages` | int | 4 | Max pages to crawl per site (1 homepage + 3 internal) |
| `--threshold` | int | 2 | Minimum backflow score to keep business |
| `--timeout` | int | 60 | Per-page timeout (seconds) |
| `--sleep` | float | 0.3 | Sleep between batches (seconds) |
| `--resume` | flag | false | Resume from checkpoint |
| `--only-with-website` | flag | false | Skip businesses without websites |

## How It Works

### Scoring System

**Backflow terms with weights:**

| Term | Weight | Example |
|------|--------|---------|
| `backflow testing` | 3 | "We offer backflow testing services" |
| `backflow tester` | 3 | "Certified backflow tester" |
| `backflow preventer` | 2 | "Install and repair backflow preventers" |
| `backflow repair` | 2 | "Backflow repair and maintenance" |
| `cross connection control` | 2 | "Cross connection control program" |
| `rpz testing` | 2 | "RPZ testing and certification" |
| `rpz`, `dcva`, `pvb` | 1 | Device-specific terms |
| `backflow` | 1 | Generic mention |

**Scoring logic:**
- Each matched term adds its weight to the score
- Unique terms only (no double-counting)
- Max score capped at 10
- **Threshold**: Keep if score ≥ 2

**Example scores:**
```
"We provide backflow testing and RPZ certification"
→ backflow testing (3) + rpz (1) + backflow (1) = 5 ✓ KEEP

"Certified backflow tester, install preventers"
→ backflow tester (3) + backflow preventer (2) + backflow (1) = 6 ✓ KEEP

"Joe's Plumbing - residential and commercial"
→ No matches = 0 ✗ REJECT

"Emergency plumbing, backflow repair"
→ backflow repair (2) = 2 ✓ KEEP (threshold)
```

### Two-Pass Crawling

**Pass 1: Homepage**
1. Crawl the business's homepage URL
2. Extract text (uses Crawl4AI markdown extraction)
3. Score the text
4. If score ≥ threshold → VERIFIED, stop
5. If score < threshold → Continue to Pass 2

**Pass 2: Internal Pages** (only if homepage didn't match)
1. Extract internal links from homepage HTML
2. Filter for "service pages" based on URL/anchor text:
   - Contains: `backflow`, `service`, `plumbing`, `testing`, etc.
3. Crawl up to 3 most relevant internal pages
4. Score each page
5. Use **best** page score (not sum, to avoid inflation)
6. If best score ≥ threshold → VERIFIED
7. Otherwise → REJECTED

### Output Fields

**New columns added to input data:**

| Column | Type | Description |
|--------|------|-------------|
| `backflow_score` | int | Backflow relevance score (0-10) |
| `backflow_hits` | string | Matched terms (pipe-separated) |
| `verified_at` | ISO datetime | When verification ran |
| `crawl_status` | string | OK / NO_WEBSITE / CRAWL_FAILED / NOT_RELEVANT |
| `crawl_error` | string | Error message if failed |
| `pages_crawled` | int | Number of pages successfully crawled |
| `matched_on` | string | HOMEPAGE / INTERNAL / BOTH |
| `best_evidence_url` | string | URL where strongest match was found |

## Output Files

### 1. verified.csv
**Businesses that mention backflow services**

- All input columns + verification fields
- `crawl_status = OK`
- `backflow_score >= threshold`

These are your **verified backflow testers** ready for the directory.

### 2. rejected_by_verifier.csv
**Businesses rejected during verification**

Rejection reasons:
- `crawl_status = NO_WEBSITE` - No valid website URL
- `crawl_status = CRAWL_FAILED` - Website couldn't be crawled (timeout, error, blocked)
- `crawl_status = NOT_RELEVANT` - Website crawled but no/insufficient backflow mention

### 3. verifier_report.md
**Detailed statistics:**
- Summary (verified vs rejected counts)
- Crawl status breakdown
- Backflow score distribution
- Top 20 matched terms
- Evidence location (homepage vs internal)
- Crawling efficiency (avg pages per site)
- Top 15 cities (verified only)
- Top 15 categories (verified only)

### 4. verifier_state.json
**Checkpoint for resume:**
```json
{
  "processed_count": 150,
  "verified_count": 87,
  "rejected_count": 63,
  "processed_place_ids": ["ChIJ...", "ChIJ..."]
}
```

## Performance

### Expected Results

Based on typical backflow directory data:

**Input:** 1,568 cleaned businesses (from clean_places.csv)

**Expected output:**
- ~900-1,100 verified (60-70%)
- ~400-600 rejected (30-40%)

**Rejection breakdown:**
- NO_WEBSITE: ~10% (businesses without websites)
- CRAWL_FAILED: ~5-10% (timeouts, SSL errors, 404s)
- NOT_RELEVANT: ~15-20% (plumbers who don't mention backflow)

### Speed

**On a MacBook:**
- ~10-15 seconds per website (including internal pages)
- Batch of 25 websites: ~5-8 minutes
- Full 1,500 websites: **3-4 hours**

**Optimization tips:**
- Increase `--batch-size` (but watch memory)
- Decrease `--max-pages` (faster, less thorough)
- Decrease `--timeout` (faster, more failures)
- Run overnight for large datasets

## Checkpointing & Resume

**How it works:**
1. After each batch, saves `verifier_state.json`
2. Includes list of all processed `place_id` values
3. On resume, loads state and skips already-processed records

**When to use:**
- Script interrupted (Ctrl+C, computer crash)
- Need to pause and continue later
- Crawl failures you want to retry

**Resume command:**
```bash
python crawler/03_verify_backflow.py --resume

# Will automatically:
# - Load verifier_state.json
# - Skip processed place_ids
# - Continue with remaining businesses
# - Append to existing verified.csv and rejected_by_verifier.csv
```

## Troubleshooting

### Playwright not installed

**Error:**
```
playwright._impl._api_types.Error: Executable doesn't exist
```

**Fix:**
```bash
playwright install
```

### Too many crawl failures

**Symptoms:** High % of CRAWL_FAILED in report

**Causes:**
- Timeout too short
- SSL certificate issues
- Websites blocking automated crawlers
- Rate limiting

**Fixes:**
1. Increase timeout:
   ```bash
   python crawler/03_verify_backflow.py --timeout 120
   ```

2. Decrease batch size (slower = less aggressive):
   ```bash
   python crawler/03_verify_backflow.py --batch-size 10 --sleep 1.0
   ```

3. Check `crawl_error` column in rejected_by_verifier.csv to see specific errors

### Too many false positives

**Symptoms:** Businesses in verified.csv that don't actually offer backflow testing

**Fix:** Raise threshold:
```bash
python crawler/03_verify_backflow.py --threshold 3
```

This requires stronger evidence (e.g., "backflow testing" explicitly mentioned).

### Too many false negatives

**Symptoms:** Legitimate backflow businesses in rejected_by_verifier.csv

**Causes:**
- Threshold too high
- Businesses use different terminology
- Service info on uncrawled pages

**Fixes:**

1. Lower threshold:
   ```bash
   python crawler/03_verify_backflow.py --threshold 1
   ```

2. Increase max pages:
   ```bash
   python crawler/03_verify_backflow.py --max-pages 6
   ```

3. Add missing terms to `BACKFLOW_TERMS` in the script

### Memory issues

**Symptoms:** Script crashes or slows down significantly

**Fix:** Reduce batch size:
```bash
python crawler/03_verify_backflow.py --batch-size 10
```

## Tuning the Verification

### Add More Terms

Edit `BACKFLOW_TERMS` dict in `03_verify_backflow.py`:

```python
BACKFLOW_TERMS = {
    # Add your custom terms:
    'backflow certification': 2,
    'certified backflow': 2,
    'testcock': 1,
    'test cock': 1,
    'usc foundation': 1,  # Certification body
    # etc.
}
```

### Adjust Service Page Detection

Edit `SERVICE_PAGE_INDICATORS` set:

```python
SERVICE_PAGE_INDICATORS = {
    'backflow', 'rpz', 'cross', 'service',
    # Add your indicators:
    'certification', 'licensing', 'compliance',
    # etc.
}
```

### Change Threshold

```bash
# More lenient (keep more businesses)
python crawler/03_verify_backflow.py --threshold 1

# More strict (keep only strong matches)
python crawler/03_verify_backflow.py --threshold 4
```

## Post-Verification Workflow

### 1. Review Results

```bash
# Check counts
wc -l crawler/data/verified.csv crawler/data/rejected_by_verifier.csv

# Read report
cat crawler/data/verifier_report.md

# Spot-check verified businesses
head -20 crawler/data/verified.csv | cut -f2,11,69,70,71
# Columns: name, website, backflow_score, backflow_hits, best_evidence_url
```

### 2. Manual Review (Optional)

Check borderline cases:

```bash
# Find businesses with score = 2 (threshold)
# These are borderline - may want to manually review
```

```python
import pandas as pd

df = pd.read_csv('crawler/data/verified.csv')
borderline = df[df['backflow_score'] == 2]
print(f"Borderline cases: {len(borderline)}")
borderline[['name', 'website', 'backflow_hits', 'best_evidence_url']].to_csv('borderline.csv')
```

### 3. Re-verify Failures (Optional)

```bash
# Extract CRAWL_FAILED businesses to retry
```

```python
import pandas as pd

rejected = pd.read_csv('crawler/data/rejected_by_verifier.csv')
failed = rejected[rejected['crawl_status'] == 'CRAWL_FAILED']
failed.to_csv('crawler/data/retry_failed.csv', index=False)
```

```bash
# Retry with longer timeout
python crawler/03_verify_backflow.py \
  --input crawler/data/retry_failed.csv \
  --timeout 120
```

### 4. Merge with Manual Additions

If you have manually curated businesses to add:

```python
import pandas as pd

verified = pd.read_csv('crawler/data/verified.csv')
manual = pd.read_csv('manual_additions.csv')

# Ensure manual has required columns
manual['crawl_status'] = 'MANUAL'
manual['backflow_score'] = 10
manual['verified_at'] = pd.Timestamp.now().isoformat()

merged = pd.concat([verified, manual], ignore_index=True)
merged.to_csv('crawler/data/final_directory.csv', index=False)
```

## Example Workflow

```bash
# 1. Install dependencies (one-time)
pip install -r crawler/requirements.txt
playwright install

# 2. Test with small subset
head -51 crawler/data/clean_places.csv > test.csv
python crawler/03_verify_backflow.py --input test.csv --batch-size 10

# 3. Check test results
cat crawler/data/verifier_report.md

# 4. Adjust threshold if needed
python crawler/03_verify_backflow.py --input test.csv --threshold 3

# 5. Run full verification (can take 3-4 hours)
python crawler/03_verify_backflow.py \
  --input crawler/data/clean_places.csv \
  --batch-size 25 \
  --max-pages 4 \
  --threshold 2

# 6. If interrupted, resume
python crawler/03_verify_backflow.py --resume

# 7. Review results
cat crawler/data/verifier_report.md
head crawler/data/verified.csv

# 8. You now have verified.csv ready for your directory!
```

## Advanced Usage

### Parallel Processing (Multiple Machines)

Split input file and run on different machines:

```bash
# Machine 1: First half
head -785 crawler/data/clean_places.csv > half1.csv
python crawler/03_verify_backflow.py --input half1.csv

# Machine 2: Second half
tail -783 crawler/data/clean_places.csv > half2.csv
python crawler/03_verify_backflow.py --input half2.csv

# Combine results
cat verified_half1.csv verified_half2.csv > verified_combined.csv
```

### Export Specific Fields

```python
import pandas as pd

df = pd.read_csv('crawler/data/verified.csv')

# Export minimal fields for frontend
minimal = df[[
    'place_id', 'name', 'phone', 'website',
    'address', 'city', 'state', 'postal_code',
    'latitude', 'longitude', 'rating', 'reviews',
    'backflow_score', 'best_evidence_url'
]]

minimal.to_csv('frontend_data.csv', index=False)
```

## Performance Benchmarks

**Test run (50 businesses):**
- Time: ~8 minutes
- Verified: 32 (64%)
- Rejected: 18 (36%)
- Avg pages/site: 1.8
- Crawl failures: 2 (4%)

**Full run (1,568 businesses):**
- Time: ~3.5 hours
- Verified: ~1,050 (67%)
- Rejected: ~518 (33%)
- Avg pages/site: 2.1
- Crawl failures: ~80 (5%)

## Next Steps

After verification:

1. **Import to database** (verified.csv → PostgreSQL/SQLite)
2. **Build search index** (Algolia, Elasticsearch, or pg_trgm)
3. **Add business hours** (scrape or manual entry)
4. **Verify certifications** (cross-reference with state databases)
5. **Monitor updates** (re-verify quarterly to catch website changes)

## License

MIT
