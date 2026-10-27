// «Бонанза»: 6 барабанов Megaways (2–7 рядов), каскады, GOLD-фриспины
// с безлимитным множителем. Зеркало SQL (раздел 23) — одинаковый mulberry32
// и одинаковый порядок вызовов: при одном seed SQL и TS дают один исход.

export const REELS = 6
export const MAX_ROWS = 7
export const LETTER_CHANCE = 0.03
export const PAY_SCALE = 0.97
export const FREE_SPINS = 10
export const FREE_RETRIGGER = 5
export const FREE_CAP = 50
export const BONUS_WIN_CAP = 2000 * 20 // в юнитах (unit = ставка/20): лимит выигрыша бонуса 2000× ставки
export const UNIT_DIV = 20

// символы 1..10; буквы G,O,L,D = 11..14 (только барабаны 2..5, 0-based 1..4)
export const WEIGHTS: Array<[number, number]> = [
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 12], [6, 11], [7, 10], [8, 9], [9, 8], [10, 7]
]
export const WEIGHT_TOTAL = WEIGHTS.reduce((a, w) => a + w[1], 0) // 55
const HEIGHT_WEIGHTS = [2, 3, 4, 4, 3, 2] // высота 2..7 (6 значений!)

// выплаты за «путь» в единицах ставки/20, k=3..6 подряд идущих барабанов
export const PAYS: Record<number, number[]> = {
  1: [2, 5, 25, 50],
  2: [1.5, 2, 10, 25],
  3: [1, 1.5, 5, 15],
  4: [0.5, 1, 2, 10],
  5: [0.2, 0.4, 1, 1.5],
  6: [0.2, 0.4, 1, 1.5],
  7: [0.25, 0.5, 1.2, 2],
  8: [0.3, 0.6, 1.4, 2.5],
  9: [0.35, 0.7, 1.6, 3],
  10: [0.4, 0.8, 1.8, 3.5]
}

export type WinInfo = { s: number; k: number; ways: number; win: number }
export type Seg = WinInfo & { startReel: number }
export type Step = { grid: number[]; wins: WinInfo[]; win: number; mult: number }
export type FreeSpinStep = Step & { spin: number }
export type BonanzaOutcome = {
  seed: number
  heights: number[]
  megaways: number
  base: { steps: Step[]; win: number }
  letters: number
  free: { triggered: boolean; count: number; steps: FreeSpinStep[]; total: number }
  total: number
}

export function mulberry32(seed: number) {
  let x = seed >>> 0
  return () => {
    x = (x + 0x6d2b79f5) >>> 0
    let t = Math.imul(x ^ (x >>> 15), 1 | x) >>> 0
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted(rnd: () => number): number {
  let roll = rnd() * WEIGHT_TOTAL
  for (const [sym, w] of WEIGHTS) {
    roll -= w
    if (roll < 0) return sym
  }
  return WEIGHTS[WEIGHTS.length - 1][0]
}

function pickHeight(rnd: () => number): number {
  let roll = rnd() * HEIGHT_WEIGHTS.reduce((a, b) => a + b, 0)
  for (let i = 0; i < HEIGHT_WEIGHTS.length; i++) {
    roll -= HEIGHT_WEIGHTS[i]
    if (roll < 0) return i + 2
  }
  return 7
}

const isLetterCell = (r: number, rnd: () => number) => r >= 1 && r <= 4 && rnd() < LETTER_CHANCE

// grid[reel * MAX_ROWS + row], row 0 — верх; 0 — пустая клетка над стопкой
function fillGrid(rnd: () => number, heights: number[]): number[] {
  const grid = new Array(REELS * MAX_ROWS).fill(0)
  for (let r = 0; r < REELS; r++) {
    for (let row = MAX_ROWS - heights[r]; row < MAX_ROWS; row++) {
      grid[r * MAX_ROWS + row] = isLetterCell(r, rnd) ? 10 + r : pickWeighted(rnd)
    }
  }
  return grid
}

function findWins(grid: number[], unit: number): Seg[] {
  const wins: Seg[] = []
  for (let s = 1; s <= 10; s++) {
    let run = 0
    let ways = 1
    let start = 0
    for (let r = 0; r <= REELS; r++) {
      let cnt = 0
      if (r < REELS) {
        for (let row = 0; row < MAX_ROWS; row++) {
          if (grid[r * MAX_ROWS + row] === s) cnt++
        }
      }
      if (r < REELS && cnt > 0) {
        if (run === 0) start = r
        run++
        ways *= cnt
      } else {
        if (run >= 3) {
          const k = Math.min(run, 6)
          wins.push({ s, k, ways, startReel: start, win: PAYS[s][k - 3] * PAY_SCALE * unit * ways })
        }
        run = 0
        ways = 1
      }
    }
  }
  return wins
}

function cascade(grid: number[], heights: number[], wins: Seg[], rnd: () => number): number[] {
  const marked = new Set<number>()
  for (const w of wins) {
    for (let r = 0; r < w.k; r++) {
      for (let row = 0; row < MAX_ROWS; row++) {
        const i = (w.startReel + r) * MAX_ROWS + row
        if (grid[i] === w.s) marked.add(i)
      }
    }
  }
  const next = grid.slice()
  for (let r = 0; r < REELS; r++) {
    const col: number[] = []
    for (let row = 0; row < MAX_ROWS; row++) {
      const i = r * MAX_ROWS + row
      if (next[i] !== 0 && !marked.has(i)) col.push(next[i])
    }
    const empties = heights[r] - col.length
    for (let e = 0; e < empties; e++) {
      col.unshift(isLetterCell(r, rnd) ? 10 + r : pickWeighted(rnd))
    }
    for (let row = 0; row < MAX_ROWS; row++) {
      next[r * MAX_ROWS + row] = row < MAX_ROWS - heights[r] ? 0 : col[row - (MAX_ROWS - heights[r])]
    }
  }
  return next
}

function distinctLetters(grid: number[]): number {
  const set = new Set<number>()
  for (const v of grid) if (v >= 11 && v <= 14) set.add(v)
  return set.size
}

function playCascades(
  rnd: () => number,
  heights: number[],
  unit: number,
  multStart: number,
  growMult: boolean,
  spin: number | null,
  out: Step[]
): number {
  let grid = fillGrid(rnd, heights)
  let total = 0
  let mult = multStart
  for (let iter = 0; iter < 60; iter++) {
    const wins = findWins(grid, unit)
    const win = wins.reduce((a, w) => a + w.win, 0) * mult
    const clean = wins.map(({ startReel, ...rest }) => rest)
    const step: Step = { grid: grid.slice(), wins: clean, win: Math.round(win * 100) / 100, mult }
    if (spin !== null) (step as Step & { spin: number }).spin = spin
    out.push(step)
    if (!wins.length) break
    total += win
    grid = cascade(grid, heights, wins, rnd)
    if (growMult) mult++
  }
  return total
}

export function simulateBonanza(seed: number): BonanzaOutcome {
  const rnd = mulberry32(seed >>> 0)
  const heights: number[] = []
  let megaways = 1
  for (let r = 0; r < REELS; r++) {
    const h = pickHeight(rnd)
    heights.push(h)
    megaways *= h
  }

  const baseSteps: Step[] = []
  const baseWin = playCascades(rnd, heights, 1, 1, false, null, baseSteps)

  // буквы последнего шага базовой игры
  const lastGrid = baseSteps.length ? baseSteps[baseSteps.length - 1].grid : []
  const letters = distinctLetters(lastGrid)

  const freeSteps: FreeSpinStep[] = []
  let freeTotal = 0
  let freeTriggered = false
  let count = 0
  if (letters >= 4) {
    freeTriggered = true
    let spins = FREE_SPINS
    let mult = 1
    while (count < spins && freeTotal < BONUS_WIN_CAP) {
      count++
      const before = freeSteps.length
      freeTotal += playCascades(rnd, heights, 1, mult, true, count, freeSteps)
      // множитель продолжается между фриспинами? В Bonanza — да, не сбрасывается
      mult = freeSteps.length ? freeSteps[freeSteps.length - 1].mult : mult
      void before
      const lastGrid = freeSteps.length ? freeSteps[freeSteps.length - 1].grid : []
      if (distinctLetters(lastGrid) >= 4) spins += FREE_RETRIGGER
      if (spins > FREE_CAP + FREE_SPINS) break
    }
  }

  const freeCapped = Math.min(freeTotal, BONUS_WIN_CAP)
  return {
    seed: seed >>> 0,
    heights,
    megaways,
    base: { steps: baseSteps, win: Math.round(baseWin * 100) / 100 },
    letters,
    free: { triggered: freeTriggered, count, steps: freeSteps, total: Math.round(freeCapped * 100) / 100 },
    total: Math.round((baseWin + freeCapped) * 100) / 100
  }
}
