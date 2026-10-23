import { describe, it, expect } from 'vitest'
import { mult, flightSeconds, genPoint, rtpAt, roundEndMs, BETTING_SECONDS, CRASH_PAUSE } from './crashLogic'

describe('хряк-крэш (общий движок)', () => {
  it('мультипликатор растёт от 1.00', () => {
    expect(mult(0)).toBe(1)
    expect(mult(10)).toBeGreaterThan(2)
    expect(mult(60)).toBeGreaterThan(10)
  })
  it('время полёта — обратная функция мультипликатора', () => {
    for (const t of [0.5, 3, 10, 30, 60]) {
      expect(flightSeconds(mult(t))).toBeCloseTo(t, 2)
    }
  })
  it('конец раунда = старт + приём + полёт + пауза', () => {
    const end = roundEndMs(1000, 2.0)
    expect(end - 1000).toBeCloseTo((BETTING_SECONDS + flightSeconds(2.0) + CRASH_PAUSE) * 1000, 5)
  })
  it('точка краша: 3% мгновенных, диапазон [1.0, 25]', () => {
    let instant = 0
    for (let i = 0; i < 20000; i++) {
      const p = genPoint()
      expect(p).toBeGreaterThanOrEqual(1.0)
      expect(p).toBeLessThanOrEqual(25.0)
      if (p === 1.0) instant++
    }
    expect(instant / 20000).toBeGreaterThan(0.02)
    expect(instant / 20000).toBeLessThan(0.04)
  })
  it('теоретический возврат 97% на любом фиксированном выводе', () => {
    for (const c of [1.05, 1.5, 2, 5, 10, 25]) {
      expect(rtpAt(c)).toBeCloseTo(0.97, 6)
    }
  })
})
