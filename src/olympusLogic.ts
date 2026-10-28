// «Олимп»: 6×5, выплаты за 8+ одинаковых символов, каскады,
// шары-множители и фриспины с накопительным множителем.
// Механика повторяет жанр Gates of Olympus, математика своя.
// Зеркало SQL (раздел 25) — тот же mulberry32 и тот же порядок вызовов.

export const COLS = 6
export const ROWS = 5
export const CELLS = COLS * ROWS
export const FREE_SPINS = 15
export const RETRIGGER = 5
export const MAX_WIN = 15000
export const BONUS_COST = 100
export const PAY_SCALE = 1.05

export type SymbolDef = { id: number; name: string; weight: number; pays?: [number, number, number] }

// индексы в массиве = порядок вызовов weighted() (важен для паритета)
export const SYMBOLS: SymbolDef[] = [
  { id: 1, name: 'crown', weight: 4, pays: [10, 25, 50] },
  { id: 2, name: 'hourglass', weight: 5, pays: [2.5, 10, 25] },
  { id: 3, name: 'ring', weight: 7, pays: [2, 5, 15] },
  { id: 4, name: 'cup', weight: 8, pays: [1.5, 2, 12] },
  { id: 5, name: 'red', weight: 10, pays: [1, 1.5, 10] },
  { id: 6, name: 'purple', weight: 12, pays: [0.8, 1.2, 8] },
  { id: 7, name: 'yellow', weight: 14, pays: [0.5, 1, 5] },
  { id: 8, name: 'green', weight: 16, pays: [0.4, 0.9, 4] },
  { id: 9, name: 'blue', weight: 18, pays: [0.25, 0.75, 2] },
  { id: 10, name: 'scatter', weight: 1.1 },
  { id: 11, name: 'orb', weight: 0.8 }
]
export const SCATTER_ID = 10
export const ORB_ID = 11
export const FREE_ORB_WEIGHT = 5

export const ORB_VALUES: Array<[number, number]> = [
  [2, 40], [3, 24], [4, 14], [5, 10], [6, 5], [8, 3], [10, 2], [15, 1],
  [20, 0.5], [25, 0.25], [50, 0.12], [100, 0.05], [250, 0.02], [500, 0.008], [1000, 0.002]
]

export type Cell = { s: number; m: number }
export type Win = { s: number; count: number; amount: number; indices: number[] }
export type Frame = {
  grid: Cell[]
  wins: Win[]
  phase: 'base' | 'free'
  spin: number
  mult: number
  orbSum: number
  scatterCount: number
}
export type SpinResolve = {
  frames: Frame[]
  base: number
  scatterWin: number
  orbSum: number
  multiplier: number
  nextMultiplier: number
  scatterCount: number
  awarded: number
  rawWin: number
}
export type OlympusRun = {
  seed: number
  buy: boolean
  base: { steps: Frame[]; win: number }
  free: { triggered: boolean; count: number; steps: Frame[]; total: number }
  total: number
  capped: boolean
}

export function mulberry32(seed: number) {
  let x = seed >>> 0
  return () => {
    x = (x + 0x6d2b79f5) >>> 0
    let t = Math.imul(x ^ (x >>> 15), 1 | x)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weighted<T extends { weight: number }>(items: T[], rnd: () => number, weightFn: (x: T) => number): T {
  const total = items.reduce((s, x) => s + weightFn(x), 0)
  let n = rnd() * total
  for (const x of items) {
    n -= weightFn(x)
    if (n < 0) return x
  }
  return items[items.length - 1]
}

function makeCell(rnd: () => number, isFree: boolean): Cell {
  const sym = weighted(SYMBOLS, rnd, x => (isFree && x.id === ORB_ID ? FREE_ORB_WEIGHT : x.weight))
  if (sym.id === ORB_ID) {
    const orb = weighted(ORB_VALUES.map(([v, w]) => ({ v, weight: w })), rnd, x => x.weight)
    return { s: ORB_ID, m: orb.v }
  }
  return { s: sym.id, m: 0 }
}

function newBoard(rnd: () => number, isFree: boolean): Cell[] {
  return Array.from({ length: CELLS }, () => makeCell(rnd, isFree))
}

function evaluate(board: Cell[], bet: number): Win[] {
  const wins: Win[] = []
  for (const sym of SYMBOLS) {
    if (!sym.pays) continue
    const indices: number[] = []
    board.forEach((c, i) => { if (c.s === sym.id) indices.push(i) })
    if (indices.length >= 8) {
      const tier = indices.length >= 12 ? 2 : indices.length >= 10 ? 1 : 0
      const amount = Math.round(bet * sym.pays[tier] * PAY_SCALE * 100) / 100
      wins.push({ s: sym.id, count: indices.length, amount, indices })
    }
  }
  return wins
}

function collapse(board: Cell[], indices: number[], rnd: () => number, isFree: boolean): Cell[] {
  const gone = new Set(indices)
  const next: Cell[] = new Array(CELLS)
  for (let col = 0; col < COLS; col++) {
    const keep: Cell[] = []
    for (let row = 0; row < ROWS; row++) {
      const i = row * COLS + col
      if (!gone.has(i)) keep.push({ ...board[i] })
    }
    const fresh = Array.from({ length: ROWS - keep.length }, () => makeCell(rnd, isFree))
    const merged = [...fresh, ...keep]
    for (let row = 0; row < ROWS; row++) next[row * COLS + col] = merged[row]
  }
  return next
}

function resolveSpin(
  rnd: () => number,
  bet: number,
  bonusMultiplier: number,
  isFree: boolean,
  phase: 'base' | 'free',
  spin: number,
  initial: Cell[] | null = null
): SpinResolve {
  let board = initial ? initial.map(c => ({ ...c })) : newBoard(rnd, isFree)
  const frames: Frame[] = []
  let base = 0

  for (let n = 0; n < 200; n++) {
    const wins = evaluate(board, bet)
    // предварительная разметка: multiplier/orb-данные считаем после серии,
    // но для кадров нужен и текущий набор шаров — считаем сейчас
    const orbSumNow = board.reduce((s, c) => s + c.m, 0)
    const scatterCountNow = board.filter(c => c.s === SCATTER_ID).length
    frames.push({
      grid: board.map(c => ({ ...c })), wins,
      phase, spin, mult: 1, orbSum: orbSumNow, scatterCount: scatterCountNow
    })
    if (!wins.length) break
    base += wins.reduce((s, w) => s + w.amount, 0)
    board = collapse(board, wins.flatMap(w => w.indices), rnd, isFree)
  }

  const scatterCount = board.filter(c => c.s === SCATTER_ID).length
  const orbSum = board.reduce((s, c) => s + c.m, 0)
  let nextMultiplier = bonusMultiplier
  if (isFree && base > 0 && orbSum > 0) nextMultiplier += orbSum
  const multiplier = base > 0 && orbSum > 0 ? (isFree ? nextMultiplier : orbSum) : 1
  const scatterWin = !isFree && scatterCount >= 4
    ? Math.round(bet * (scatterCount >= 6 ? 100 : scatterCount === 5 ? 5 : 3) * 100) / 100
    : 0
  const awarded = isFree ? (scatterCount >= 3 ? RETRIGGER : 0) : (scatterCount >= 4 ? FREE_SPINS : 0)
  const rawWin = Math.round((base * multiplier + scatterWin) * 100) / 100

  // проставляем финальный множитель во все кадры серии для отображения
  for (const f of frames) f.mult = multiplier

  return { frames, base, scatterWin, orbSum, multiplier, nextMultiplier, scatterCount, awarded, rawWin }
}

export function simulateOlympus(seed: number, buy = false): OlympusRun {
  const rnd = mulberry32(seed >>> 0)
  let baseWin = 0
  let baseSteps: Frame[] = []
  let freeTriggered = false
  let freeCount = 0
  const freeSteps: Frame[] = []
  let freeTotal = 0
  let capped = false

  if (!buy) {
    const r = resolveSpin(rnd, 1, 0, false, 'base', 0)
    baseSteps = r.frames
    baseWin = r.rawWin
    if (r.awarded >= FREE_SPINS) freeTriggered = true
  } else {
    freeTriggered = true
  }

  if (freeTriggered) {
    let spins = FREE_SPINS
    let persistent = 0
    while (freeCount < spins) {
      freeCount++
      const r = resolveSpin(rnd, 1, persistent, true, 'free', freeCount)
      persistent = r.nextMultiplier
      const remaining = MAX_WIN - baseWin - freeTotal
      const add = Math.min(r.rawWin, Math.max(0, remaining))
      freeTotal += add
      freeSteps.push(...r.frames)
      if (r.awarded > 0) spins += RETRIGGER
      if (baseWin + freeTotal >= MAX_WIN) { capped = true; break }
    }
  }

  const total = Math.round(Math.min(MAX_WIN, baseWin + freeTotal) * 100) / 100
  return {
    seed: seed >>> 0,
    buy,
    base: { steps: baseSteps, win: Math.round(baseWin * 100) / 100 },
    free: { triggered: freeTriggered, count: freeCount, steps: freeSteps, total: Math.round(freeTotal * 100) / 100 },
    total,
    capped
  }
}
