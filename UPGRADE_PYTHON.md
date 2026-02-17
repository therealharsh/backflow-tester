# Upgrade to Python 3.10+ for crawl4ai

## Step 1: Install Python 3.11 via Homebrew

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3.11 (recommended, stable)
brew install python@3.11

# Verify installation
python3.11 --version
# Should show: Python 3.11.x
```

## Step 2: Backup and Remove Old Virtual Environment

```bash
cd /Users/harsh/crawler

# Deactivate current venv if active
deactivate 2>/dev/null || true

# Backup old venv (optional)
mv .venv .venv_old_py39

# Or just remove it
# rm -rf .venv
```

## Step 3: Create New Virtual Environment with Python 3.11

```bash
# Create new venv with Python 3.11
python3.11 -m venv .venv

# Activate it
source .venv/bin/activate

# Verify you're using Python 3.11
python --version
# Should show: Python 3.11.x
```

## Step 4: Install All Dependencies

```bash
# Upgrade pip first
pip install --upgrade pip

# Install all requirements
pip install -r crawler/requirements.txt

# This will install:
# - outscraper
# - pandas
# - python-dotenv
# - tqdm
# - numpy
# - crawl4ai
# - beautifulsoup4
# - playwright
```

## Step 5: Install Playwright Browsers

```bash
# This downloads Chromium (~300MB)
playwright install

# Or install specific browsers
playwright install chromium
```

## Step 6: Test Installation

```bash
# Quick Python check
python -c "from crawl4ai import AsyncWebCrawler; print('crawl4ai imported successfully!')"

# Should print: crawl4ai imported successfully!
```

## Step 7: Run Verification

```bash
# Create small test file
head -11 crawler/data/clean_places.csv > test.csv

# Run verifier
python crawler/03_verify_backflow.py \
  --input test.csv \
  --batch-size 3 \
  --max-pages 2

# Should work without errors!
```

## Troubleshooting

### Homebrew not found

If `brew` command not found after installation, add to PATH:

```bash
# For Apple Silicon (M1/M2/M3)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc

# For Intel Mac
echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc
```

### Python 3.11 not found after brew install

```bash
# Find where brew installed it
brew info python@3.11

# Add to PATH
echo 'export PATH="/opt/homebrew/opt/python@3.11/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### SSL certificate errors

```bash
# Install certificates (Python 3.11)
/Applications/Python\ 3.11/Install\ Certificates.command

# Or manually
pip install --upgrade certifi
```

### playwright install fails

```bash
# Make sure you're in the venv
which python
# Should show: /Users/harsh/crawler/.venv/bin/python

# Try with sudo if needed
sudo playwright install chromium
```

## Alternative: Use pyenv (More Flexible)

If you want to manage multiple Python versions:

```bash
# Install pyenv
brew install pyenv

# Install Python 3.11
pyenv install 3.11.7

# Set as global default
pyenv global 3.11.7

# Add to shell config
echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zshrc
echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zshrc
echo 'eval "$(pyenv init -)"' >> ~/.zshrc

# Restart shell
exec zsh

# Verify
python --version
# Should show: Python 3.11.7

# Now create venv
cd /Users/harsh/crawler
python -m venv .venv
source .venv/bin/activate
pip install -r crawler/requirements.txt
playwright install
```

## Quick Commands (After Upgrade)

```bash
# Every time you open a new terminal:
cd /Users/harsh/crawler
source .venv/bin/activate

# Run verifier
python crawler/03_verify_backflow.py --input crawler/data/clean_places.csv
```

## Verification Checklist

After upgrade, verify everything works:

- [ ] Python 3.11+ installed: `python3.11 --version`
- [ ] New venv created: `ls .venv/`
- [ ] Venv activated: `which python` shows `.venv/bin/python`
- [ ] Dependencies installed: `pip list | grep crawl4ai`
- [ ] Playwright installed: `playwright --version`
- [ ] Browsers downloaded: `playwright install --dry-run`
- [ ] crawl4ai imports: `python -c "from crawl4ai import AsyncWebCrawler"`
- [ ] Test run works: `python crawler/03_verify_backflow.py --input test.csv`

## Clean Up Old Environment (Optional)

After confirming everything works:

```bash
# Remove old Python 3.9 venv
rm -rf .venv_old_py39

# You're all set!
```
