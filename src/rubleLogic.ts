// «Курс рубля»: общая биржевая лента. Цена живёт в БД (ruble_prices, тик = 1 секунда),
// одинакова у всех, идёт всегда и не сбрасывается при перезаходе.
// Исход ставки: цена через TICK_SECONDS секунд после ставки против цены на её момент.
// Формула шага ленты — зеркало SQL (ruble_ensure, секция 13 в scripts/supabase_security_setup.sql).
export const TICK_SECONDS = 30
export const START = 100
export const TAPE_VOL = 0.004
export const TAPE_PULL = 0.02
export const PAYOUT = 1.95
export type Side = 'up' | 'down'
export const r2 = (x: number) => Math.round(x * 100) / 100

/** Один тик ленты (1 секунда): шум ±TAPE_VOL плюс мягкий возврат к базовым 100. */
export function tapeStep(p: number, rng: () => number = Math.random) {
  return r2(p * (1 + (rng() * 2 - 1) * TAPE_VOL) + (100 - p) * TAPE_PULL)
}

/** Итоговое направление раунда. Ровно (final === start) — в пользу заведения. */
export function dirOf(start: number, final: number): Side | 'flat' {
  if (final > start) return 'up'
  if (final < start) return 'down'
  return 'flat'
}

export function winOf(side: Side, start: number, final: number) {
  return dirOf(start, final) === side
}
