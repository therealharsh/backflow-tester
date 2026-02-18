import { describe, it, expect } from 'vitest'
import {
  STATE_NAMES,
  stateCodeFromName,
  stateNameFromCode,
  haversineDistance,
  slugify,
} from '@/lib/geo-utils'

describe('STATE_NAMES', () => {
  it('contains all 50 states + DC', () => {
    expect(Object.keys(STATE_NAMES).length).toBe(51)
  })

  it('maps CA to California', () => {
    expect(STATE_NAMES.CA).toBe('California')
  })
})

describe('stateCodeFromName', () => {
  it('returns code for full state name', () => {
    expect(stateCodeFromName('California')).toBe('CA')
    expect(stateCodeFromName('New Jersey')).toBe('NJ')
  })

  it('is case insensitive', () => {
    expect(stateCodeFromName('california')).toBe('CA')
    expect(stateCodeFromName('NEW YORK')).toBe('NY')
  })

  it('returns null for unknown name', () => {
    expect(stateCodeFromName('Atlantis')).toBeNull()
  })
})

describe('stateNameFromCode', () => {
  it('returns name for valid code', () => {
    expect(stateNameFromCode('CA')).toBe('California')
    expect(stateNameFromCode('nj')).toBe('New Jersey')
  })

  it('returns null for invalid code', () => {
    expect(stateNameFromCode('XX')).toBeNull()
  })
})

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(40.7128, -74.006, 40.7128, -74.006)).toBe(0)
  })

  it('calculates NYC to LA ≈ 2,451 miles', () => {
    const dist = haversineDistance(40.7128, -74.006, 34.0522, -118.2437)
    expect(dist).toBeGreaterThan(2400)
    expect(dist).toBeLessThan(2500)
  })

  it('calculates short distance: Jersey City to NYC ≈ 3-6 miles', () => {
    const dist = haversineDistance(40.7178, -74.0431, 40.7128, -74.006)
    expect(dist).toBeGreaterThan(1)
    expect(dist).toBeLessThan(10)
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('New York')).toBe('new-york')
  })

  it('removes special characters', () => {
    expect(slugify("O'Fallon")).toBe('ofallon')
  })

  it('strips accents', () => {
    expect(slugify('San José')).toBe('san-jose')
  })

  it('trims and collapses hyphens', () => {
    expect(slugify('  Los   Angeles  ')).toBe('los-angeles')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})
