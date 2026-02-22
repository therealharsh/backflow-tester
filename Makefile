.PHONY: crawl-outscrape crawl-clean crawl-verify crawl-upsert crawl-sitemap crawl-all

VENV   = crawler/.venv/bin/python
CITIES = crawler/data/target_cities.csv

crawl-outscrape:
	$(VENV) crawler/01_outscrape.py --cities $(CITIES)

crawl-clean:
	$(VENV) crawler/02_clean.py

crawl-verify:
	$(VENV) crawler/03_verify_and_enrich.py

crawl-upsert:
	$(VENV) crawler/04_upsert_supabase.py

crawl-sitemap:
	bash crawler/05_refresh_sitemap.sh

crawl-all: crawl-outscrape crawl-clean crawl-verify crawl-upsert crawl-sitemap
