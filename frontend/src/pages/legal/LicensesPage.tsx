import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../../hooks/usePageTitle'

interface LicenseData {
  packages: { name: string; version: string; license: string; part: string; copyright: string }[]
  licenses: Record<string, string>
}

const REPO_URL = 'https://github.com/SanjivA336/PantryMVP'

// The open-source notices for the packages Burrow is built from (the MIT, ISC and BSD
// licenses ask that their copyright notices travel with the software). The list comes from
// scripts/generate_third_party_licenses.py and is loaded only when this page is opened, so it
// never weighs down the rest of the app.
export function LicensesPage() {
  usePageTitle('Open-source licenses')
  const [data, setData] = useState<LicenseData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    import('../../legal/thirdPartyLicenses.json')
      .then((module) => setData(module.default as LicenseData))
      .catch(() => setFailed(true))
  }, [])

  return (
    <div className="min-h-app bg-bg px-4 pb-4 pt-[max(1rem,var(--safe-top),var(--offline-banner-total,0px))] text-text">
      <div className="mx-auto w-full max-w-2xl py-6">
        <div className="mb-6 text-sm">
          <Link to="/" className="font-medium text-primary hover:text-primary-hover">
            Burrow
          </Link>
        </div>

        <div className="rounded-card border border-subtle bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-semibold">Open-source licenses</h1>
          <p className="mb-6 mt-1 border-b border-subtle pb-4 text-sm text-faint">
            Copyright 2026 Sanjiv Anand
          </p>

          <p className="mb-4 text-sm leading-relaxed text-muted">
            Burrow is open source under the{' '}
            <a
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:text-primary-hover hover:underline"
            >
              Apache License 2.0
            </a>
            . The source code is at{' '}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:text-primary-hover hover:underline"
            >
              github.com/SanjivA336/PantryMVP
            </a>
            . The Burrow name, logo and icons are not covered by that license.
          </p>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Burrow is built with the open-source software below, each under its own license.
            Packages marked &quot;frontend&quot; run in your browser; &quot;backend&quot; ones run
            only on the server.
          </p>

          {failed && (
            <p className="text-sm text-danger">
              The list couldn&apos;t be loaded. It is also in the source repository, in
              THIRD_PARTY_LICENSES.md.
            </p>
          )}
          {!data && !failed && <p className="text-sm text-muted">Loading…</p>}

          {data && (
            <>
              <h2 className="mb-2 mt-8 text-lg font-semibold text-text">Packages</h2>
              <div
                role="region"
                aria-label="Table: package, version, license, copyright"
                tabIndex={0}
                className="mb-4 overflow-x-auto rounded-card border border-subtle"
              >
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead className="bg-surface-2 text-text">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Package</th>
                      <th className="px-3 py-2 font-semibold">License</th>
                      <th className="px-3 py-2 font-semibold">Copyright</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted">
                    {data.packages.map((p) => (
                      <tr key={`${p.part}-${p.name}`} className="border-t border-subtle align-top">
                        <td className="px-3 py-2">
                          {p.name} <span className="text-faint">{p.version}</span>
                          <span className="block text-xs text-faint">{p.part}</span>
                        </td>
                        <td className="px-3 py-2">{p.license}</td>
                        <td className="px-3 py-2">{p.copyright || 'See license'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 className="mb-2 mt-8 text-lg font-semibold text-text">License texts</h2>
              <div className="flex flex-col gap-2">
                {Object.entries(data.licenses).map(([name, text]) => (
                  <details key={name} className="rounded-card border border-subtle bg-surface-2">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-text">
                      {name}
                    </summary>
                    <pre
                      tabIndex={0}
                      aria-label={`${name} license text`}
                      className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-subtle px-3 py-2 text-xs leading-relaxed text-muted"
                    >
                      {text}
                    </pre>
                  </details>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
