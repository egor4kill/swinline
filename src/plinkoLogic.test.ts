import { describe, it, expect } from 'vitest'
import { ROWS, TABLES, drop, payout, rtp, type Risk } from './plinkoLogic'

describe('плинко', () => {
  it('в таблицах 13 ячеек и они симметричны', () => {
    for (const r of Object.keys(TABLES) as Risk[]) {
      expect(TABLES[r]).toHaveLength(ROWS + 1)
      expect(TABLES[r]).toEqual([...TABLES[r]].reverse())
    }
  })
  it('теоретический возврат 94–99%', () => {
    for (const r of Object.keys(TABLES) as Risk[]) {
      expect(rtp(r)).toBeGreaterThan(0.94)
      expect(rtp(r)).toBeLessThan(0.99)
    }
  })
  it('ячейка равна числу шагов вправо', () => {
    const d = drop()
    expect(d.slot).toBe(d.bits.reduce((a, b) => a + b, 0))
    expect(drop(() => 0).slot).toBe(0)
    expect(drop(() => 0.9).slot).toBe(ROWS)
  })
  it('выплата = ставка × множитель', () => {
    expect(payout(100, 'mid', 0)).toBe(2100)
    expect(payout(50, 'low', 6)).toBe(25)
  })
})
