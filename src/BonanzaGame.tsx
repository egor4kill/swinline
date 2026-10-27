import { useEffect, useRef, useState } from 'react'
import type { UserAccount } from './data'

type Currency = 'sv' | 'ar'
type WinInfo = { s: number; k: number; ways: number; start: number; win: number }
type Frame = {
  grid: number[]
  wins: WinInfo[]
  win: number
  mult: number
  phase: 'base' | 'free'
  spin: number
}
type SpinRun = {
  run: {
    heights: number[]
    megaways: number
    base: { steps: Frame[]; win: number }
    free: { triggered: boolean; count: number; steps: Frame[]; total: number }
    total: number
  }
  win: number
}

type Props = {
  currentUser: UserAccount | null
  bal: number
  unit: string
  currency: Currency
  onSpin: (stake: number) => Promise<SpinRun | null>
  notify: (m: string) => void
}

const ROWS = 7
const REELS = 6
const RANK_TEXT: Record<number, string> = { 5: '9', 6: '10', 7: 'J', 8: 'Q', 9: 'K', 10: 'A' }
const LETTER_TEXT: Record<number, string> = { 11: 'G', 12: 'O', 13: 'L', 14: 'D' }
const FRAME_MS = 850

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

// «Бонанза»: Megaways-барабаны с каскадами и GOLD-бонусом в стиле золотой шахты.
// Исход считает сервер одним RPC, клиент проигрывает полученную раскадровку.
export default function BonanzaGame({ currentUser, bal, unit, currency, onSpin, notify }: Props) {
  const [stake, setStake] = useState(currency === 'ar' ? '1' : '100')
  const [frames, setFrames] = useState<Frame[] | null>(null)
  const [frameIdx, setFrameIdx] = useState(-1)
  const [heights, setHeights] = useState<number[]>([4, 4, 4, 4, 4, 4])
  const [megaways, setMegaways] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [summary, setSummary] = useState<{ win: number; free: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [flashWin, setFlashWin] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(t => clearInterval(t)), [])

  const frame = frames && frameIdx >= 0 && frameIdx < frames.length ? frames[frameIdx] : null
  const prevFrame = frames && frameIdx > 0 ? frames[frameIdx - 1] : null
  const inFree = Boolean(frame?.phase === 'free' || (frames && frameIdx >= frames.length && frames.some(f => f.phase === 'free')))
  const currentMult = frame?.phase === 'free' ? frame.mult : 1
  const runWin = frames
    ? frames.slice(0, frameIdx + 1).reduce((a, f) => a + f.win, 0)
    : 0

  const winningCell = (r: number, row: number, value: number) => {
    if (!frame || value < 1 || value > 10) return false
    return frame.wins.some(w => w.s === value && r >= w.start && r < w.start + w.k)
  }
  const cellChanged = (r: number, row: number, value: number) => {
    if (!prevFrame) return false
    return prevFrame.grid[r * ROWS + row] !== value
  }

  const play = (run: SpinRun['run']) => {
    const list: Frame[] = run.base.steps.map(f => ({ ...f, phase: 'base' as const }))
    if (run.free.triggered) {
      for (const f of run.free.steps) list.push({ ...f, phase: 'free' as const })
    }
    setFrames(list)
    setFrameIdx(0)
    setHeights(run.heights)
    setMegaways(run.megaways)

    timers.current.forEach(t => clearInterval(t))
    timers.current = []
    let idx = 0
    const id = window.setInterval(() => {
      idx += 1
      if (idx >= list.length) {
        clearInterval(id)
        const win = list.reduce((a, f) => a + f.win, 0)
        setFlashWin(win)
        setSummary({ win, free: run.free.triggered ? run.free.count : 0, total: run.total })
        setSpinning(false)
        if (run.free.triggered) notify(`🆓 GOLD-бонус: ${run.free.count} фриспинов, выигрыш ${fmt(run.free.total)} ${unit}`)
        return
      }
      const f = list[idx]
      setFrameIdx(idx)
      if (f.win > 0) setFlashWin(f.win)
    }, FRAME_MS)
  }

  const spin = async () => {
    if (busy || spinning) return
    if (!currentUser) {
      notify('Для игры необходимо войти через Twitch!')
      return
    }
    const minBet = currency === 'ar' ? 1 : 10
    const s = Math.floor(parseFloat(stake) || 0)
    if (!(s >= minBet)) {
      setError(`Минимальная ставка: ${minBet} ${unit}`)
      return
    }
    setBusy(true)
    setError('')
    setSummary(null)
    setFlashWin(0)
    setFrames(null)
    setFrameIdx(-1)
    const data = await onSpin(s)
    setBusy(false)
    if (!data) return
    setSpinning(true)
    play(data.run)
  }

  return (
    <div className="bz-root">
      <div className="bz-tunnel">
        <div className="bz-beam bz-beam-top" />
        <div className="bz-title">
          <span className="bz-title-main">BONANZA</span>
          <span className="bz-title-sub">SWINLINE · MEGAWAYS</span>
        </div>

        {/* Вагонетки над средними барабанами — как в оригинале */}
        <div className="bz-carts">
          {[1, 2, 3, 4].map(r => (
            <div key={r} className="bz-cart" style={{ gridArea: `1 / ${r + 1}` }}>
              <span className="bz-cart-body">🛒</span>
            </div>
          ))}
        </div>

        <div className="bz-frame">
          <div className="bz-hud">
            <span className="bz-ways-total">{megaways > 0 ? `${megaways.toLocaleString('ru-RU')} WAYS` : 'MEGAWAYS™'}</span>
            {inFree && (
              <span className="bz-mult-badge">БЕЗЛИМИТ ×{currentMult}</span>
            )}
            {runWin > 0 && (
              <span className="bz-runwin">{fmt(runWin)} {unit}</span>
            )}
          </div>

          <div className={`bz-board ${frame && frame.win > 0 ? 'bz-board-flash' : ''}`} key={frameIdx} role="img" aria-label="Барабаны Бонанзы">
            {heights.map((h, r) => (
              <div key={r} className="bz-reel">
                <span className="bz-reel-ways">{h}</span>
                <div className="bz-reel-stack">
                  {Array.from({ length: h }).map((_, rowFromTop) => {
                    const row = ROWS - h + rowFromTop
                    const cell = frame ? frame.grid[r * ROWS + row] : -1
                    const isLetter = cell >= 11 && cell <= 14
                    const isGem = cell >= 1 && cell <= 4
                    const isRank = cell >= 5 && cell <= 10
                    return (
                      <div
                        key={`${frameIdx}-${r}-${row}`}
                        className={[
                          'bz-cell',
                          cell === 0 ? 'bz-empty' : '',
                          cell === -1 ? 'bz-preview' : '',
                          winningCell(r, row, cell) ? 'bz-hit' : '',
                          cellChanged(r, row, cell) && cell !== 0 ? 'bz-drop' : '',
                          isLetter ? 'bz-gold' : '',
                          isGem ? `bz-gem gem-${cell}` : '',
                          isRank ? 'bz-rank' : ''
                        ].join(' ')}
                      >
                        {isLetter ? <b>{LETTER_TEXT[cell]}</b> : null}
                        {isRank ? <b>{RANK_TEXT[cell]}</b> : null}
                        {isGem ? <i className="bz-gem-shape" /> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="bz-beam bz-beam-bottom" />
        </div>

        {summary && (
          <div className={`bz-summary ${summary.win > 0 ? 'bz-win' : 'bz-lose'}`}>
            {summary.win > 0
              ? <>🏆 Выигрыш <b>{fmt(summary.win)} {unit}</b>{summary.free > 0 ? ` · GOLD-бонус: ${summary.free} фриспинов` : ''}</>
              : 'Каскады не сложились — крут ещё раз'}
          </div>
        )}
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
        <button type="button" className="wl-round-btn" onClick={() => setStake(String(Math.max(currency === 'ar' ? 1 : 10, Math.floor(bal))))}>Всё</button>
      </div>

      <button
        type="button"
        className="wl-btn-orange bz-spin"
        style={{ minHeight: 48, fontWeight: 800, opacity: busy || spinning ? 0.6 : 1 }}
        disabled={busy || spinning}
        onClick={spin}
      >
        {busy ? 'Крутим…' : spinning ? 'Каскады…' : '⛏ КРУТИТЬ'}
      </button>

      {error && <p className="pick-notice" style={{ color: '#ff8f8f' }}>{error}</p>}
      <p className="pick-fine">
        Собери 3+ символа на соседних барабанах слева направо. Каждая победа взрывает блоки —
        новые падают сверху. G·O·L·D — фриспины с безлимитным множителем. RTP ~97%.
      </p>
    </div>
  )
}
