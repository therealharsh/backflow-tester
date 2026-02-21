import type { Metadata } from 'next'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export const metadata: Metadata = {
  title: 'About Us | Our Mission to Connect You with Certified Backflow Testers',
  description:
    'Learn about FindBackflowTesters.com — how we source, verify, and rank backflow testing professionals to help homeowners, businesses, and water districts find trusted providers.',
  alternates: { canonical: `${BASE}/about` },
  openGraph: {
    title: 'About FindBackflowTesters.com',
    description: 'Our mission to connect you with certified backflow testing professionals.',
    url: `${BASE}/about`,
    type: 'website',
  },
}

export default function AboutPage() {
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FindBackflowTesters.com',
    url: BASE,
    logo: `${BASE}/favicon.svg`,
    sameAs: [],
    description:
      'FindBackflowTesters.com is the leading directory of certified backflow testing and prevention professionals across the United States.',
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />

      <div className="section py-12 max-w-3xl mx-auto">
        <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-600">About</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-6">About FindBackflowTesters.com</h1>

        <div className="prose-like space-y-6 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Our Mission</h2>
            <p>
              FindBackflowTesters.com was built with a simple goal: make it easy for homeowners,
              property managers, and businesses to find certified backflow testing professionals in
              their area. Backflow prevention is a critical part of keeping drinking water safe, yet
              finding a qualified, licensed tester can be surprisingly difficult. We&apos;re here to
              change that.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">How We Source Listings</h2>
            <p>
              Our provider data is sourced primarily from Google Maps and publicly available business
              listings. We aggregate information including service areas, ratings, reviews, and
              contact details to give you a comprehensive view of backflow testing professionals near
              you. Providers can also{' '}
              <Link href="/claim" className="text-blue-600 hover:text-blue-800 underline">
                claim their listing
              </Link>{' '}
              to update their information, add services, and improve their profile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">How Rankings Work</h2>
            <p>
              We use a proprietary &ldquo;Backflow Score&rdquo; that considers multiple factors to
              rank providers: Google review ratings, number of reviews, evidence of backflow-specific
              services on their website, and verified certifications. Premium listings from providers
              who have claimed their profile may appear higher in results, and are clearly marked as
              such.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Coverage</h2>
            <p>
              We cover all 50 US states plus Washington D.C., with thousands of verified backflow
              testing professionals in our directory.{' '}
              <Link href="/#states" className="text-blue-600 hover:text-blue-800 underline">
                Browse providers by state
              </Link>{' '}
              to find certified backflow testers in your area.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Important Disclaimers</h2>
            <p>
              FindBackflowTesters.com is a directory and informational resource only. We do not
              perform backflow testing, certify testers, or guarantee the quality of any provider
              listed on our site. Provider information including licensing, certifications, and
              service areas should always be independently verified with your local water authority or
              the provider directly before hiring.
            </p>
            <p>
              The information on this site is provided &ldquo;as is&rdquo; and may not always be
              up-to-date. Always confirm credentials, insurance, and local compliance requirements
              with your water district or municipality.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Get in Touch</h2>
            <p>
              Have questions, feedback, or want to partner with us? We&apos;d love to hear from you.{' '}
              <Link href="/contact" className="text-blue-600 hover:text-blue-800 underline">
                Contact us
              </Link>{' '}
              and our team will get back to you as soon as possible.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
