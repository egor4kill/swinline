import { describe, it, expect } from 'vitest'
import { TICKS, START, VOL, PAYOUT, genPath, dirOf, winOf, ambientStep, r2, type Side } from './rubleLogic'

// детерминированный ГПСЧ для повторяемости тестов
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('курс рубля (бинарные опционы)', () => {
  it('путь: START + ровно TICKS цен, всё в пределах волатильности', () => {
    const p = genPath(mulberry32(1))
    expect(p).toHaveLength(TICKS + 1)
    expect(p[0]).toBe(START)
    for (let i = 1; i < p.length; i++) {
      const step = p[i] / p[i - 1]
      expect(step).toBeGreaterThanOrEqual(1 - VOL)
      expect(step).toBeLessThanOrEqual(1 + VOL)
    }
  })

  it('путь детерминирован при одном seed', () => {
    expect(genPath(mulberry32(7))).toEqual(genPath(mulberry32(7)))
  })

  it('направление: выше старта — up, ниже — down, ровно — flat', () => {
    expect(dirOf(100.01)).toBe('up')
    expect(dirOf(99.99)).toBe('down')
    expect(dirOf(100)).toBe('flat')
  })

  it('winOf: верное угадывание платит, flat всегда проигрыш', () => {
    expect(winOf('up', 101)).toBe(true)
    expect(winOf('up', 99)).toBe(false)
    expect(winOf('down', 99)).toBe(true)
    expect(winOf('up', 100)).toBe(false)
    expect(winOf('down', 100)).toBe(false)
  })

  it('экономика: шанс угадать ~50% (по 20000 раундов), RTP = 0.5 × PAYOUT = 97.5%', () => {
    const N = 20000
    let up = 0, down = 0, flat = 0
    let returned = 0
    const rng = mulberry32(42)
    for (let i = 0; i < N; i++) {
      const path = genPath(rng)
      const final = path[path.length - 1]
      const d = dirOf(final)
      if (d === 'up') up++; else if (d === 'down') down++; else flat++
      const side: Side = i % 2 === 0 ? 'up' : 'down'
      if (winOf(side, final)) returned += PAYOUT
    }
    expect(flat / N).toBeLessThan(0.02) // «ровно» почти не случается
    const upRate = up / (up + down)
    expect(Math.abs(upRate - 0.5)).toBeLessThan(0.02)
    const rtp = returned / N
    expect(rtp).toBeGreaterThan(0.9)
    expect(rtp).toBeLessThan(1.05)
    expect(PAYOUT).toBeCloseTo(0.975 * 2, 4) // честная пара: p=0.5, выплата 1.95
    expect(r2(1.005)).toBe(1) // проверка округления
  })

  it('фоновый биржевой ход: мелкие шаги, не убегает от 100 (500 шагов)', () => {
    const rng = mulberry32(99)
    let p = 100
    for (let i = 0; i < 500; i++) {
      const prev = p
      p = ambientStep(p, rng)
      expect(Math.abs(p - prev)).toBeLessThan(2) // шаг мелкий — график плавный
      expect(Math.abs(p - 100)).toBeLessThan(6)  // возврат к базовым 100
    }
  })
})
