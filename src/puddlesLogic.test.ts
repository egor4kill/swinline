import { describe, it, expect } from 'vitest'
import { N, multiplier, newRound } from './puddlesLogic'

describe('грязевые лужи', () => {
  it('в раунде ровно столько луж, сколько выбрано', () => {
    for (const m of [1, 3, 5, 10, 20]) expect(newRound(m).filter(Boolean).length).toBe(m)
  })
  it('без открытых клеток икс равен 1 и растёт с каждой клеткой', () => {
    expect(multiplier(3, 0)).toBe(1)
    for (let k = 1; k < N - 3; k++) expect(multiplier(3, k + 1)).toBeGreaterThan(multiplier(3, k))
  })
  it('известные значения', () => {
    expect(multiplier(1, 1)).toBe(1.01)
    expect(multiplier(3, 1)).toBe(1.1)
  })
  it('возврат для любой стратегии «забрать на k-м шаге» 95–97%', () => {
    for (const m of [1, 3, 5, 10]) for (const k of [1, 2, 4]) {
      let surv = 1
      for (let i = 0; i < k; i++) surv *= (N - m - i) / (N - i)
      expect(surv * multiplier(m, k)).toBeGreaterThan(0.95)
      expect(surv * multiplier(m, k)).toBeLessThanOrEqual(0.97)
    }
  })
})
