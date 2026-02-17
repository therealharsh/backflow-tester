# Advanced Data Cleaning Guide

Complete guide for using `02_clean_places.py` to produce high-quality backflow testing directory data.

## Quick Start

```bash
# Basic usage (uses defaults)
python crawler/02_clean_places.py

# Custom paths
python crawler/02_clean_places.py \
  --input crawler/data/raw_places.csv \
  --output crawler/data/clean_places.csv \
  --rejected crawler/data/rejected_places.csv \
  --report crawler/data/cleaning_report.md

# Adjust quality threshold
python crawler/02_clean_places.py --min-reviews 5
```

## What It Does

### 1. Removal Criteria (Applied in Order)

#### A. Missing Required Fields
**Removes if missing any of:**
- `name`
- `address` (or `street`)
- `city`
- `state` or `state_code`
- `place_id` or `google_id` or `cid`

**Result from your data:** 1 record removed (0.0%)

#### B. Not Operational
**Removes if:**
- `business_status` is not "OPERATIONAL"
- Name contains "permanently closed" or "closed"

**Result from your data:** 77 records removed (2.1%)

#### C. Low Quality
**Removes if:**
- Reviews ≤ 3 (default threshold)
- OR: No rating AND reviews ≤ 10

**Result from your data:** 551 records removed (14.9%)

**To adjust:** Use `--min-reviews N` flag

#### D. Not Backflow Relevant
**Removes ONLY if 95%+ confident it's NOT relevant** (relevance score < 5)

**Keeps businesses if:**
- Name/description mentions: backflow, RPZ, cross connection, etc.
- Category includes: Plumber, Irrigation, Sprinkler, Water testing, Fire protection
- Website URL contains "backflow"
- Any uncertainty → KEEPS the record

**Result from your data:** 663 records removed (17.9%)

### 2. Deduplication

**Deduplication keys (in priority order):**
1. `place_id` - Google's unique identifier
2. `google_id` - Alternative ID
3. Normalized `(name + street + postal_code)`

**When duplicates found, keeps the best record:**
- Prefer: Real business website over booking sites
- Then: Higher review count
- Then: Higher rating
- Then: More complete data

**Result from your data:** 849 duplicates removed

### 3. Computed Fields Added

| Field | Description |
|-------|-------------|
| `website_clean` | Normalized URL (no tracking params, https, no trailing slash) |
| `website_domain` | Domain without www (e.g., "rotorooter.com") |
| `website_is_booking` | True if Yelp, HomeAdvisor, Thumbtack, etc. |
| `website_missing` | True if no valid website |
| `backflow_score` | Relevance score (0-100) |

### 4. Sorting

Final output is sorted by quality:
- `backflow_score + (reviews / 10)`

Most relevant, highest-quality businesses appear first.

## Output Files

### 1. clean_places.csv
**1,568 high-quality backflow testing businesses** ready for your directory

**Data quality:**
- 89.7% have websites
- 97.6% have phone numbers
- 93.8% have ratings

**Top cities:**
- Louisville, KY: 39
- Cape Coral, FL: 34
- Tucson, AZ: 30
- Orlando, FL: 30

### 2. rejected_places.csv
**1,292 rejected records** with `rejection_reason` column

Reasons:
- `NOT_RELEVANT` (51.3%): Not backflow businesses
- `LOW_QUALITY` (42.6%): Too few reviews/ratings
- `NOT_OPERATIONAL` (6.0%): Closed businesses
- `MISSING_REQUIRED` (0.1%): Missing critical fields

### 3. cleaning_report.md
**Detailed statistics** including:
- Summary (acceptance rate: 42.3%)
- Rejection breakdown
- Data completeness
- Backflow relevance scores
- Top 20 cities
- Top 20 categories
- Top 15 website domains

## Key Heuristics

### Backflow Relevance Scoring

**Points awarded:**
- Each backflow keyword found: +10 points
  - Keywords: backflow, RPZ, cross connection, DCVA, PVB, etc.
- "Backflow" in business name: +30 points
- "Backflow" in website URL: +20 points
- "RPZ" or "cross connection" in name: +25 points
- Relevant category (plumber, irrigation): +15 points
- Plumber WITH backflow mention: +20 points
- Plumber WITHOUT backflow mention: +5 points (weak signal)

**Penalties:**
- Clearly irrelevant type (restaurant, retail, etc.): -50 points

**Threshold for removal:**
- Score < 5 = Remove (95%+ confidence it's not relevant)
- Score 5-25 = Keep (uncertain, but plausible)
- Score 25-50 = Keep (likely relevant)
- Score 50+ = Keep (definitely relevant)

**Your data distribution:**
- Average score: 23.7
- 56.8% scored "Low" (0-25) - plumbers without strong backflow signals
- 7.9% scored "Very High" (75-100) - explicit backflow businesses

### Website Normalization

**Handles complex cases:**

1. **List-like strings:** `"['https://a.com', 'https://b.com']"`
   - Extracts all URLs
   - Prefers non-booking sites
   - Falls back to first URL if all are booking sites

2. **Tracking parameter removal:**
   - Strips: utm_*, fbclid, gclid, _ga, etc.
   - Keeps: legitimate query params

3. **Canonicalization:**
   - Forces HTTPS
   - Removes www.
   - Removes trailing slashes
   - Removes URL fragments

4. **Booking site detection:**
   - Flags: Yelp, Angi, HomeAdvisor, Thumbtack, Facebook, etc.
   - Still keeps them if no better alternative
   - Marked with `website_is_booking=true`

## Tuning the Script

### Adjust Quality Threshold

```python
# In 02_clean_places.py, modify check_removal_reason()

# Current:
if reviews <= 3:
    return 'LOW_QUALITY'

# More aggressive (higher quality):
if reviews <= 10:
    return 'LOW_QUALITY'

# More lenient (keep more records):
if reviews <= 1:
    return 'LOW_QUALITY'
```

Or use CLI flag:
```bash
python crawler/02_clean_places.py --min-reviews 5
```

### Adjust Relevance Threshold

```python
# In 02_clean_places.py, modify check_removal_reason()

# Current (conservative - only remove if very confident):
if relevance_score < 5:
    return 'NOT_RELEVANT'

# More aggressive (remove more uncertain businesses):
if relevance_score < 15:
    return 'NOT_RELEVANT'

# More lenient (keep almost everything):
if relevance_score < 1:
    return 'NOT_RELEVANT'
```

### Add More Backflow Keywords

```python
# In 02_clean_places.py, modify BACKFLOW_KEYWORDS

BACKFLOW_KEYWORDS = {
    'backflow', 'back flow', 'rpz', 'cross connection',
    # Add your custom keywords:
    'water safety', 'testcock', 'test cock',
    'tester cert', 'certified tester',
    # etc.
}
```

### Add More Irrelevant Types

```python
# In 02_clean_places.py, modify IRRELEVANT_TYPES

IRRELEVANT_TYPES = {
    'restaurant', 'retail', 'school',
    # Add your custom exclusions:
    'software company', 'consulting',
    # etc.
}
```

## Common Use Cases

### 1. First-time cleaning

```bash
python crawler/02_clean_places.py

# Check the report
cat crawler/data/cleaning_report.md

# Spot-check rejected records
head crawler/data/rejected_places.csv
```

### 2. Re-clean with stricter quality

```bash
python crawler/02_clean_places.py --min-reviews 10

# Compare acceptance rate
# Previous: 42.3% acceptance
# New: Lower acceptance, higher quality
```

### 3. Merge with new scraper data

```bash
# After running scraper again
python crawler/crawler_outscraper.py --resume

# Clean the updated raw data
python crawler/02_clean_places.py

# Deduplication will merge new + existing
```

### 4. Export for specific cities

```bash
# Clean first
python crawler/02_clean_places.py

# Then filter in Python/pandas
python -c "
import pandas as pd
df = pd.read_csv('crawler/data/clean_places.csv')
tx = df[df['state'] == 'Texas']
tx.to_csv('crawler/data/texas_only.csv', index=False)
print(f'Texas businesses: {len(tx)}')
"
```

## Validation Checklist

After cleaning, verify:

1. **Check acceptance rate** (in cleaning_report.md)
   - Too low (<30%): May be too aggressive
   - Too high (>80%): May be too lenient

2. **Spot-check clean_places.csv**
   - First 10 rows: Should be high-quality, relevant
   - Random sample: Should all be backflow-related
   - Check `backflow_score` column

3. **Spot-check rejected_places.csv**
   - Look for false negatives (good businesses rejected)
   - Check `rejection_reason` distribution
   - Verify NOT_RELEVANT removals are correct

4. **Review categories** (in cleaning_report.md)
   - Should be plumbing/irrigation/water-focused
   - If you see restaurants/retail: Relevance filter too weak

5. **Review top domains** (in cleaning_report.md)
   - Should be business websites, not all booking sites
   - Roto-Rooter, Mr. Rooter = Good (franchise plumbers)

## Performance

**Your current results:**
- Input: 3,709 raw records
- Output: 1,568 clean records
- Processing time: ~1 second
- Acceptance rate: 42.3%

**Expected for full 200-city scrape:**
- Input: ~50,000-100,000 raw records
- Output: ~20,000-40,000 clean records
- Processing time: ~10-30 seconds
- Acceptance rate: 40-50%

## Troubleshooting

### Too many good businesses rejected

**Symptom:** Legitimate backflow businesses in `rejected_places.csv`

**Fix 1:** Lower quality threshold
```bash
python crawler/02_clean_places.py --min-reviews 1
```

**Fix 2:** Add missing keywords to `BACKFLOW_KEYWORDS`

**Fix 3:** Lower relevance threshold in code (change `< 5` to `< 2`)

### Too much junk in clean data

**Symptom:** Non-backflow businesses in `clean_places.csv`

**Fix 1:** Raise quality threshold
```bash
python crawler/02_clean_places.py --min-reviews 10
```

**Fix 2:** Add problematic categories to `IRRELEVANT_TYPES`

**Fix 3:** Raise relevance threshold in code (change `< 5` to `< 15`)

### Duplicates still present

**Symptom:** Same business appears multiple times

**Fix:** Check if they have different `place_id` values
- If yes: Google considers them different locations (keep both)
- If no: Bug in deduplication (file an issue)

### Missing websites

**Symptom:** Too many `website_missing=true` records

**Fix:** This is expected - not all businesses have websites
- Check `website_is_booking` column
- Some may have phone-only contact
- This is valuable data for "call only" listings

## Next Steps

After cleaning:

1. **Import to database**
   ```bash
   # Example with SQLite
   sqlite3 directory.db
   .mode csv
   .import crawler/data/clean_places.csv businesses
   ```

2. **Geocode missing coordinates**
   - Some records may have invalid lat/lng
   - Use Google Maps Geocoding API or similar

3. **Verify backflow certification**
   - Cross-reference with state certification databases
   - Add `is_certified` field

4. **Enhance with additional data**
   - Hours of operation
   - Service area radius
   - Pricing information
   - Customer reviews

5. **Build directory frontend**
   - Use `place_id` as unique key
   - Display `backflow_score` as "relevance"
   - Show `website_clean` with proper attribution

## License

MIT
