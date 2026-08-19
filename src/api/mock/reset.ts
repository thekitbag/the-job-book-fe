import { _resetMockAuthForTesting } from './auth'
import { _resetMockBookMoneyForTesting } from './bookMoney'
import { _resetMockJobsForTesting } from './jobs'
import { _resetMockLabourPeopleForTesting } from './labourPeople'
import { _resetMockMemoryForTesting } from './state'
import { _resetMockMoneyForTesting } from './money'
import { _resetMockPaymentsForTesting } from './payments'
import { _resetMockPhotosForTesting } from './photos'
import { _resetMockReceiptsForTesting } from './receipts'
import { _resetMockWorkshopForTesting } from './workshop'

export function resetMockApiForE2e(scenario = 'default'): void {
  _resetMockAuthForTesting()
  _resetMockJobsForTesting()
  _resetMockMemoryForTesting(scenario)
  _resetMockLabourPeopleForTesting()
  _resetMockMoneyForTesting(scenario)
  _resetMockBookMoneyForTesting(scenario)
  _resetMockPaymentsForTesting()
  _resetMockPhotosForTesting()
  _resetMockReceiptsForTesting()
  _resetMockWorkshopForTesting(scenario)
}
