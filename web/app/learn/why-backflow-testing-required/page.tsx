import type { Metadata } from 'next'
import Link from 'next/link'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export const metadata: Metadata = {
  title: 'Why Backflow Testing Is Required | Regulations & Compliance Guide',
  description:
    'Learn why annual backflow testing is required by law, how cross-connection control programs work, and what happens if you skip your backflow prevention device inspection.',
  alternates: { canonical: `${BASE}/learn/why-backflow-testing-required` },
  openGraph: {
    title: 'Why Backflow Testing Is Required',
    description:
      'Understand the legal requirements, health risks, and compliance process for annual backflow testing.',
    url: `${BASE}/learn/why-backflow-testing-required`,
    type: 'article',
  },
}

export default function WhyBackflowTestingRequiredPage() {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Why Backflow Testing Is Required',
    description:
      'Learn why annual backflow testing is required by law, how cross-connection control programs work, and what happens if you skip your backflow prevention device inspection.',
    url: `${BASE}/learn/why-backflow-testing-required`,
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
        name: 'Why Backflow Testing Is Required',
        item: `${BASE}/learn/why-backflow-testing-required`,
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
          <span className="text-gray-600">Why Backflow Testing Is Required</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold mb-6">
          Why Backflow Testing Is Required
        </h1>

        <div className="space-y-8 text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              What Is Backflow and Why Is It Dangerous?
            </h2>
            <p>
              Backflow occurs when water flows in the opposite direction through your plumbing,
              potentially pulling contaminants from irrigation systems, boilers, chemical storage, or
              other non-potable sources into the public drinking water supply. This can happen when
              there&apos;s a sudden drop in water pressure — from a water main break, heavy fire
              hydrant use, or system maintenance.
            </p>
            <p className="mt-3">
              The health risks are serious. Backflow incidents have caused real outbreaks of illness
              from bacteria, pesticides, fertilizers, and industrial chemicals entering drinking
              water. This is why every state and most municipalities require properties with
              cross-connections to install and maintain backflow prevention devices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Cross-Connection Control Programs
            </h2>
            <p>
              Local water utilities run cross-connection control programs as mandated by the EPA&apos;s
              Safe Drinking Water Act. These programs identify properties with cross-connections —
              any point where a potable water line connects to a non-potable source — and require the
              installation and annual testing of backflow prevention devices.
            </p>
            <p className="mt-3">
              Common cross-connections include irrigation and lawn sprinkler systems, fire
              suppression systems, swimming pools, boilers, dental and medical equipment, and
              commercial kitchen equipment. If your property has any of these, you almost certainly
              need a backflow preventer installed and tested annually.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Annual Backflow Testing Requirements
            </h2>
            <p>
              Most jurisdictions require annual backflow testing — a certified backflow tester must
              inspect your RPZ valve, DCVA, PVB, or other backflow prevention device once a year to
              verify it&apos;s working correctly. The tester uses calibrated test gauges to check
              internal valve operation, pressure differentials, and relief valve discharge.
            </p>
            <p className="mt-3">
              After the test, the certified tester files a report with your local water authority
              documenting the results. If the device passes, you&apos;re compliant until the next
              annual test. If it fails, repairs must be made and the device retested before the
              deadline — otherwise you risk fines or water service interruption.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Types of Backflow Prevention Devices
            </h2>
            <p>
              The type of device required depends on the hazard level of the cross-connection:
            </p>
            <ul className="mt-3 space-y-2 list-disc list-inside">
              <li>
                <strong>RPZ (Reduced Pressure Zone) valves</strong> — required for high-hazard
                applications. Considered the gold standard with two check valves and a relief valve.
                Common in commercial and irrigation systems.
              </li>
              <li>
                <strong>DCVA (Double Check Valve Assembly)</strong> — used for low-to-moderate hazard
                applications like fire sprinklers. Two independent check valves without a relief
                valve.
              </li>
              <li>
                <strong>PVB (Pressure Vacuum Breaker)</strong> — protects against backsiphonage only.
                Commonly used in residential irrigation. Must be installed above the highest
                downstream point.
              </li>
            </ul>
            <p className="mt-3">
              Each device type requires specific testing procedures and expertise. When choosing a
              certified backflow tester, make sure they have experience with your particular device
              type.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              What Happens If You Skip Testing?
            </h2>
            <p>
              The consequences of non-compliance vary by jurisdiction but typically include:
            </p>
            <ul className="mt-3 space-y-2 list-disc list-inside">
              <li>Violation notices and fines (often $50–$500+ per month)</li>
              <li>Water service shutoff until the device is tested and certified</li>
              <li>Liability for any contamination that results from a failed device</li>
              <li>Increased insurance costs or denial of coverage</li>
            </ul>
            <p className="mt-3">
              The cost of an annual backflow test ($50–$200) is a fraction of what you&apos;d pay in
              fines, legal liability, or the consequences of contaminated water. Don&apos;t wait
              for a violation notice — schedule your annual backflow prevention device inspection on
              time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Find a Certified Backflow Tester Near You
            </h2>
            <p>
              Ready to schedule your annual backflow test? Use our directory to compare certified
              backflow testing professionals in your area by ratings, reviews, and services offered.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/" className="btn-primary">
                Search Providers
              </Link>
              <Link href="/learn/choose-the-right-provider" className="btn-secondary">
                How to Choose a Provider
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
