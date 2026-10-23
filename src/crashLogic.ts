// «Хряк-Крэш»: общий движок. Раунды живут в базе (crash_rounds), точка краша
// скрыта в crash_secrets до момента краша — клиент узнаёт её только когда раунд упал.
// Формулы здесь — зеркало SQL-функций crash_mult / crash_flight_seconds.

export const BETTING_SECONDS = 6
export const CRASH_PAUSE = 3.2
export const MIN_CRASH = 1.01
export const MAX_CRASH = 25.0

/** Мультипликатор через t секунд полёта (то же выражение, что в SQL crash_mult). */
export const mult = (t: number) => 1.0 + 0.06 * t + 0.022 * Math.pow(t, 1.8)

/** Сколько секунд летит ракета до точки краша (двоичный поиск, как в SQL). */
export function flightSeconds(point: number) {
  let lo = 0, hi = 300
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (mult(mid) >= point) hi = mid
    else lo = mid
  }
  return hi
}

/** Момент конца раунда (мс): старт + приём ставок + полёт + пауза. */
export const roundEndMs = (startAtMs: number, crashPoint: number) =>
  startAtMs + (BETTING_SECONDS + flightSeconds(crashPoint) + CRASH_PAUSE) * 1000

/** Генерация точки краша (для тестов; в бою её генерирует сервер). */
export function genPoint(rng: () => number = Math.random) {
  const r = rng()
  if (r < 0.03) return 1.0
  return Math.round(Math.min(MAX_CRASH, Math.max(MIN_CRASH, 0.96 / (1 - r * 0.96))) * 100) / 100
}

/** Теоретический возврат при выводе на фиксированном x (для теста честности). */
export const rtpAt = (c: number) => {
  // P(точка >= c) = 0.97 / c при c в [1.01, 25] → EV = c * 0.97/c = 0.97
  if (c < MIN_CRASH || c > MAX_CRASH) throw new Error('c вне диапазона')
  return (c * (0.97 / c))
}
