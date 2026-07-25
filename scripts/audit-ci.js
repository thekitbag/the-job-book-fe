// Runs `npm audit` and fails only on high/critical advisories that are not
// explicitly allowlisted below. Replaces a bare `npm audit --audit-level=high`
// so we can pass over advisories that have no compatible upstream fix.
//
// Run with: node scripts/audit-ci.js
import { execFileSync } from 'child_process'

// GHSA ids we knowingly accept, with the reason they can't be fixed today.
const ALLOWLIST = new Map([
  [
    'GHSA-mh99-v99m-4gvg',
    // brace-expansion DoS. Only patched in 5.0.8, whose named `{ expand }`
    // export is incompatible with the minimatch@3 that eslint-plugin-jsx-a11y
    // (latest) and the workbox build chain still require. Dev/build-time only;
    // not shipped in the production bundle. Remove once upstream ships a
    // compatible release.
    'brace-expansion <= 5.0.7, no compatible patched version (dev/build-only)',
  ],
])

const BLOCKING = new Set(['high', 'critical'])

// `npm audit --json` exits non-zero when advisories exist, so capture stdout
// even on failure.
let report
try {
  report = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8' })
} catch (err) {
  report = err.stdout
}

const { vulnerabilities = {} } = JSON.parse(report)

const ghsaFromUrl = (url) => (typeof url === 'string' ? url.split('/').pop() : undefined)

const unhandled = []
for (const vuln of Object.values(vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via !== 'object') continue
    if (!BLOCKING.has(via.severity)) continue
    const ghsa = ghsaFromUrl(via.url)
    if (ghsa && ALLOWLIST.has(ghsa)) continue
    unhandled.push({ name: via.name, severity: via.severity, title: via.title, url: via.url })
  }
}

if (unhandled.length > 0) {
  console.error(`Found ${unhandled.length} unallowlisted high/critical advisory/advisories:`)
  for (const a of unhandled) {
    console.error(`  - [${a.severity}] ${a.name}: ${a.title} (${a.url})`)
  }
  process.exit(1)
}

const allowed = [...ALLOWLIST.keys()].join(', ')
console.log(`npm audit clean (allowlisted: ${allowed || 'none'}).`)
