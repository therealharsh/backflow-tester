'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'

// Public-domain topojson from us-atlas (CDN)
const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

const NAME_TO_CODE: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
}

interface TooltipState {
  name: string
  code: string
  count: number
  x: number
  y: number
}

interface Props {
  stateCounts: Record<string, number>
  stateNames: Record<string, string>
}

function getFill(count: number, max: number): string {
  if (count === 0) return '#e5e7eb' // no providers — gray
  const t = count / max
  if (t < 0.15) return '#dbeafe' // blue-100
  if (t < 0.35) return '#93c5fd' // blue-300
  if (t < 0.55) return '#3b82f6' // blue-500
  if (t < 0.75) return '#1d4ed8' // blue-700
  return '#1e3a8a'               // blue-900
}

export default function USMap({ stateCounts, stateNames }: Props) {
  const router = useRouter()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const max = Math.max(...Object.values(stateCounts), 1)

  return (
    <div className="relative w-full select-none">
      <ComposableMap
        projection="geoAlbersUsa"
        width={960}
        height={520}
        projectionConfig={{ scale: 1100 }}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const stateName = geo.properties.name as string
              const code = NAME_TO_CODE[stateName]
              if (!code) return null
              const count = stateCounts[code] ?? 0
              const isHovered = hovered === code
              const hasProviders = count > 0

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isHovered ? '#f59e0b' : getFill(count, max)}
                  stroke="#ffffff"
                  strokeWidth={0.75}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                  className={hasProviders ? 'cursor-pointer' : 'cursor-default'}
                  onMouseEnter={(e: React.MouseEvent) => {
                    setHovered(code)
                    setTooltip({ name: stateName, code, count, x: e.clientX, y: e.clientY })
                  }}
                  onMouseMove={(e: React.MouseEvent) => {
                    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                  }}
                  onMouseLeave={() => {
                    setHovered(null)
                    setTooltip(null)
                  }}
                  onClick={() => {
                    if (hasProviders) router.push(`/${code.toLowerCase()}`)
                  }}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white rounded-xl px-3.5 py-2.5 shadow-2xl text-sm"
          style={{ left: tooltip.x + 14, top: tooltip.y - 52 }}
        >
          <p className="font-bold leading-tight">{tooltip.name}</p>
          <p className="text-blue-300 text-xs mt-0.5">
            {tooltip.count > 0
              ? `${tooltip.count.toLocaleString()} provider${tooltip.count !== 1 ? 's' : ''}`
              : 'No providers listed'}
          </p>
        </div>
      )}

      {/* Footer: hint + legend */}
      <div className="mt-1 flex items-center justify-between px-1 text-xs text-gray-500">
        <span>Hover a state to see provider count — click to browse listings</span>
        <div className="flex items-center gap-2">
          <span>Fewer</span>
          {['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'].map((c) => (
            <span key={c} className="inline-block w-5 h-3 rounded-sm" style={{ background: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
