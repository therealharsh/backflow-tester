This is cool

# FindBackflowTesters.com — Build & Deploy Guide

Complete pipeline from raw Outscraper data to a live Next.js directory with programmatic SEO.

```
crawler/data/           ← raw Outscraper CSVs
data/                   ← processed CSV ready for Supabase
scripts/                ← data pipeline (Python)
supabase/migrations/    ← SQL schema + indexes
web/                    ← Next.js App Router site
```

---

## Prerequisites

- Python 3.11+, activated `.venv`  (`source .venv/bin/activate`)
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- Vercel account (for deployment)

---

## Step 1 — Merge CSVs

```bash
# From project root
pip install supabase  # if not already installed

python scripts/merge_final_dataset.py
# → writes data/providers_final.csv
# → prints a report of counts
```

---

## Step 2 — Set Up Supabase

### 2a. Create project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Note your **Project URL** and **anon key** (Settings → API)
3. Note your **service role key** (Settings → API → Service Role — keep secret)

### 2b. Run migrations

In your Supabase project → SQL Editor, run these in order:

```sql
-- Paste contents of supabase/migrations/001_create_tables.sql
-- Then paste contents of supabase/migrations/002_indexes.sql
```

Or use the Supabase CLI:

```bash
supabase db push
```

### 2c. Configure environment

```bash
# From project root
cp web/.env.example web/.env.local
# Edit web/.env.local with your Supabase URL + keys
```

Also create a root `.env` for the Python loader:

```bash
cat > .env << 'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=https://findbackflowtesters.com
EOF
```

---

## Step 3 — Load Data into Supabase

```bash
# Install Python supabase client
pip install supabase python-dotenv

# Load providers + compute cities
python scripts/load_to_supabase.py
# → prints progress per batch
# → writes data/failed_rows.csv if any rows fail

# Retry failures (if any)
python scripts/load_to_supabase.py --retry
```

---

## Step 4 — Run Next.js Locally

```bash
cd web
npm install
npm run dev
# → http://localhost:3000
```

Verify:
- `http://localhost:3000` — homepage with state grid
- `http://localhost:3000/fl` — Florida hub
- `http://localhost:3000/fl/orlando` — Orlando city page with filters
- `http://localhost:3000/providers/<any-slug>` — provider detail with JSON-LD
- `http://localhost:3000/sitemap.xml` — full sitemap
- `http://localhost:3000/robots.txt` — robots

---

## Step 5 — Deploy to Vercel

```bash
# Install Vercel CLI (optional)
npm i -g vercel

cd web
vercel
# Follow prompts, connect to your Vercel project
```

Set environment variables in Vercel dashboard (Settings → Environment Variables):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://findbackflowtesters.com` |

> The `SUPABASE_SERVICE_ROLE_KEY` is only needed for the Python loader script — **never** put it in the Next.js environment.

---

## File Tree

```
.
├── crawler/
│   └── data/
│       ├── verified.csv          ← verifier output
│       └── images_enriched.csv  ← enrichment output (optional)
├── data/
│   └── providers_final.csv      ← merge script output
├── scripts/
│   ├── merge_final_dataset.py   ← CSV merge + slugify
│   └── load_to_supabase.py      ← Supabase upsert
├── supabase/
│   └── migrations/
│       ├── 001_create_tables.sql
│       └── 002_indexes.sql
├── web/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             ← homepage (state grid)
│   │   ├── [state]/
│   │   │   ├── page.tsx         ← state hub (city list)
│   │   │   └── [city]/
│   │   │       └── page.tsx     ← city landing (provider grid + filters)
│   │   ├── providers/
│   │   │   └── [slug]/
│   │   │       └── page.tsx     ← provider detail (JSON-LD, gallery, CTAs)
│   │   ├── sitemap.ts           ← dynamic sitemap.xml
│   │   └── robots.ts            ← robots.txt
│   ├── components/
│   │   ├── ProviderCard.tsx
│   │   ├── Filters.tsx          ← client component (URL param filters)
│   │   └── Pagination.tsx       ← client component (URL param pagination)
│   ├── lib/
│   │   └── supabase.ts
│   ├── types/
│   │   └── index.ts
│   ├── .env.example
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
└── README.md
```

---

## SEO Architecture

| Route | Title pattern | Indexed |
|-------|--------------|---------|
| `/` | Find Backflow Testers | ✓ |
| `/[state]` | Backflow Testing in [State] | ✓ |
| `/[state]/[city]` | Backflow Testing in [City], [ST] | ✓ |
| `/providers/[slug]` | [Name] — Backflow Testing in [City], [ST] | ✓ |

Every provider page includes:
- `<title>` + `<meta description>` unique per page
- `<link rel="canonical">`
- JSON-LD `LocalBusiness` structured data
- Image gallery for rich results

---

## Re-running After New Data

```bash
# After re-running the crawler or cleaner:
python scripts/merge_final_dataset.py
python scripts/load_to_supabase.py

# Redeploy (Vercel auto-deploys on git push)
git add data/providers_final.csv
git commit -m "update provider data"
git push
```

---

## Troubleshooting

**Supabase 403 on reads**: Make sure RLS policies in `001_create_tables.sql` ran. Check anon key is correct.

**`city_slug` null values**: Re-run `merge_final_dataset.py` to regenerate slugs, then re-load.

**`generateStaticParams` timeout at build**: Add `export const dynamic = 'force-dynamic'` to provider/city pages temporarily, or increase Vercel function timeout in `vercel.json`.

**Images not loading**: `next.config.ts` allows all HTTPS hostnames. If you hit CSP issues, adjust the `remotePatterns` config.
