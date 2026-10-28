import { useEffect, useRef, useState } from 'react'
import { Crown, Gem, Hourglass, Trophy, Zap } from 'lucide-react'
import type { UserAccount } from './data'

type Currency = 'sv' | 'ar'
type Cell = { s: number; m: number }
type Win = { s: number; count: number; amount: number; indices: number[] }
type Frame = {
  grid: Cell[]
  wins: Win[]
  phase: 'base' | 'free'
  spin: number
  mult: number
  orbSum: number
  scatterCount: number
}
type Run = {
  base: { steps: Frame[]; win: number }
  free: { triggered: boolean; count: number; steps: Frame[]; total: number }
  total: number
  capped: boolean
}
type SpinData = { run: Run; win: number; cost: number; buy: boolean }

type Props = {
  currentUser: UserAccount | null
  bal: number
  unit: string
  currency: Currency
  onSpin: (stake: number, buy: boolean) => Promise<SpinData | null>
  notify: (m: string) => void
}

const FRAME_MS = 420
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

// какие нарисованные символы: 1 корона, 2 песочные часы, 3 кольцо, 4 кубок,
// 5..9 самоцветы, 10 скаттер (молния), 11 шар-множитель
function SymbolIcon({ s }: { s: number }) {
  if (s === 1) return <Crown size={24} className="ol-ic gold" />
  if (s === 2) return <Hourglass size={22} className="ol-ic pale" />
  if (s === 3) return <Gem size={22} className="ol-ic blue" />
  if (s === 4) return <Trophy size={22} className="ol-ic gold" />
  return null
}

export default function OlympusGame({ currentUser, bal, unit, currency, onSpin, notify }: Props) {
  const [stake, setStake] = useState(currency === 'ar' ? '1' : '100')
  const [run, setRun] = useState<Run | null>(null)
  const [frames, setFrames] = useState<Frame[] | null>(null)
  const [idx, setIdx] = useState(-1)
  const [spinning, setSpinning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<SpinData | null>(null)
  const [error, setError] = useState('')
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(t => clearInterval(t)), [])

  const frame = frames && idx >= 0 && idx < frames.length ? frames[idx] : null
  const prev = frames && idx > 0 ? frames[idx - 1] : null
  const inFree = Boolean(frame?.phase === 'free')
  const freeCount = run?.free.count || 0
  const previewGrid: Cell[] = [1, 5, 6, 8, 7, 2, 9, 4, 6, 1, 5, 8, 7, 3, 9, 6, 2, 1, 8, 5, 4, 7, 6, 9, 1, 5, 3, 2, 7, 8]
    .map(s => ({ s, m: 0 }))

  const grid = frame?.grid || previewGrid
  const winCells = new Set<number>()
  if (frame) for (const w of frame.wins) for (const i of w.indices) winCells.add(i)

  const money = (n: number) => `${fmt(n)} ${unit}`
  const buyCost = Math.round((parseFloat(stake) || 0) * 100 * 100) / 100
  const minBet = currency === 'ar' ? 1 : 10
  const bet = Math.floor(parseFloat(stake) || 0)

  const play = (data: SpinData) => {
    const list = [...data.run.base.steps, ...data.run.free.steps]
    setFrames(list)
    setRun(data.run)
    setIdx(0)
    timers.current.forEach(t => clearInterval(t))
    timers.current = []
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      if (i >= list.length) {
        clearInterval(id)
        setSummary(data)
        setSpinning(false)
        if (data.run.free.triggered) notify(`⚡ Бонус Олимпа: ${data.run.free.count} фриспинов, выигрыш ${money(data.win)}`)
        return
      }
      setIdx(i)
    }, FRAME_MS)
  }

  const spin = async (buy: boolean) => {
    if (busy || spinning) return
    if (!currentUser) { notify('Для игры необходимо войти через Twitch!'); return }
    if (!(bet >= minBet)) { setError(`Минимальная ставка: ${minBet} ${unit}`); return }
    if (buy && bal < buyCost) { setError(`Для бонуса нужно ${money(buyCost)}`); return }
    setBusy(true)
    setError('')
    setSummary(null)
    setFrames(null)
    setRun(null)
    setIdx(-1)
    const data = await onSpin(bet, buy)
    setBusy(false)
    if (!data) return
    setSpinning(true)
    play(data)
  }

  return (
    <div className="ol-root">
      <div className="ol-temple">
        <div className="ol-sky" />
        <div className="ol-column left" />
        <div className="ol-column right" />
        <div className="ol-pediment">
          <span className="ol-title">ОЛИМП</span>
          <span className="ol-subtitle">GATES OF SWINLINE · 6×5</span>
        </div>

        <div className="ol-hud">
          <span className="ol-badge">8+ = ВЫИГРЫШ</span>
          {inFree && <span className="ol-badge free">ФРИСПИНЫ {frame?.spin}/{freeCount}</span>}
          {frame && frame.mult > 1 && <span className="ol-mult">x{frame.mult}</span>}
          {!inFree && frame && frame.orbSum > 0 && <span className="ol-badge orb">ШАРЫ x{frame.orbSum}</span>}
        </div>

        <div className={`ol-board ${frame && frame.wins.length ? 'ol-flash' : ''}`} key={`b-${idx}`}>
          {Array.from({ length: 5 }).map((_, row) =>
            Array.from({ length: 6 }).map((__, col) => {
              const i = row * 6 + col
              const cell = grid[i] || { s: 0, m: 0 }
              const hit = winCells.has(i)
              const changed = prev ? prev.grid[i]?.s !== cell.s || prev.grid[i]?.m !== cell.m : false
              return (
                <div
                  key={`${idx}-${i}`}
                  className={[
                    'ol-cell',
                    hit ? 'ol-hit' : '',
                    changed && cell.s ? 'ol-drop' : '',
                    cell.s === 10 ? 'ol-scatter' : '',
                    cell.s === 11 ? 'ol-orbcell' : '',
                    cell.s >= 5 && cell.s <= 9 ? `ol-gem g${cell.s}` : ''
                  ].join(' ')}
                >
                  {cell.s === 11 ? (
                    <span className="ol-orb">x{cell.m}</span>
                  ) : cell.s === 10 ? (
                    <Zap size={24} className="ol-scatter-ic" />
                  ) : cell.s >= 5 && cell.s <= 9 ? (
                    <i className="ol-diamond" />
                  ) : (
                    <SymbolIcon s={cell.s} />
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="ol-meters">
          <span>БАЛАНС <b>{money(bal)}</b></span>
          {summary && <span className="ol-sumwin">ВЫИГРЫШ <b>{money(summary.win)}</b></span>}
          {summary?.run.free.triggered && <span className="ol-sumbonus">БОНУС {summary.run.free.count} FS</span>}
        </div>
      </div>

      <div className="pick-controls">
        <input
          aria-label={`Ставка, ${unit}`}
          inputMode="numeric"
          value={stake}
          onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
          className="pick-stake"
        />
        {(currency === 'ar' ? [1, 5, 25, 100] : [100, 500, 1000, 5000]).map(v => (
          <button key={v} type="button" className="wl-round-btn" onClick={() => setStake(String(v))}>{v}</button>
        ))}
      </div>

      <div className="ol-actions">
        <button
          type="button"
          className="wl-btn-orange ol-spin"
          disabled={busy || spinning}
          onClick={() => spin(false)}
        >
          {busy ? 'Крутим…' : spinning ? 'Каскады…' : '⚡ КРУТИТЬ'}
        </button>
        <button
          type="button"
          className="ol-buy"
          disabled={busy || spinning || bal < buyCost}
          onClick={() => spin(true)}
          title="15 фриспинов с накопительным множителем"
        >
          <Crown size={15} /> БОНУС · {money(buyCost)}
        </button>
      </div>

      {error && <p className="pick-notice" style={{ color: '#ff8f8f' }}>{error}</p>}
      <p className="pick-fine">
        8+ одинаковых символов в любом месте поля платят. Выигравшие символы сгорают,
        новые падают сверху. Шары-множители умножают серию, во фриспинах множитель копится.
      </p>
    </div>
  )
}
