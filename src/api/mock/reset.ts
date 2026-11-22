import { resetMockJobLog } from './jobLog'
import { resetMockQueue } from './reviewQueue'
import { _resetMockAuthForTesting } from './auth'
import { _resetMockJobsForTesting } from './jobs'
import { _resetMockMemoryForTesting } from './state'
import { _resetMockPhotosForTesting } from './photos'
import { _resetMockWorkshopForTesting } from './workshop'

export function resetMockApiForE2e(scenario = 'default'): void {
  resetMockQueue()
  resetMockJobLog()
  _resetMockAuthForTesting()
  _resetMockJobsForTesting()
  _resetMockMemoryForTesting(scenario)
  _resetMockPhotosForTesting()
  _resetMockWorkshopForTesting(scenario)
}
