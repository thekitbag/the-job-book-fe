import type { BookMoneyResponse } from '../types'
import { ApiError, apiFetch, USE_MOCK } from './client'
import { delay } from './mock/util'
import { mockGetBookMoney } from './mock/bookMoney'

// Cross-job Money — read only. One endpoint feeds both the Book Home Money row
// and the Money overview, so the figure on the cover and the figure inside the
// page come from the same calculation. There are no write endpoints in this
// slice, by design: corrections happen at the source job/item.

// GET /api/book/money
export async function getBookMoney(): Promise<BookMoneyResponse> {
  if (USE_MOCK) {
    await delay(300)
    return mockGetBookMoney()
  }
  const res = await apiFetch('/api/book/money')
  if (!res.ok) throw new ApiError(`GET /api/book/money → ${res.status}`, res.status)
  return res.json() as Promise<BookMoneyResponse>
}
