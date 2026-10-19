// «Грязевые лужи»: поле 5×5, часть клеток — лужи. Чем больше безопасных клеток открыл, тем выше икс.
export const N = 25
export const RTP = 0.97
export const r2 = (x: number) => Math.round(x * 100) / 100

/** Икс после k безопасных клеток при m лужах. Честная вероятность × RTP, округление вниз. */
export function multiplier(mines: number, k: number) {
  if (k <= 0) return 1
  let p = 1
  for (let i = 0; i < k; i++) p *= (N - i) / (N - mines - i)
  return Math.floor(p * RTP * 100) / 100
}

/** Раскладка луж на раунд: true = лужа. */
export function newRound(mines: number, rng: () => number = Math.random) {
  const cells = Array.from({ length: N }, (_, i) => i)
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  const field = new Array<boolean>(N).fill(false)
  cells.slice(0, mines).forEach(i => { field[i] = true })
  return field
}
