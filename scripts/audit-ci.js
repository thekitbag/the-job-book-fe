// Runs `npm audit` and fails only on high/critical advisories that are not
// explicitly allowlisted below. Replaces a bare `npm audit --audit-level=high`
// so we can pass over advisories that have no compatible upstream fix.
//
// Run with: node scripts/audit-ci.js
import { execFileSync } from 'child_process'

// GHSA ids we knowingly accept, with the reason they can't be fixed today.
//
// Empty is the goal: an entry here suppresses a real high/critical finding, so
// each one needs a reason it cannot be fixed and gets removed the moment a
// compatible release lands. GHSA-mh99-v99m-4gvg (brace-expansion) lived here
// until 1.1.18 / 2.1.4 / 5.0.9 shipped the fix without the incompatible
// `{ expand }` export that had blocked the upgrade.
const ALLOWLIST = new Map([])

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
