import { describe, it, expect } from 'vitest'
import { placeBet, settleEvent, cancelEvent } from './logic'
const mk = () => ({ bal: 1000, bets: [], log: [], st: {} })
describe('ставки', () => {
  it('не даёт поставить больше баланса', () => {
    const s = mk(); expect(placeBet(s, 'e1', 0, 2000).err).toBeTruthy(); expect(s.bal).toBe(1000)
  })
  it('платит победителю: ставка × коэффициент', () => {
    const s = mk(); placeBet(s, 'e1', 0, 100); settleEvent(s, 'e1', 0); expect(s.bal).toBe(1100)
  })
  it('возвращает ставку при отмене', () => {
    const s = mk(); placeBet(s, 'e1', 1, 100); cancelEvent(s, 'e1'); expect(s.bal).toBe(1000)
  })
  it('не принимает ставки на закрытое событие', () => {
    const s = mk(); s.st['e1'] = { s: 'closed' }; expect(placeBet(s, 'e1', 0, 100).err).toBeTruthy()
  })
})
