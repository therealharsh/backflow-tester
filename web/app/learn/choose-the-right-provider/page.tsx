import type { Metadata } from 'next'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export const metadata: Metadata = {
  title: 'How to Choose a Backflow Testing Provider | Selection Guide',
  description:
    'Learn how to evaluate and select a certified backflow tester: what certifications to look for, questions to ask, and a checklist to compare providers in your area.',
  alternates: { canonical: `${BASE}/learn/choose-the-right-provider` },
  openGraph: {
    title: 'How to Choose the Right Backflow Testing Provider',
    description:
      'A practical guide to selecting a certified backflow tester with the right credentials, experience, and service quality.',
    url: `${BASE}/learn/choose-the-right-provider`,
    type: 'article',
  },
}

export default function ChooseProviderPage() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'How to Choose the Right Backflow Testing Provider',
    description:
      'Learn how to evaluate and select a certified backflow tester: what certifications to look for, questions to ask, and a checklist to compare providers.',
    url: `${BASE}/learn/choose-the-right-provider`,
    publisher: {
      '@type': 'Organization',
      name: 'FindBackflowTesters.com',
      url: BASE,
    },
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Learn', item: `${BASE}/learn` },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Choose the Right Provider',
        item: `${BASE}/learn/choose-the-right-provider`,
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <article className="section py-12 max-w-3xl mx-auto">
        <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <span>/</span>
          <Link href="/learn" className="hover:text-blue-600 transition-colors">Learn</Link>
          <span>/</span>
          <span className="text-gray-600">Choose the Right Provider</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-6">
          How to Choose the Right Backflow Testing Provider
        </h1>

        <div className="space-y-8 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Why the Right Provider Matters
            </h2>
            <p>
              Not all backflow testers are created equal. A poorly performed test can miss a failing
              device, leaving your property out of compliance and your water supply at risk. Choosing
              a qualified, experienced provider ensures your backflow prevention devices are properly
              inspected, your test reports are filed correctly, and your property stays compliant
              with local water authority requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Verify Certification and Licensing
            </h2>
            <p>
              The most important factor when choosing a backflow tester is valid certification. Every
              state and most local jurisdictions require backflow testers to hold specific
              certifications — typically from a state-approved program that includes both written and
              practical exams.
            </p>
            <p className="mt-3">
              Ask for the tester&apos;s certification number and verify it with your local water
              authority. Make sure their certification is current (not expired) and covers the type
              of device you need tested. Some certifications cover all device types, while others
              are limited.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Check Ratings and Reviews
            </h2>
            <p>
              Online reviews from other customers are one of the best indicators of service quality.
              Look for providers with consistent 4+ star ratings and a reasonable volume of reviews.
              Pay attention to comments about professionalism, punctuality, thoroughness of testing,
              and whether the provider handled paperwork and filing efficiently.
            </p>
            <p className="mt-3">
              On FindBackflowTesters.com, we display Google review ratings and review counts for
              every listed provider. Our Backflow Score factors in these reviews along with other
              quality indicators to help you compare providers at a glance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Confirm Service Area and Availability
            </h2>
            <p>
              Backflow testing providers often serve specific geographic areas. Before scheduling,
              confirm the provider serves your zip code or city. Also check their availability —
              if your test is due soon, you need a provider who can schedule promptly, especially
              during peak testing season (spring and summer) when demand is highest.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Ask About Device Expertise
            </h2>
            <p>
              Different backflow prevention devices (RPZ, DCVA, PVB, and others) require different
              testing procedures and expertise. Make sure the provider has experience testing your
              specific device type. This is especially important for RPZ valves, which are more
              complex and require specialized knowledge to test and repair.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Ask About Report Filing
            </h2>
            <p>
              After testing, results must be submitted to your local water authority. Some providers
              handle this filing for you (a significant convenience), while others hand you the
              paperwork and leave you to submit it yourself. Providers who file directly reduce your
              administrative burden and help ensure compliance deadlines are met.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Compare Pricing
            </h2>
            <p>
              Backflow testing typically costs $50–$200 per device. Factors that affect pricing
              include your location, the type and number of devices, accessibility of the device,
              and whether repairs are needed. Get quotes from 2–3 providers to ensure fair pricing.
              Be wary of prices that seem too low — it may indicate shortcuts or lack of proper
              calibration equipment.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Provider Selection Checklist
            </h2>
            <p className="mb-3">
              Use this checklist when evaluating backflow testing providers:
            </p>
            <div className="bg-gray-50 rounded-xl p-5">
              <ul className="space-y-2.5">
                {[
                  'Holds valid, current backflow tester certification',
                  'Certification verified with local water authority',
                  'Experienced with your specific device type (RPZ, DCVA, PVB)',
                  'Good ratings and reviews (4+ stars)',
                  'Services your area / zip code',
                  'Available within your compliance deadline',
                  'Carries liability insurance',
                  'Files test reports with your water district',
                  'Provides clear, upfront pricing',
                  'Can perform repairs if device fails the test',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Find Certified Providers in Your Area
            </h2>
            <p>
              Ready to compare providers? Search our directory of certified backflow testing
              professionals across the US. Filter by location, ratings, and services to find the
              best fit for your needs.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/" className="btn-primary">
                Search Providers
              </Link>
              <Link href="/#states" className="btn-secondary">
                Browse by State
              </Link>
            </div>
          </section>
        </div>

        <div className="mt-10 pt-8 border-t border-gray-100">
          <Link
            href="/learn"
            className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
          >
            &larr; Back to Learning Center
          </Link>
        </div>
      </article>
    </>
  )
}
