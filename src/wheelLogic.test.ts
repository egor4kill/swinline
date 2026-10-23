import { describe, it, expect } from 'vitest'
import { SECTORS, rtp } from './wheelLogic'

describe('колесо фортуны', () => {
  it('16 секторов с корректными множителями', () => {
    expect(SECTORS).toHaveLength(16)
    for (const s of SECTORS) expect(s.mul).toBeGreaterThanOrEqual(0)
  })
  it('теоретический возврат 94–99% (колесо не печатает деньги)', () => {
    expect(rtp()).toBeGreaterThan(0.94)
    expect(rtp()).toBeLessThan(0.99)
  })
  it('джекпот x10 ровно один', () => {
    expect(SECTORS.filter(s => s.mul >= 5)).toHaveLength(1)
  })
})
