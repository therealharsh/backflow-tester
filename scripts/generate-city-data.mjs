#!/usr/bin/env node
/**
 * generate-city-data.mjs
 *
 * Downloads the dr5hn/countries-states-cities-database CSV and filters to
 * US cities with population >= 25,000. Outputs data/us-cities-25k.json.
 *
 * Usage: node scripts/generate-city-data.mjs
 *
 * Source: https://github.com/dr5hn/countries-states-cities-database (ODbL)
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_FILE = join(ROOT, 'data', 'us-cities-25k.json')
const CSV_URL = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/csv/cities.csv'

// ── Slugify (mirrors web/lib/geo-utils.ts) ─────────────────────────────
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Valid 2-letter state codes ──────────────────────────────────────────
const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])

// ── Parse CSV (handles quoted fields) ───────────────────────────────────
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++ }
        else { inQuotes = false }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { result.push(current.trim()); current = '' }
      else { current += ch }
    }
  }
  result.push(current.trim())
  return result
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const tmpDir = join(ROOT, '.tmp')
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(join(ROOT, 'data'), { recursive: true })

  const csvPath = join(tmpDir, 'cities.csv')

  // Step 1: Download CSV
  console.log('Downloading cities CSV from dr5hn/countries-states-cities-database...')
  execSync(`curl -sL "${CSV_URL}" -o "${csvPath}"`, { stdio: 'pipe' })
  console.log('Downloaded.')

  // Step 2: Parse
  const csvText = readFileSync(csvPath, 'utf8')
  const lines = csvText.split('\n')
  const headers = parseCSVLine(lines[0])
  console.log(`Headers: ${headers.join(', ')}`)
  console.log(`Total rows: ${lines.length - 1}`)

  // Build column index
  const col = {}
  headers.forEach((h, i) => { col[h] = i })

  // Step 3: Filter US cities with pop >= 25,000
  const cities = []
  const seen = new Set()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)
    const countryCode = values[col.country_code]
    if (countryCode !== 'US') continue

    // Include cities and adm2 entries (major cities often typed as adm2)
    // Exclude county/parish/borough administrative entries
    const type = (values[col.type] || '').toLowerCase()
    const allowedTypes = ['city', 'capital', 'municipality', 'adm2', 'adm1']
    if (!allowedTypes.includes(type)) continue

    const cityName = (values[col.name] || '')
    // Skip actual county/parish/borough entries that made it through
    if (/\b(county|parish|borough)\b/i.test(cityName)) continue

    const stateCode = values[col.state_code]
    if (!VALID_STATES.has(stateCode)) continue

    const pop = parseInt(values[col.population] || '0', 10)
    if (pop < 25000) continue

    if (!cityName) continue

    const lat = parseFloat(values[col.latitude])
    const lng = parseFloat(values[col.longitude])
    if (isNaN(lat) || isNaN(lng)) continue

    const slug = slugify(cityName)
    const key = `${stateCode}:${slug}`
    if (seen.has(key)) continue
    seen.add(key)

    cities.push({
      city: cityName,
      state_code: stateCode,
      slug,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      population: pop,
    })
  }

  // Sort by population desc
  cities.sort((a, b) => b.population - a.population)

  // Step 4: Write output
  writeFileSync(OUT_FILE, JSON.stringify(cities, null, 2), 'utf8')
  console.log(`\nWrote ${cities.length} cities to ${OUT_FILE}`)
  console.log(`States covered: ${new Set(cities.map(c => c.state_code)).size}`)
  console.log(`Top 10: ${cities.slice(0, 10).map(c => `${c.city}, ${c.state_code} (${c.population.toLocaleString()})`).join('; ')}`)

  // Clean up
  rmSync(tmpDir, { recursive: true, force: true })
  console.log('Cleaned up temp files.')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
