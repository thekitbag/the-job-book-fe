// Compatibility barrel for the API boundary. Components keep importing from
// './api'; implementations live in domain modules under src/api/ (production
// fetch code) and src/api/mock/ (mock backend fixtures + state).

export { ApiError, onUnauthorized, resolveApiUrl } from './api/client'
export { signup, login, logout, getCurrentUser, requestPasswordReset, confirmPasswordReset } from './api/auth'
export { getCurrentJob, getJobs, createJob, patchJob } from './api/jobs'
export { getJobNoteStatuses, getDraftFacts, getNoteTranscript, uploadNote } from './api/notes'
export type { UploadNoteResponse, NoteListRow, TranscriptResponse } from './api/notes'
export { getReviewQueue, submitQueueDecision } from './api/reviewQueue'
export { getMemoryView, updateMemoryItem, verifyMemoryItem, createMemoryItem, assignMemoryItemCategory } from './api/memory'
export { getBudgetCategories, createBudgetCategory, patchBudgetCategory, getBudgetSummary } from './api/budget'
export { getInspectionData } from './api/inspection'
export { getJobPhotos, uploadJobPhoto, patchJobPhoto } from './api/photos'
export {
  getSupportUsers, getSupportUserJobs, getSupportJobInspection,
  getSupportMemoryView, getSupportBudgetSummary, getSupportReviewQueue, getSupportPhotos,
} from './api/support'
export { _resetMockMemoryForTesting } from './api/mock/state'
