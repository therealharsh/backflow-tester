/**
 * Sitemap data helpers — efficient paginated fetches for sitemap generation.
 * All functions use the server Supabase client.
 */

import { createServerClient } from './supabase'
import { getPublishedPosts } from './blog'
import { STATE_NAMES } from './geo-utils'
import type { BlogPost } from '@/types'

/** Max URLs per child sitemap — kept small for faster crawler processing. */
export const SITEMAP_PAGE_SIZE = 1_000

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.findbackflowtesters.com'

// ── Types ─────────────────────────────────────────────────────────────

export interface SitemapEntry {
  url: string
  lastModified?: Date | string
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

// ── State helpers ─────────────────────────────────────────────────────

export interface StateInfo {
  code: string
  providerCount: number
  lastUpdated: string | null
}

/**
 * Fetch all states that have providers, along with counts and most recent
 * provider updated_at as a proxy for "lastmod".
 */
export async function fetchStatesWithCounts(): Promise<StateInfo[]> {
  const supabase = createServerClient()

  // Get counts and max updated_at per state from providers table
  const { data: providerStates } = await supabase
    .from('providers')
    .select('state_code, updated_at')
    .not('state_code', 'is', null)

  const stateMap = new Map<string, { count: number; latest: string | null }>()

  for (const p of providerStates ?? []) {
    const code = p.state_code?.toUpperCase()
    if (!code || !STATE_NAMES[code]) continue
    const existing = stateMap.get(code)
    if (!existing) {
      stateMap.set(code, { count: 1, latest: p.updated_at ?? null })
    } else {
      existing.count++
      if (p.updated_at && (!existing.latest || p.updated_at > existing.latest)) {
        existing.latest = p.updated_at
      }
    }
  }

  // Include ALL valid states (even with 0 providers) so they appear in sitemap
  return Object.keys(STATE_NAMES).map((code) => ({
    code,
    providerCount: stateMap.get(code)?.count ?? 0,
    lastUpdated: stateMap.get(code)?.latest ?? null,
  }))
}

// ── City helpers ──────────────────────────────────────────────────────

export interface CityInfo {
  stateCode: string
  citySlug: string
  lastUpdated: string | null
}

/**
 * Fetch all known city slugs with their lastmod timestamp.
 * Merges the `cities` table with distinct provider city/state combos.
 */
export async function fetchAllCities(): Promise<CityInfo[]> {
  const supabase = createServerClient()
  const citySet = new Map<string, CityInfo>()

  // Primary source: cities table (paginate to avoid Supabase default 1 000-row cap)
  let from = 0
  while (true) {
    const { data: cities } = await supabase
      .from('cities')
      .select('city_slug, state_code, created_at')
      .order('provider_count', { ascending: false })
      .range(from, from + 999)

    for (const c of cities ?? []) {
      if (!c.city_slug || !c.state_code) continue
      const key = `${c.state_code.toLowerCase()}/${c.city_slug}`
      if (!citySet.has(key)) {
        citySet.set(key, {
          stateCode: c.state_code.toLowerCase(),
          citySlug: c.city_slug,
          lastUpdated: c.created_at ?? null,
        })
      }
    }

    if (!cities || cities.length < 1000) break
    from += 1000
  }

  // Secondary: provider city/state combos not in cities table (paginated)
  from = 0
  while (true) {
    const { data: providerCities } = await supabase
      .from('providers')
      .select('city_slug, state_code')
      .not('city_slug', 'is', null)
      .not('state_code', 'is', null)
      .range(from, from + 999)

    for (const pc of providerCities ?? []) {
      if (!pc.city_slug || !pc.state_code) continue
      const key = `${pc.state_code.toLowerCase()}/${pc.city_slug}`
      if (!citySet.has(key)) {
        citySet.set(key, {
          stateCode: pc.state_code.toLowerCase(),
          citySlug: pc.city_slug,
          lastUpdated: null,
        })
      }
    }

    if (!providerCities || providerCities.length < 1000) break
    from += 1000
  }

  return Array.from(citySet.values())
}

/** Total city count (for pagination calculation). */
export async function fetchCityCount(): Promise<number> {
  return (await fetchAllCities()).length
}

/** Paginated city slice. */
export async function fetchCitiesPaginated(page: number): Promise<CityInfo[]> {
  const all = await fetchAllCities()
  const start = page * SITEMAP_PAGE_SIZE
  return all.slice(start, start + SITEMAP_PAGE_SIZE)
}

// ── Provider helpers ──────────────────────────────────────────────────

export interface ProviderInfo {
  slug: string
  lastUpdated: string | null
}

/** Total provider count. */
export async function fetchProviderCount(): Promise<number> {
  const supabase = createServerClient()
  const { count } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
  return count ?? 0
}

/** Paginated provider slugs + updated_at. */
export async function fetchProviderSlugsPaginated(page: number): Promise<ProviderInfo[]> {
  const supabase = createServerClient()
  const from = page * SITEMAP_PAGE_SIZE
  const to = from + SITEMAP_PAGE_SIZE - 1

  const { data } = await supabase
    .from('providers')
    .select('provider_slug, updated_at')
    .order('provider_slug', { ascending: true })
    .range(from, to)

  return (data ?? []).map((p) => ({
    slug: p.provider_slug,
    lastUpdated: p.updated_at ?? null,
  }))
}

// ── Blog helpers ──────────────────────────────────────────────────────

export interface BlogInfo {
  slug: string
  lastUpdated: string | null
}

export async function fetchBlogSlugs(): Promise<BlogInfo[]> {
  const posts = await getPublishedPosts()
  return posts.map((p) => ({
    slug: p.slug,
    lastUpdated: p.updated_at ?? p.published_at ?? null,
  }))
}

// ── Page-count calculators ────────────────────────────────────────────

/** How many child sitemaps are needed for cities? */
export async function cityPageCount(): Promise<number> {
  const total = await fetchCityCount()
  return Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE))
}

/** How many child sitemaps are needed for providers? */
export async function providerPageCount(): Promise<number> {
  const total = await fetchProviderCount()
  return Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE))
}

// ── XML builders ──────────────────────────────────────────────────────

/** Build a sitemap index XML string. */
export function buildSitemapIndex(sitemapUrls: string[]): string {
  const entries = sitemapUrls
    .map((url) => `  <sitemap>\n    <loc>${escapeXml(url)}</loc>\n  </sitemap>`)
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</sitemapindex>',
  ].join('\n')
}

/** Build a urlset XML string from entries. */
export function buildUrlset(entries: SitemapEntry[]): string {
  const urls = entries.map((e) => {
    const parts = [`    <loc>${escapeXml(e.url)}</loc>`]
    if (e.lastModified) {
      const d = e.lastModified instanceof Date ? e.lastModified : new Date(e.lastModified)
      parts.push(`    <lastmod>${d.toISOString().split('T')[0]}</lastmod>`)
    }
    if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`)
    if (e.priority !== undefined) parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`)
    return `  <url>\n${parts.join('\n')}\n  </url>`
  }).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('\n')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export { BASE }
