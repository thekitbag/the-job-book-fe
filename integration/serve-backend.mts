// Explicit local integration harness: real release backend, PostgreSQL and
// disk storage. Only the speech providers and test-fixture controls are fake.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const root = process.env.JOB_BOOK_BACKEND_ROOT
if (!root)
  throw new Error('Set JOB_BOOK_BACKEND_ROOT to a release/job-memory checkout')
const require = createRequire(root + '/package.json')
require('dotenv').config({ path: root + '/.env.test', quiet: true })
process.env.SESSION_COOKIE_SECRET = 'isolated-frontend-integration-secret'
process.env.LOG_LEVEL = 'error'
process.env.FRONTEND_ORIGIN = 'https://localhost:5177'
delete process.env.PILOT_USER_ID
delete process.env.MONEY_FEATURES_ENABLED
const { buildApp } = await import(root + '/src/app.ts')
const { prisma } = await import(root + '/src/db/client.ts')
const { LocalAudioStorage } = await import(root + '/src/storage/local.ts')
let scenario = 'normal'
const scenarios = new Map<string, string>()
const facts = [
  {
    factType: 'labour',
    summary: 'Mike two hours',
    labourPerson: 'Mike',
    labourHours: '2',
    confidenceLabel: 'high',
    confidenceReason: 'Stated',
    uncertaintyFlags: [],
  },
  {
    factType: 'ordered_material',
    summary: 'About two sheets of OSB',
    materialName: 'OSB',
    quantity: '2',
    unit: 'sheets',
    supplierName: 'Jewson',
    locationOrUse: 'Back wall',
    confidenceLabel: 'medium',
    confidenceReason: 'Approximate',
    uncertaintyFlags: ['approximate_quantity'],
  },
]
const app = buildApp({
  storage: new LocalAudioStorage('/tmp/record-home-ui-audio'),
  transcription: {
    name: 'ui-test',
    model: 'deterministic',
    async transcribe(input) {
      const picked =
        input.audioBuffer.toString() === '__group__' ? 'group' : scenario
      scenario = 'normal'
      scenarios.set(input.noteId, picked)
      return {
        text:
          picked === 'silent'
            ? ''
            : 'Mike worked two hours. Bought about two sheets of OSB from Jewson for the back wall.',
      }
    },
  },
  extraction: {
    name: 'ui-test',
    model: 'deterministic',
    async extractFacts(input) {
      const mode = scenarios.get(input.noteId),
        selected =
          mode === 'group'
            ? [facts[1]]
            : mode === 'more'
              ? [
                  ...facts,
                  {
                    factType: 'unclear',
                    summary: 'Unclear delivery detail',
                    confidenceLabel: 'low',
                    confidenceReason: 'Unclear',
                    uncertaintyFlags: ['uncertain'],
                  } as const,
                ]
              : facts
      return { schemaVersion: 'v3-job-memory', facts: selected }
    },
  },
})
app.post('/__test/scenario', async (request) => {
  scenario = (request.body as { scenario: string }).scenario
  return { ok: true }
})
app.post('/__test/group/:id', async (request) => {
  const note = await prisma.rawNote.findUniqueOrThrow({
    where: { id: request.params.id },
  })
  const f = new FormData()
  f.set('audio', new Blob(['__group__'], { type: 'audio/webm' }), 'group.webm')
  f.set('clientNoteId', crypto.randomUUID())
  f.set('captureContext', 'job')
  f.set('mimeType', 'audio/webm')
  f.set('capturedAt', new Date().toISOString())
  f.set('durationMs', '1000')
  f.set('jobId', note.jobId!)
  const response = await fetch('http://127.0.0.1:3002/api/notes', {
    method: 'POST',
    headers: { cookie: request.headers.cookie ?? '' },
    body: f,
  })
  const body = (await response.json()) as { note: { id: string } }
  for (let i = 0; i < 100; i++) {
    const t = await prisma.transcript.findFirst({
      where: { noteId: body.note.id },
      orderBy: { createdAt: 'desc' },
    })
    if (t?.extractionStatus === 'COMPLETED') break
    await new Promise((r) => setTimeout(r, 10))
  }
  return body
})
app.post('/__test/block-move/:id', async (request) => {
  const note = await prisma.rawNote.findUniqueOrThrow({
      where: { id: request.params.id },
    }),
    facts = await prisma.candidateFact.findMany({
      where: { sourceNoteId: note.id },
    })
  await prisma.reviewDecision.create({
    data: {
      jobId: note.jobId!,
      decidedBy: note.ownerUserId,
      action: 'QUEUE_CONFIRM',
      sourceCandidateFactIds: [facts[0].id, 'different-note-fact'],
    },
  })
  return { ok: true }
})
await app.listen({ host: '127.0.0.1', port: 3002 })
writeFileSync('/tmp/record-home-ui-server-ready', '4ec49f3\n')
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })
