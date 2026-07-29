// Compatibility barrel for the API boundary. Components keep importing from
// './api'; implementations live in domain modules under src/api/ (production
// fetch code) and src/api/mock/ (mock backend fixtures + state).

export { ApiError, onUnauthorized, resolveApiUrl } from './api/client'
export { signup, login, logout, getCurrentUser, requestPasswordReset, confirmPasswordReset } from './api/auth'
export { getCurrentJob, getJobs, createJob, patchJob } from './api/jobs'
export { getJobNoteStatuses, getDraftFacts, getNoteTranscript, uploadNote } from './api/notes'
export type { UploadNoteResponse, NoteListRow, TranscriptResponse } from './api/notes'
export { getReviewQueue, submitQueueDecision } from './api/reviewQueue'
export { getMemoryView, updateMemoryItem, verifyMemoryItem, createMemoryItem, assignMemoryItemCategory, removeMemoryItem, returnMemoryItem, PAID_LABOUR_COST_EDIT_MESSAGE } from './api/memory'
export { getBudgetCategories, createBudgetCategory, patchBudgetCategory, getBudgetSummary } from './api/budget'
export { getInspectionData } from './api/inspection'
export { getJobPhotos, uploadJobPhoto, patchJobPhoto, removeJobPhoto } from './api/photos'
export {
  getJobPayments, patchCustomerTotal, createJobPayment, patchJobPayment, deleteJobPayment,
  getSupportJobPayments,
} from './api/payments'
export { _resetMockPaymentsForTesting } from './api/mock/payments'
export { getJobMoney, markMoneyOut, deleteMoneyEvent, getSupportJobMoney } from './api/money'
export { _resetMockMoneyForTesting } from './api/mock/money'
export { getLabourPeople, createLabourPerson, patchLabourPerson, getSupportJobLabourPeople } from './api/labourPeople'
export { _resetMockLabourPeopleForTesting } from './api/mock/labourPeople'
export {
  getSupportUsers, getSupportUserJobs, getSupportJobInspection,
  getSupportMemoryView, getSupportBudgetSummary, getSupportReviewQueue, getSupportPhotos,
} from './api/support'
export { _resetMockMemoryForTesting } from './api/mock/state'
