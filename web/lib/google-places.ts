/**
 * Server-side Google Places API wrapper.
 * Uses the Places API (New) for autocomplete + details,
 * and the Geocoding API for reverse geocoding.
 *
 * All functions read GOOGLE_PLACES_API_KEY from env — never expose to client.
 */

const API_KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

// ── Types ──────────────────────────────────────────────────────────────

export interface AutocompletePrediction {
  placeId: string
  mainText: string
  secondaryText: string
  types: string[]
}

export interface GeocodedPlace {
  lat: number
  lng: number
  city: string | null
  stateCode: string | null
  stateName: string | null
  postalCode: string | null
  formattedAddress: string
  types: string[]
}

// ── State abbreviation map (for parsing addressComponents) ─────────────

const STATE_ABBREV: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
  Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX',
  Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
}

// ── Autocomplete (Places API New) ──────────────────────────────────────

export async function autocomplete(
  input: string,
  sessionToken: string,
): Promise<AutocompletePrediction[]> {
  const key = API_KEY()
  if (!key) return []

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
      },
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: ['us'],
        languageCode: 'en',
      }),
      cache: 'no-store',
    })

    if (!res.ok) return []
    const data = await res.json()

    return (data.suggestions ?? [])
      .filter((s: any) => s.placePrediction)
      .slice(0, 5)
      .map((s: any) => {
        const p = s.placePrediction
        return {
          placeId: p.placeId,
          mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
          types: p.types ?? [],
        }
      })
  } catch {
    return []
  }
}

// ── Place Details (Places API New) ─────────────────────────────────────

export async function getPlaceDetails(
  placeId: string,
  sessionToken: string,
): Promise<GeocodedPlace | null> {
  const key = API_KEY()
  if (!key) return null

  try {
    const fields = 'location,displayName,addressComponents,formattedAddress,types'
    const url = `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fields,
      },
      cache: 'no-store',
    })

    if (!res.ok) return null
    const data = await res.json()

    return parseGooglePlace(data)
  } catch {
    return null
  }
}

// ── Reverse Geocode (Geocoding API) ────────────────────────────────────

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodedPlace | null> {
  const key = API_KEY()
  if (!key) return null

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}&result_type=locality|administrative_area_level_1`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    const data = await res.json()
    if (!data.results || data.results.length === 0) return null

    const result = data.results[0]
    const parsed = parseAddressComponents(result.address_components ?? [])

    return {
      lat,
      lng,
      city: parsed.city,
      stateCode: parsed.stateCode,
      stateName: parsed.stateName,
      postalCode: parsed.postalCode,
      formattedAddress: result.formatted_address ?? '',
      types: result.types ?? [],
    }
  } catch {
    return null
  }
}

// ── Forward geocode (city + state validation) ───────────────────────────

export async function geocodeCity(
  citySlug: string,
  stateCode: string,
): Promise<{ city: string; lat: number; lng: number } | null> {
  const key = API_KEY()
  if (!key) return null

  const cityText = citySlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const query = `${cityText}, ${stateCode}, USA`

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null

    const data = await res.json()
    if (!data.results || data.results.length === 0) return null

    const result = data.results[0]
    const parsed = parseAddressComponents(result.address_components ?? [])

    // Must resolve to the same state
    if (parsed.stateCode !== stateCode) return null
    // Must be a real locality (not just a state or country result)
    const types: string[] = result.types ?? []
    if (!types.some((t: string) => ['locality', 'sublocality', 'neighborhood', 'postal_code'].includes(t))) return null

    return {
      city: parsed.city ?? cityText,
      lat: result.geometry?.location?.lat ?? 0,
      lng: result.geometry?.location?.lng ?? 0,
    }
  } catch {
    return null
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseGooglePlace(data: any): GeocodedPlace {
  const loc = data.location ?? {}
  const parsed = parseAddressComponents(data.addressComponents ?? [])

  return {
    lat: loc.latitude ?? 0,
    lng: loc.longitude ?? 0,
    city: parsed.city,
    stateCode: parsed.stateCode,
    stateName: parsed.stateName,
    postalCode: parsed.postalCode,
    formattedAddress: data.formattedAddress ?? '',
    types: data.types ?? [],
  }
}

function parseAddressComponents(
  components: any[],
): { city: string | null; stateCode: string | null; stateName: string | null; postalCode: string | null } {
  let city: string | null = null
  let stateName: string | null = null
  let stateCode: string | null = null
  let postalCode: string | null = null

  for (const c of components) {
    const types: string[] = c.types ?? []
    const longName: string = c.longText ?? c.long_name ?? ''
    const shortName: string = c.shortText ?? c.short_name ?? ''

    if (types.includes('locality')) {
      city = longName
    } else if (types.includes('sublocality_level_1') && !city) {
      city = longName
    } else if (types.includes('administrative_area_level_1')) {
      stateName = longName
      // Google sometimes returns the abbreviation in short_name
      stateCode = shortName.length === 2 ? shortName.toUpperCase() : (STATE_ABBREV[longName] ?? null)
    } else if (types.includes('postal_code')) {
      postalCode = longName
    }
  }

  return { city, stateCode, stateName, postalCode }
}
