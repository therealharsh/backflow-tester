import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'

export const metadata: Metadata = {
  title: {
    default: 'Find Certified Backflow Testers | FindBackflowTesters.com',
    template: '%s | FindBackflowTesters.com',
  },
  description:
    'Find certified backflow testing and prevention professionals near you. ' +
    'Verified providers across the US for RPZ testing, cross-connection control, and annual inspections.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
  ),
  openGraph: { siteName: 'FindBackflowTesters.com', type: 'website' },
}

// Inline SVG drop icon (avoids lucide-react SSR edge-case)
function DropIcon() {
  return (
    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C12 2 5 10.5 5 15a7 7 0 0014 0c0-4.5-7-13-7-13z" />
    </svg>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-gray-50 text-gray-900 antialiased">
        {/* Header — white sticky bar */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
          <div className="section flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg text-blue-700 hover:text-blue-800 transition-colors">
              <DropIcon />
              <span className="hidden sm:inline">FindBackflowTesters.com</span>
              <span className="sm:hidden font-extrabold">FBT</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium">
              <Link href="/" className="px-3 py-2 text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors hidden sm:block">
                Home
              </Link>
              <Link href="/blog" className="px-3 py-2 text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                Blog
              </Link>
              <Link href="/#states" className="px-3 py-2 text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                Browse States
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-gray-900 text-gray-400">
          <div className="section py-12">
            <div className="grid sm:grid-cols-3 gap-8 mb-8">
              <div>
                <div className="flex items-center gap-2 text-white font-bold mb-3 text-sm">
                  <span className="text-blue-400">●</span> FindBackflowTesters.com
                </div>
                <p className="text-sm leading-relaxed">
                  Your trusted directory of verified backflow testing professionals across the United States.
                </p>
              </div>
              <div>
                <p className="text-white font-semibold mb-3 text-sm uppercase tracking-wide">Directory</p>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
                  <li><Link href="/#states" className="hover:text-white transition-colors">Browse by State</Link></li>
                  <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-white font-semibold mb-3 text-sm uppercase tracking-wide">Disclaimer</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Provider data sourced from Google Maps. Always verify licensing with your local water authority before hiring.
                </p>
              </div>
            </div>
            <div className="border-t border-gray-800 pt-6 text-center text-xs text-gray-600">
              © {new Date().getFullYear()} FindBackflowTesters.com — All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
