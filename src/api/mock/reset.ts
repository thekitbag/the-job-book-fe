import { _resetMockAuthForTesting } from './auth'
import { _resetMockJobsForTesting } from './jobs'
import { _resetMockLabourPeopleForTesting } from './labourPeople'
import { _resetMockMemoryForTesting } from './state'
import { _resetMockMoneyForTesting } from './money'
import { _resetMockPaymentsForTesting } from './payments'
import { _resetMockPhotosForTesting } from './photos'

export function resetMockApiForE2e(): void {
  _resetMockAuthForTesting()
  _resetMockJobsForTesting()
  _resetMockMemoryForTesting()
  _resetMockLabourPeopleForTesting()
  _resetMockMoneyForTesting()
  _resetMockPaymentsForTesting()
  _resetMockPhotosForTesting()
}
