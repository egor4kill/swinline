// «Пяточок-Плинко»: чистая логика. Результат решается сразу, анимация только показывает путь.
export const ROWS = 12
export type Risk = 'low' | 'mid' | 'high'
const mirror = (e: number[], c: number) => [...e, c, ...[...e].reverse()]
export const TABLES: Record<Risk, number[]> = {
  low: mirror([6.6, 3.3, 1.9, 1.3, 1.1, 1], 0.5),
  mid: mirror([21, 6.5, 2.8, 1.4, 1, 0.8], 0.5),
  high: mirror([65, 15, 4.2, 1.9, 0.9, 0.6], 0.3),
}
export const RISKS: { id: Risk; label: string }[] = [
  { id: 'low', label: 'Тихое корыто' },
  { id: 'mid', label: 'Грязь' },
  { id: 'high', label: 'Бешеный хряк' },
]
export const r2 = (x: number) => Math.round(x * 100) / 100

/** Один бросок: на каждом колышке влево (0) или вправо (1) с шансом 50/50. */
export function drop(rng: () => number = Math.random) {
  const bits: number[] = []
  let slot = 0
  for (let i = 0; i < ROWS; i++) {
    const b = rng() < 0.5 ? 0 : 1
    bits.push(b)
    slot += b
  }
  return { bits, slot }
}
export const payout = (stake: number, risk: Risk, slot: number) => r2(stake * TABLES[risk][slot])

/** Теоретический возврат таблицы (для тестов). */
export function rtp(risk: Risk) {
  let c = 1, total = 0
  const t = TABLES[risk]
  for (let k = 0; k <= ROWS; k++) {
    if (k > 0) c = (c * (ROWS - k + 1)) / k
    total += (c / 2 ** ROWS) * t[k]
  }
  return total
}
