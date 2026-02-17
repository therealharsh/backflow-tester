# Google Maps Scraper - Outscraper Edition

Production-grade Google Maps scraper for backflow service directory MVP.

## Features

### Scraper (`crawler_outscraper.py`)
- Scrapes Google Maps listings across 200 US cities and 5 keywords (1000 total queries)
- Robust error handling with exponential backoff retries
- Checkpointing system - resume interrupted runs without losing progress
- Detailed logging to console and file
- Progress tracking with tqdm
- Batch processing with configurable rate limiting
- Works with multiple Outscraper SDK versions

### Data Cleaner (`clean_places.py`)
- Deduplicates businesses by place_id
- Filters for backflow-relevant businesses only
- Normalizes websites (removes tracking params, canonicalizes URLs)
- Validates and formats phone numbers
- Cleans coordinates and validates US locations
- Calculates data quality scores
- Comprehensive logging and statistics

## Setup

### 1. Create and activate virtual environment

```bash
cd /Users/harsh/crawler
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r crawler/requirements.txt
```

### 3. Set up API key

Create a `.env` file in the root directory:

```bash
echo 'OUTSCRAPER_API_KEY=your_api_key_here' > .env
```

Replace `your_api_key_here` with your actual Outscraper API key.

## Quick Start (Complete Workflow)

```bash
# 1. Setup (one time)
source .venv/bin/activate
pip install -r crawler/requirements.txt
echo 'OUTSCRAPER_API_KEY=your_key' > .env

# 2. Test API
python crawler/outscraper_smoketest.py

# 3. Scrape data (test with 10 cities first)
python crawler/crawler_outscraper.py --cities crawler/00_cities.csv --head 10

# 4. Clean and dedupe
python crawler/clean_places.py

# 5. Check results
wc -l crawler/data/clean_places.csv
head crawler/data/clean_places.csv

# 6. Run full scrape (200 cities)
python crawler/crawler_outscraper.py --cities crawler/00_cities.csv --limit 50

# 7. Clean full dataset
python crawler/clean_places.py
```

## Workflow

The complete pipeline has two steps:

1. **Scrape** raw data from Google Maps → `raw_places.csv`
2. **Clean** and deduplicate → `clean_places.csv`

## Usage

### Step 1: Scraping

#### Run smoketest first

Test your API connection with a single query:

```bash
python crawler/outscraper_smoketest.py
```

Expected output:
- Shows API key (masked)
- Sends test query for "backflow testing New York NY USA"
- Displays number of results and available data fields
- Confirms the API is working

### Test with first 10 cities

Before running the full scraper, test with a small subset:

```bash
python crawler/crawler_outscraper.py \
  --cities crawler/00_cities.csv \
  --head 10 \
  --limit 50 \
  --batch-size 5
```

This will:
- Scrape only the first 10 cities
- Run 50 queries (10 cities × 5 keywords)
- Process in batches of 5 queries
- Output to `crawler/data/raw_places.csv`
- Log to `crawler/data/crawler.log`

### Run full scraper (200 cities)

```bash
python crawler/crawler_outscraper.py \
  --cities crawler/00_cities.csv \
  --limit 50 \
  --batch-size 10 \
  --sleep 0.5
```

This will:
- Scrape all 200 cities
- Run 1000 queries (200 cities × 5 keywords)
- Get up to 50 results per query
- Process in batches of 10 queries
- Sleep 0.5s between batches
- Create checkpoints after each batch

### Resume interrupted run

If the scraper is interrupted, resume from the last checkpoint:

```bash
python crawler/crawler_outscraper.py \
  --cities crawler/00_cities.csv \
  --limit 50 \
  --batch-size 10 \
  --sleep 0.5 \
  --resume
```

The scraper will:
- Read the last checkpoint from `crawler/data/run_state.json`
- Skip already completed queries
- Continue from where it left off

### Step 2: Cleaning

After scraping, clean and deduplicate the data:

```bash
python crawler/clean_places.py
```

This will:
- Load `crawler/data/raw_places.csv`
- Remove duplicates by place_id
- Filter for backflow-relevant businesses
- Normalize websites, phones, categories
- Validate coordinates (US only)
- Sort by data quality
- Output to `crawler/data/clean_places.csv`
- Log details to `crawler/data/clean_places.log`

#### Custom paths

```bash
python crawler/clean_places.py \
  --input crawler/data/raw_places.csv \
  --output crawler/data/clean_places.csv
```

## Command Line Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--cities` | string | required | Path to cities CSV file |
| `--limit` | int | 50 | Max results per query |
| `--batch-size` | int | 10 | Number of queries per batch |
| `--sleep` | float | 0.5 | Sleep time between batches (seconds) |
| `--head` | int | 0 | Only scrape first N cities (0 = all) |
| `--resume` | flag | false | Resume from checkpoint |
| `--max-retries` | int | 5 | Maximum retry attempts per batch |

## Command Line Options

### Scraper Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--cities` | string | required | Path to cities CSV file |
| `--limit` | int | 50 | Max results per query |
| `--batch-size` | int | 10 | Number of queries per batch |
| `--sleep` | float | 0.5 | Sleep time between batches (seconds) |
| `--head` | int | 0 | Only scrape first N cities (0 = all) |
| `--resume` | flag | false | Resume from checkpoint |
| `--max-retries` | int | 5 | Maximum retry attempts per batch |

### Cleaner Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--input` | string | crawler/data/raw_places.csv | Path to raw CSV file |
| `--output` | string | crawler/data/clean_places.csv | Path to output clean CSV file |

## Output Files

### `crawler/data/raw_places.csv`

Raw scraper output containing all scraped places. Columns include:
- `name` - Business name
- `address` - Full address
- `city` - City
- `state` - State
- `zip` - ZIP code
- `phone` - Phone number
- `website` - Website URL
- `rating` - Google rating
- `reviews` - Number of reviews
- And many more fields from Google Maps

### `crawler/data/run_state.json`

Checkpoint file for resuming interrupted runs:
```json
{
  "next_query_index": 450,
  "completed_batches": [0, 10, 20, ...],
  "timestamp": "2026-02-17 14:32:15"
}
```

### `crawler/data/clean_places.csv`

Cleaned and deduplicated data ready for your directory. Columns:
- `place_id` - Google place ID (unique identifier)
- `name` - Business name
- `full_address` - Complete address
- `city` - City name
- `state` - State abbreviation
- `zip` - ZIP code
- `country` - Country (USA)
- `latitude` - Latitude coordinate
- `longitude` - Longitude coordinate
- `phone` - Normalized phone number (XXX) XXX-XXXX format
- `website` - Cleaned, canonical website URL
- `categories` - Comma-separated business categories
- `rating` - Google rating (0-5)
- `reviews` - Number of reviews

### `crawler/data/crawler.log`

Scraper log file with timestamps:
- Run configuration
- Batch progress
- Sample queries
- Retry attempts
- Results count
- Errors and warnings

### `crawler/data/clean_places.log`

Cleaner log file with:
- Records processed at each step
- Deduplication statistics
- Data completeness metrics
- Top cities and categories
- Quality score distributions

## Keywords

The scraper uses these 5 keywords:
1. "backflow testing"
2. "backflow preventer"
3. "rpz testing"
4. "cross connection control"
5. "backflow repair"

Each keyword is combined with each city/state to form queries like:
- "backflow testing New York NY USA"
- "backflow preventer Los Angeles CA USA"
- etc.

## Error Handling

The scraper includes robust error handling:

1. **Exponential backoff retries**: Failed batches are retried up to 5 times with increasing delays (1s, 2s, 4s, 8s, 16s)
2. **Timeout protection**: Each batch has a 120-second timeout (macOS compatible)
3. **Checkpoint system**: Progress is saved after every successful batch
4. **Graceful degradation**: Handles different Outscraper SDK versions and result formats

## Troubleshooting

### API key not found
```
ERROR: OUTSCRAPER_API_KEY not found in environment
```
**Solution**: Create a `.env` file with your API key (see step 3 in Setup)

### Outscraper method not found
```
ERROR: Client has neither google_maps_search_v2 nor google_maps_search
```
**Solution**: Update the outscraper package:
```bash
pip install --upgrade outscraper
```

### Batch timeout
```
WARNING: Batch timed out after 120s
```
**Solution**: This is normal for slow responses. The scraper will automatically retry. If it happens frequently, reduce `--batch-size`.

### Out of API credits
```
Failed to scrape: ... insufficient credits ...
```
**Solution**: Add more credits to your Outscraper account at https://app.outscraper.com/

## Performance Tips

1. **Start small**: Always test with `--head 10` first
2. **Adjust batch size**: Larger batches are faster but may timeout. Start with 10, adjust based on your API performance.
3. **Monitor progress**: Watch `crawler/data/crawler.log` in real-time:
   ```bash
   tail -f crawler/data/crawler.log
   ```
4. **Check results**: Monitor output file growth:
   ```bash
   wc -l crawler/data/raw_places.csv
   ```

## Full Run Estimates

With 200 cities × 5 keywords = 1000 queries:
- **Batch size 10**: 100 batches
- **Sleep 0.5s**: ~50 seconds of sleep time
- **API time**: Varies by Outscraper server load (typically 2-5s per batch)
- **Total time**: 5-10 minutes for full run

## Support

For issues with:
- **This scraper**: Check logs in `crawler/data/crawler.log`
- **Outscraper API**: Visit https://app.outscraper.com/
- **API documentation**: https://github.com/outscraper/outscraper-python

## License

MIT
