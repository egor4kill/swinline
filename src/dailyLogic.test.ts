import { describe, it, expect } from 'vitest'
import { EMPTY, REWARDS, claim, status, prevDay } from './dailyLogic'

describe('ежедневные награды', () => {
  it('первая награда за первый день', () => {
    const r = claim(EMPTY, '2026-10-20')!
    expect(r.reward).toBe(REWARDS[0])
    expect(r.state).toEqual({ streak: 1, last: '2026-10-20' })
  })
  it('второй раз за день не выдаётся', () => {
    const s = claim(EMPTY, '2026-10-20')!.state
    expect(claim(s, '2026-10-20')).toBeNull()
    expect(status(s, '2026-10-20').canClaim).toBe(false)
  })
  it('на следующий день серия растёт и награда больше', () => {
    const s = claim(EMPTY, '2026-10-20')!.state
    const r = claim(s, '2026-10-21')!
    expect(r.state.streak).toBe(2)
    expect(r.reward).toBe(REWARDS[1])
  })
  it('пропуск дня сбрасывает серию', () => {
    const s = claim(EMPTY, '2026-10-20')!.state
    expect(status(s, '2026-10-22').broken).toBe(true)
    const r = claim(s, '2026-10-22')!
    expect(r.state.streak).toBe(1)
    expect(r.reward).toBe(REWARDS[0])
  })
  it('седьмой день даёт максимум, на восьмой цикл начинается заново', () => {
    let s = EMPTY, day = '2026-10-01'
    for (let i = 0; i < 7; i++) { const r = claim(s, day)!; s = r.state; if (i === 6) expect(r.reward).toBe(REWARDS[6]); day = nextOf(day) }
    const r8 = claim(s, day)!
    expect(r8.reward).toBe(REWARDS[0])
    expect(r8.state.streak).toBe(8)
  })
  it('граница месяцев', () => { expect(prevDay('2026-11-01')).toBe('2026-10-31') })
})
function nextOf(k: string) { const [y, m, d] = k.split('-').map(Number); const n = new Date(y, m - 1, d + 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }
