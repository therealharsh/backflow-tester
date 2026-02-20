import type { Metadata } from 'next'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

const guides = [
  {
    title: 'Why Backflow Testing Is Required',
    description:
      'Understand the regulations, health risks, and legal requirements behind annual backflow testing and cross-connection control programs.',
    href: '/learn/why-backflow-testing-required',
    tags: ['Compliance', 'Regulations'],
  },
  {
    title: 'How to Choose the Right Backflow Testing Provider',
    description:
      'A practical guide to evaluating certifications, ratings, service areas, and device expertise when selecting a backflow tester.',
    href: '/learn/choose-the-right-provider',
    tags: ['Hiring', 'Checklist'],
  },
]

export const metadata: Metadata = {
  title: 'Learn About Backflow Testing | Guides & Resources',
  description:
    'Educational guides about backflow testing, cross-connection control, choosing a certified tester, and staying compliant with local water authority requirements.',
  alternates: { canonical: `${BASE}/learn` },
  openGraph: {
    title: 'Backflow Testing Learning Center',
    description: 'Guides and resources to help you understand backflow testing and prevention.',
    url: `${BASE}/learn`,
    type: 'website',
  },
}

export default function LearnPage() {
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: `${BASE}/learn` },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <div className="section py-12">
        <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-600">Learn</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-3">Learning Center</h1>
        <p className="text-gray-500 mb-10 max-w-xl">
          In-depth guides to help you understand backflow testing, stay compliant with local
          regulations, and choose the right provider for your needs.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 max-w-3xl">
          {guides.map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className="card p-6 group hover:shadow-md transition-shadow"
            >
              <div className="flex flex-wrap gap-1.5 mb-3">
                {guide.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                {guide.title}
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">{guide.description}</p>
              <span className="inline-block mt-3 text-blue-600 text-sm font-medium">
                Read guide &rarr;
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 bg-gray-50 rounded-xl p-6 sm:p-8 max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Quick Answers</h2>
          <p className="text-gray-600 text-sm mb-4">
            Looking for shorter answers? Check out our{' '}
            <Link href="/faqs" className="text-blue-600 hover:text-blue-800 underline">
              frequently asked questions
            </Link>{' '}
            for quick answers to common backflow testing questions.
          </p>
        </div>
      </div>
    </>
  )
}
