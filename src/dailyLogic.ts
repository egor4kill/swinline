// Ежедневные награды: серия из 7 дней, потом цикл повторяется. Логика отдельно от интерфейса.
export const REWARDS = [500, 600, 800, 1000, 1300, 1700, 3000]
export type DailyState = { streak: number; last: string | null }
export const EMPTY: DailyState = { streak: 0, last: null }

const pad = (n: number) => String(n).padStart(2, '0')
/** Календарный день по местному времени игрока: «2026-10-20». */
export const dayKey = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export function prevDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 1))
}
/** Сколько миллисекунд осталось до следующей полуночи. */
export function msToMidnight(now: Date = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
}

export function status(s: DailyState, today: string) {
  const claimedToday = s.last === today
  const continues = !!s.last && (claimedToday || s.last === prevDay(today))
  const streakNext = continues ? s.streak + 1 : 1 // какой по счёту день серии станет следующим
  const pos = (streakNext - 1) % REWARDS.length
  const done = claimedToday ? ((s.streak - 1) % REWARDS.length) + 1 : (streakNext - 1) % REWARDS.length
  return { canClaim: !claimedToday, claimedToday, streakNext, pos, done, reward: REWARDS[pos], broken: !claimedToday && s.streak > 0 && !continues }
}

/** Забрать награду. Вернёт null, если сегодня уже забирали. */
export function claim(s: DailyState, today: string) {
  const st = status(s, today)
  if (!st.canClaim) return null
  return { state: { streak: st.streakNext, last: today } as DailyState, reward: st.reward }
}
