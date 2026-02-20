import type { Metadata } from 'next'
import Link from 'next/link'
import ContactForm from './ContactForm'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export const metadata: Metadata = {
  title: 'Contact Us | Get Help Finding a Certified Backflow Tester',
  description:
    'Have questions about backflow testing or need help finding a certified provider? Contact the FindBackflowTesters.com team and we\'ll get back to you promptly.',
  alternates: { canonical: `${BASE}/contact` },
  openGraph: {
    title: 'Contact FindBackflowTesters.com',
    description: 'Reach out to our team for help finding certified backflow testing professionals.',
    url: `${BASE}/contact`,
    type: 'website',
  },
}

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ContactPage',
            name: 'Contact FindBackflowTesters.com',
            url: `${BASE}/contact`,
            mainEntity: {
              '@type': 'Organization',
              name: 'FindBackflowTesters.com',
              url: BASE,
            },
          }),
        }}
      />

      <div className="section py-12 max-w-3xl mx-auto">
        <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-600">Contact</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-3">Contact Us</h1>
        <p className="text-gray-500 mb-8 max-w-xl">
          Have a question about backflow testing, need help finding a provider, or want to list your
          business? Fill out the form below and we&apos;ll get back to you as soon as possible.
        </p>

        <div className="card p-6 sm:p-8 relative">
          <ContactForm />
        </div>

        <div className="mt-10 grid sm:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Looking for a Provider?</h2>
            <p className="text-sm text-gray-500 mb-3">
              Search our directory of certified backflow testing professionals across the US.
            </p>
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors">
              Search Providers &rarr;
            </Link>
          </div>
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Are You a Provider?</h2>
            <p className="text-sm text-gray-500 mb-3">
              Claim or register your listing to reach homeowners and businesses in your area.
            </p>
            <Link href="/claim" className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors">
              Claim Your Listing &rarr;
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
