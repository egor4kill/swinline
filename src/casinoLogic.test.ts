import { describe, it, expect } from 'vitest'
import { JACKPOT_SEED, JACKPOT_CONTRIB, JACKPOT_ODDS, LEVELS, vipLevel, vipName, cashbackPct, nextLevelGap } from './casinoLogic'

describe('настоящее казино (джекпот, VIP, кэшбэк)', () => {
  it('VIP-уровни по обороту: границы включительно', () => {
    expect(vipLevel(0)).toBe(0)
    expect(vipLevel(49999)).toBe(0)
    expect(vipLevel(50000)).toBe(1)
    expect(vipLevel(249999)).toBe(1)
    expect(vipLevel(250000)).toBe(2)
    expect(vipLevel(1000000)).toBe(3)
    expect(vipLevel(9999999)).toBe(4)
    expect(vipName(6000000)).toBe('Свиновладыка')
  })

  it('кэшбэк: 3% + уровень, зажат в диапазоне уровней', () => {
    expect(cashbackPct(0)).toBe(3)
    expect(cashbackPct(2)).toBe(5)
    expect(cashbackPct(4)).toBe(7)
    expect(cashbackPct(-5)).toBe(3)
    expect(cashbackPct(99)).toBe(7)
  })

  it('прогресс до следующего уровня', () => {
    expect(nextLevelGap(0)).toBe(50000)
    expect(nextLevelGap(40000)).toBe(10000)
    expect(nextLevelGap(6000000)).toBeNull()
  })

  it('экономика джекпота: вклад 1%, шанс 1/3000, уровней ровно 5', () => {
    expect(JACKPOT_CONTRIB).toBe(0.01)
    expect(JACKPOT_ODDS).toBeCloseTo(0.000333, 6)
    expect(JACKPOT_SEED).toBe(50000)
    expect(LEVELS).toHaveLength(5)
    // средний взнос со ставки 100 = 1 SV₽; ожидаемая частота срыва ~ 1/3000 ставок
    expect(100 * JACKPOT_CONTRIB).toBe(1)
  })
})
