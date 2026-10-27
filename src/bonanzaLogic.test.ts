import { describe, it, expect } from 'vitest'
import { simulateBonanza } from './bonanzaLogic'

describe('бонанза (megaways, каскады, gold-фриспины)', () => {
  it('одинаковый исход при одном seed', () => {
    const a = simulateBonanza(12345)
    const b = simulateBonanza(12345)
    expect(a.total).toBe(b.total)
    expect(a.megaways).toBe(b.megaways)
  })

  it('сетка корректна: высоты 2..7, символы валидны', () => {
    for (const o of [simulateBonanza(7), simulateBonanza(12345), simulateBonanza(999999)]) {
      expect(o.heights.length).toBe(6)
      for (const h of o.heights) {
        expect(h).toBeGreaterThanOrEqual(2)
        expect(h).toBeLessThanOrEqual(7)
      }
      for (const st of [...o.base.steps, ...o.free.steps]) {
        for (const v of st.grid) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(14)
        }
      }
    }
  })

  it('фриспины: 4 буквы запускают 10 спинов, множитель не сбрасывается', () => {
    let found: ReturnType<typeof simulateBonanza> | null = null
    for (let s = 1; s < 50000 && !found; s++) {
      const o = simulateBonanza(s)
      if (o.free.triggered) found = o
    }
    expect(found).not.toBeNull()
    expect(found!.free.count).toBeGreaterThanOrEqual(10)
    const mults = found!.free.steps.map(st => st.mult)
    for (let i = 1; i < mults.length; i++) {
      expect(mults[i]).toBeGreaterThanOrEqual(mults[i - 1])
    }
  })

  it('RTP ~97% (Monte Carlo, 20k спинов; unit = ставка/20)', () => {
    const N = 20000
    let sum = 0
    let triggers = 0
    for (let s = 1; s <= N; s++) {
      const o = simulateBonanza(s)
      sum += o.total
      if (o.free.triggered) triggers++
    }
    const rtp = sum / N / 20 // total в юнитах (unit = ставка/20)
    const freq = triggers / N
    console.log(`bonanza MC: rtp=${(rtp * 100).toFixed(2)}% trigger=${(freq * 100).toFixed(3)}%`)
    // тяжёлый хвост бонусов: на коротких выборках RTP гуляет, ловим только грубые поломки
    expect(rtp).toBeGreaterThan(0.70)
    expect(rtp).toBeLessThan(1.15)
    expect(freq).toBeGreaterThan(0)
    expect(freq).toBeLessThan(0.02)
  })
})
