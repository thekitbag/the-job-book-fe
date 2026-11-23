// Compatibility barrel for the API boundary. Components keep importing from
// './api'; implementations live in domain modules under src/api/ (production
// fetch code) and src/api/mock/ (mock backend fixtures + state).

export { ApiError, onUnauthorized, resolveApiUrl } from './api/client'
export {
  signup,
  login,
  logout,
  getCurrentUser,
  requestPasswordReset,
  confirmPasswordReset,
} from './api/auth'
export { getCurrentJob, getJobs, getJob, createJob, patchJob } from './api/jobs'
export {
  getJobNoteStatuses,
  getDraftFacts,
  getNoteTranscript,
  uploadNote,
} from './api/notes'
export type {
  UploadNoteResponse,
  NoteListRow,
  TranscriptResponse,
} from './api/notes'
export { getReviewQueue, submitQueueDecision } from './api/reviewQueue'
export {
  getMemoryView,
  updateMemoryItem,
  verifyMemoryItem,
  createMemoryItem,
  removeMemoryItem,
  returnMemoryItem,
} from './api/memory'
export { getInspectionData } from './api/inspection'
export {
  getJobPhotos,
  uploadJobPhoto,
  patchJobPhoto,
  removeJobPhoto,
} from './api/photos'
export {
  getJobDetails,
  patchJobDetails,
  createJobContact,
  patchJobContact,
  removeJobContact,
} from './api/jobDetails'
export { _resetMockJobDetailsForTesting } from './api/mock/jobDetails'
export {
  getWorkshop,
  moveLeftoverToWorkshop,
  createWorkshopItem,
  patchWorkshopItem,
  undoWorkshopMove,
  markWorkshopItemUsedUp,
  markWorkshopItemWasntThere,
  putBackWorkshopItem,
  isAlreadyInWorkshop,
} from './api/workshop'
export { _resetMockWorkshopForTesting } from './api/mock/workshop'
export {
  getSupportUsers,
  getSupportUserJobs,
  getSupportJobInspection,
  getSupportJobMoney,
  getSupportJobLabourPeople,
  getSupportMemoryView,
  getSupportBudgetSummary,
  getSupportReviewQueue,
  getSupportPhotos,
} from './api/support'
export { _resetMockMemoryForTesting } from './api/mock/state'
export { getJobLog } from './api/jobLog'
export {
  getCaptureHome,
  getUnfiledCaptures,
  uploadCaptureNote,
  fileCaptureNote,
  moveCaptureNote,
  uploadCapturePhoto,
  fileCapturePhoto,
  moveCapturePhoto,
  getCaptureDraft,
  confirmCaptureDraft,
} from './api/capture'
