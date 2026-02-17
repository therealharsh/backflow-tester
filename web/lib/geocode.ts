/**
 * Geocoding utility using Nominatim (free, no API key required).
 * Converts ZIP codes, city names, or street addresses to lat/lng.
 */

export interface GeoPoint {
  lat: number
  lon: number
  display: string   // human-readable label returned by Nominatim
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'FindBackflowTesters/1.0 (contact@findbackflowtesters.com)'

/**
 * Geocode a query string (ZIP, city, address) → GeoPoint or null.
 * Biased toward the US.
 */
export async function geocode(query: string): Promise<GeoPoint | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'us',
    addressdetails: '0',
  })

  try {
    const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      // Next.js: no-store so this isn't cached between user requests
      cache: 'no-store',
    })
    if (!res.ok) return null

    const data = await res.json()
    if (!data || data.length === 0) return null

    const { lat, lon, display_name } = data[0]
    return {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      display: display_name as string,
    }
  } catch {
    return null
  }
}

/**
 * Return true if `s` looks like a US ZIP code (5 digits).
 */
export function isZip(s: string): boolean {
  return /^\d{5}$/.test(s)
}

/**
 * Return true if `s` looks like a 2-letter US state abbreviation.
 */
export function isStateCode(s: string): boolean {
  return /^[A-Za-z]{2}$/.test(s)
}
