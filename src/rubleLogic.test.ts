import { describe, it, expect } from 'vitest'
import { TICK_SECONDS, START, TAPE_VOL, TAPE_PULL, PAYOUT, tapeStep, dirOf, winOf, r2, type Side } from './rubleLogic'

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

describe('курс рубля (общая биржевая лента)', () => {
  it('шаг ленты: мелкие шаги, не убегает от 100 (500 тиков)', () => {
    const rng = mulberry32(7)
    let p = 100
    for (let i = 0; i < 500; i++) {
      const prev = p
      p = tapeStep(p, rng)
      expect(Math.abs(p - prev)).toBeLessThan(1)   // тик = 1 секунда, шаг обязан быть мелким
      expect(Math.abs(p - 100)).toBeLessThan(6)    // возврат к базовым 100
      expect(Math.abs(p - prev)).toBeLessThanOrEqual(prev * TAPE_VOL + Math.abs(100 - prev) * TAPE_PULL + 0.011)
    }
  })

  it('шаг ленты детерминирован при одном seed', () => {
    expect(tapeStep(100, mulberry32(3))).toBe(tapeStep(100, mulberry32(3)))
  })

  it('направление раунда: выше старта — up, ниже — down, ровно — flat', () => {
    expect(dirOf(100, 100.5)).toBe('up')
    expect(dirOf(103, 101)).toBe('down')
    expect(dirOf(99.5, 99.5)).toBe('flat')
  })

  it('winOf: верное угадывание платит, flat всегда проигрыш', () => {
    expect(winOf('up', 100, 101)).toBe(true)
    expect(winOf('up', 100, 99)).toBe(false)
    expect(winOf('down', 103, 101)).toBe(true)
    expect(winOf('up', 100, 100)).toBe(false)
    expect(winOf('down', 100, 100)).toBe(false)
  })

  it('экономика: направление за 30 тиков ~50/50 (10000 раундов), RTP = 0.5 × PAYOUT', () => {
    const N = 10000
    const rng = mulberry32(42)
    let up = 0, down = 0, flat = 0, returned = 0
    for (let i = 0; i < N; i++) {
      let p = 90 + rng() * 20
      const start = p
      for (let s = 0; s < TICK_SECONDS; s++) p = tapeStep(p, rng)
      const d = dirOf(start, p)
      if (d === 'up') up++; else if (d === 'down') down++; else flat++
      const side: Side = i % 2 === 0 ? 'up' : 'down'
      if (winOf(side, start, p)) returned += PAYOUT
    }
    expect(flat / N).toBeLessThan(0.05)
    const upRate = up / (up + down)
    expect(Math.abs(upRate - 0.5)).toBeLessThan(0.03)
    const rtp = returned / N
    expect(rtp).toBeGreaterThan(0.9)
    expect(rtp).toBeLessThan(1.05)
    expect(PAYOUT).toBeCloseTo(0.975 * 2, 4)
    expect(r2(1.005)).toBe(1)
    expect(START).toBe(100)
  })
})
