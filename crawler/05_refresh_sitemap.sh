#!/bin/bash
# Step 5: Rebuild Next.js to regenerate sitemap and static pages.
#
# The sitemap generator (web/app/sitemap.ts) fetches live data from Supabase,
# so a fresh build picks up any new providers or cities added by step 4.
#
# Usage:
#   bash crawler/05_refresh_sitemap.sh

set -euo pipefail

cd "$(dirname "$0")/../web"

echo "Building Next.js to regenerate sitemap and static pages..."
npm run build

echo ""
echo "Done. Sitemap and static pages regenerated."
echo "New sitemap available at: https://www.findbackflowtesters.com/sitemap.xml"
