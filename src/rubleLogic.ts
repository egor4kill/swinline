// «Курс рубля»: бинарные опционы — угадай, вырастет курс за 30 тиков или упадёт.
// Формулы зеркалят SQL-функцию ruble_predict (секция 13 в scripts/supabase_security_setup.sql).
export const TICKS = 30
export const START = 100
export const VOL = 0.012
export const PAYOUT = 1.95
export type Side = 'up' | 'down'
export const r2 = (x: number) => Math.round(x * 100) / 100

/** Один тик: цена меняется на случайный процент из [-VOL; +VOL]. Зеркало SQL: p * (1 + (random()*2-1)*VOL). */
export function nextPrice(p: number, rng: () => number = Math.random) {
  return p * (1 + (rng() * 2 - 1) * VOL)
}

/** Путь курса: START + TICKS цен. */
export function genPath(rng: () => number = Math.random) {
  const path = [START]
  let p = START
  for (let i = 0; i < TICKS; i++) { p = nextPrice(p, rng); path.push(r2(p)) }
  return path
}

/** Итоговое направление. Ровно (final === start) — в пользу заведения. */
export function dirOf(final: number): Side | 'flat' {
  if (final > START) return 'up'
  if (final < START) return 'down'
  return 'flat'
}

export function winOf(side: Side, final: number) {
  return dirOf(final) === side
}
