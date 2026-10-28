import { describe, it, expect } from 'vitest'
import { simulateOlympus, CELLS, COLS, ROWS, ORB_ID } from './olympusLogic'

describe('олимп (6×5, каскады, шары, фриспины)', () => {
  it('детерминирован при одном seed', () => {
    const a = simulateOlympus(12345)
    const b = simulateOlympus(12345)
    expect(a.total).toBe(b.total)
    expect(a.base.win).toBe(b.base.win)
    expect(a.free.triggered).toBe(b.free.triggered)
  })

  it('поле 6×5 и корректные символы', () => {
    const o = simulateOlympus(899)
    const frames = [...o.base.steps, ...o.free.steps]
    expect(frames.length).toBeGreaterThan(0)
    for (const f of frames) {
      expect(f.grid.length).toBe(CELLS)
      for (const c of f.grid) {
        expect(c.s).toBeGreaterThanOrEqual(1)
        expect(c.s).toBeLessThanOrEqual(11)
        if (c.s === ORB_ID) expect(c.m).toBeGreaterThanOrEqual(2)
        else expect(c.m).toBe(0)
      }
      expect(COLS * ROWS).toBe(30)
    }
  })

  it('seed 899 запускает бонус, база и фриспины не пустые', () => {
    const o = simulateOlympus(899)
    expect(o.free.triggered).toBe(true)
    expect(o.free.count).toBeGreaterThanOrEqual(15)
    expect(o.free.steps.length).toBeGreaterThan(0)
    expect(o.base.steps.length).toBeGreaterThan(0)
    expect(o.total).toBeGreaterThan(o.base.win)
  })

  it('покупка бонуса: сразу фриспины без базовых кадров', () => {
    const o = simulateOlympus(1003, true)
    expect(o.buy).toBe(true)
    expect(o.free.triggered).toBe(true)
    expect(o.free.count).toBeGreaterThanOrEqual(15)
    expect(o.base.steps.length).toBe(0)
    expect(o.base.win).toBe(0)
    expect(o.total).toBeGreaterThan(0)
  })

  it('лимит 15000× не превышается', () => {
    let max = 0
    for (let s = 1; s <= 3000; s++) {
      max = Math.max(max, simulateOlympus(s, true).total)
    }
    expect(max).toBeLessThanOrEqual(15000)
  })
})
