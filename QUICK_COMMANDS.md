# Quick Command Reference

All the commands you need to run the complete backflow directory pipeline.

## Initial Setup (One Time)

```bash
# Navigate to project
cd /Users/harsh/crawler

# Activate virtual environment
source .venv/bin/activate

# Install Python dependencies
pip install -r crawler/requirements.txt

# Install Playwright browsers (required for web crawling)
playwright install

# Create .env file with your Outscraper API key
echo 'OUTSCRAPER_API_KEY=your_key_here' > .env
```

## Complete Pipeline

### 1. Scrape Google Maps Data

```bash
# Test with 10 cities first
python crawler/crawler_outscraper.py \
  --cities crawler/00_cities.csv \
  --head 10 \
  --limit 50 \
  --batch-size 5

# Full scrape (200 cities, 1000 queries)
python crawler/crawler_outscraper.py \
  --cities crawler/00_cities.csv \
  --limit 50 \
  --batch-size 10 \
  --sleep 0.5

# Resume if interrupted (e.g., out of credits)
python crawler/crawler_outscraper.py \
  --cities crawler/00_cities.csv \
  --limit 50 \
  --batch-size 10 \
  --resume
```

**Output:** `crawler/data/raw_places.csv`

### 2. Clean and Deduplicate Data

```bash
# Run advanced cleaning with business relevance filtering
python crawler/02_clean_places.py

# With custom threshold (more strict)
python crawler/02_clean_places.py --min-reviews 5

# Check results
wc -l crawler/data/clean_places.csv crawler/data/rejected_places.csv
cat crawler/data/cleaning_report.md
```

**Output:**
- `crawler/data/clean_places.csv` (deduplicated, relevant businesses)
- `crawler/data/rejected_places.csv` (removed businesses with reasons)
- `crawler/data/cleaning_report.md` (statistics)

### 3. Verify Websites (Crawl for Backflow Mention)

```bash
# Test with first 10 businesses
head -11 crawler/data/clean_places.csv > crawler/data/test_10.csv
python crawler/03_verify_backflow.py \
  --input crawler/data/test_10.csv \
  --batch-size 5

# Full verification (takes 3-4 hours)
python crawler/03_verify_backflow.py \
  --input crawler/data/clean_places.csv \
  --batch-size 25 \
  --max-pages 4 \
  --threshold 2

# Resume if interrupted
python crawler/03_verify_backflow.py --resume
```

**Output:**
- `crawler/data/verified.csv` (websites mentioning backflow)
- `crawler/data/rejected_by_verifier.csv` (no backflow mention or crawl failed)
- `crawler/data/verifier_report.md` (verification statistics)

## Quick Checks

### Check Progress

```bash
# Count records at each stage
wc -l crawler/data/raw_places.csv
wc -l crawler/data/clean_places.csv
wc -l crawler/data/verified.csv

# View reports
cat crawler/data/cleaning_report.md
cat crawler/data/verifier_report.md

# Check logs
tail -50 crawler/data/crawler.log
tail -50 crawler/data/02_clean_places.log
tail -50 crawler/data/verifier.log
```

### Preview Data

```bash
# Raw data
head crawler/data/raw_places.csv | cut -c1-150

# Clean data
head crawler/data/clean_places.csv | cut -f1-5 -d,

# Verified data (columns: name, website, backflow_score)
head crawler/data/verified.csv | cut -f2,11,69 -d,
```

## Common Workflows

### Workflow 1: Fresh Start (No Existing Data)

```bash
# 1. Scrape
python crawler/crawler_outscraper.py --cities crawler/00_cities.csv --head 10

# 2. Clean
python crawler/02_clean_places.py

# 3. Verify
python crawler/03_verify_backflow.py --input crawler/data/clean_places.csv

# 4. Check results
cat crawler/data/verifier_report.md
```

### Workflow 2: Resume After Credit Exhaustion

```bash
# 1. Add more Outscraper credits

# 2. Resume scraping
python crawler/crawler_outscraper.py --resume

# 3. Re-clean (deduplicates with existing data)
python crawler/02_clean_places.py

# 4. Verify new businesses only
# (manually filter clean_places.csv to new records, or just re-run)
python crawler/03_verify_backflow.py --resume
```

### Workflow 3: Adjust Quality Filters

```bash
# Re-clean with stricter quality
python crawler/02_clean_places.py --min-reviews 10

# Re-verify with higher threshold
python crawler/03_verify_backflow.py \
  --input crawler/data/clean_places.csv \
  --threshold 3
```

## Development & Testing

### Test Individual Components

```bash
# Test API connection
python crawler/outscraper_smoketest.py

# Test cleaning on small dataset
head -100 crawler/data/raw_places.csv > test_raw.csv
python crawler/02_clean_places.py --input test_raw.csv

# Test verification on small dataset
head -20 crawler/data/clean_places.csv > test_clean.csv
python crawler/03_verify_backflow.py --input test_clean.csv --batch-size 5
```

### Monitor Real-Time

```bash
# Watch logs live
tail -f crawler/data/verifier.log

# Monitor progress in another terminal
watch -n 5 'wc -l crawler/data/verified.csv crawler/data/rejected_by_verifier.csv'
```

## Data Export

### Export Final Dataset

```python
import pandas as pd

# Load verified businesses
df = pd.read_csv('crawler/data/verified.csv')

# Export minimal fields for frontend
export = df[[
    'place_id', 'name', 'phone', 'website',
    'address', 'city', 'state', 'postal_code',
    'latitude', 'longitude',
    'rating', 'reviews',
    'backflow_score', 'best_evidence_url'
]]

export.to_csv('frontend_directory.csv', index=False)
print(f"Exported {len(export)} verified businesses")
```

### Export by State

```python
import pandas as pd

df = pd.read_csv('crawler/data/verified.csv')

# Export California only
ca = df[df['state'] == 'California']
ca.to_csv('california_backflow.csv', index=False)

# Export top 10 states
top_states = df['state'].value_counts().head(10).index
for state in top_states:
    state_df = df[df['state'] == state]
    filename = f"{state.lower().replace(' ', '_')}_backflow.csv"
    state_df.to_csv(filename, index=False)
    print(f"{state}: {len(state_df)} businesses")
```

## Troubleshooting Commands

### Fix Common Issues

```bash
# Playwright not installed
playwright install

# Update dependencies
pip install --upgrade -r crawler/requirements.txt

# Clear checkpoints (start fresh)
rm crawler/data/run_state.json
rm crawler/data/verifier_state.json

# Check Python version (need 3.9+)
python3 --version
```

### Check Disk Space

```bash
# Check data directory size
du -sh crawler/data/

# Check individual file sizes
ls -lh crawler/data/*.csv
```

## Performance Optimization

### Speed Up Scraping

```bash
# Larger batches (faster but higher API cost)
python crawler/crawler_outscraper.py \
  --batch-size 50 \
  --sleep 0.2

# Smaller batches (slower but more reliable)
python crawler/crawler_outscraper.py \
  --batch-size 5 \
  --sleep 1.0
```

### Speed Up Verification

```bash
# Larger batches, fewer pages (faster but less thorough)
python crawler/03_verify_backflow.py \
  --batch-size 50 \
  --max-pages 2 \
  --timeout 30

# Smaller batches, more pages (slower but more thorough)
python crawler/03_verify_backflow.py \
  --batch-size 10 \
  --max-pages 6 \
  --timeout 120
```

## Production Deployment

### Run Overnight

```bash
# Run full pipeline overnight, log everything
nohup bash -c '
  python crawler/crawler_outscraper.py --resume &&
  python crawler/02_clean_places.py &&
  python crawler/03_verify_backflow.py
' > pipeline.log 2>&1 &

# Check progress next morning
tail -100 pipeline.log
```

### Cron Job (Weekly Re-verification)

```bash
# Add to crontab (weekly on Sunday at 2am)
0 2 * * 0 cd /Users/harsh/crawler && source .venv/bin/activate && python crawler/03_verify_backflow.py --input crawler/data/verified.csv --output crawler/data/reverified.csv
```

## Expected Results

**Starting point:** 200 US cities × 5 keywords = 1,000 queries

**Stage 1 - Scraping:**
- Raw records: ~50,000-100,000 (depends on Outscraper limits)

**Stage 2 - Cleaning:**
- Input: 50,000 raw records
- Output: ~20,000 clean records (40% acceptance)
- Removed: Duplicates, low quality, not relevant

**Stage 3 - Verification:**
- Input: 20,000 clean records
- Output: ~13,000 verified records (65% acceptance)
- Removed: No website, crawl failed, no backflow mention

**Final:** ~13,000 verified backflow testers for your directory! 🎉

## File Structure

```
/Users/harsh/crawler/
├── .env                          # API keys
├── .venv/                        # Virtual environment
├── crawler/
│   ├── 00_cities.csv            # Input: 200 US cities
│   ├── crawler_outscraper.py    # Step 1: Scrape
│   ├── 02_clean_places.py       # Step 2: Clean
│   ├── 03_verify_backflow.py    # Step 3: Verify
│   ├── outscraper_smoketest.py  # Test API
│   ├── requirements.txt         # Dependencies
│   ├── data/
│   │   ├── raw_places.csv       # After scraping
│   │   ├── clean_places.csv     # After cleaning
│   │   ├── verified.csv         # After verification ✅
│   │   ├── rejected_places.csv
│   │   ├── rejected_by_verifier.csv
│   │   ├── cleaning_report.md
│   │   ├── verifier_report.md
│   │   ├── run_state.json       # Scraper checkpoint
│   │   └── verifier_state.json  # Verifier checkpoint
├── README.md                     # Scraper guide
├── CLEANING_GUIDE.md            # Cleaning guide
└── VERIFICATION_GUIDE.md        # Verification guide
```

## Get Help

```bash
# Show help for each script
python crawler/crawler_outscraper.py --help
python crawler/02_clean_places.py --help
python crawler/03_verify_backflow.py --help
```

## Notes

- All scripts support `--resume` for checkpointing
- Logs are in `crawler/data/*.log`
- Reports are in `crawler/data/*_report.md`
- All CSV files have headers
- Use `verified.csv` as your final directory data
