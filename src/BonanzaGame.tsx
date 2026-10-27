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
const GEM_CLASS: Record<number, string> = { 1: 'gem-red', 2: 'gem-purple', 3: 'gem-green', 4: 'gem-blue' }
const RANK_TEXT: Record<number, string> = { 5: '9', 6: '10', 7: 'J', 8: 'Q', 9: 'K', 10: 'A' }
const LETTER_TEXT: Record<number, string> = { 11: 'G', 12: 'O', 13: 'L', 14: 'D' }
const FRAME_MS = 750

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

// «Бонанза»: Megaways-барабаны с каскадами и GOLD-бонусом.
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
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(t => clearInterval(t)), [])

  const frame = frames && frameIdx >= 0 && frameIdx < frames.length ? frames[frameIdx] : null
  const currentMult = frame && frame.phase === 'free' ? frame.mult : 1
  const runWin = frames
    ? frames.slice(0, frameIdx + 1).reduce((a, f) => a + (f.phase === 'base' ? f.win : 0), 0)
    : 0

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
        setSummary({ win, free: run.free.triggered ? run.free.count : 0, total: run.total })
        setSpinning(false)
        if (run.free.triggered) notify(`🆓 GOLD-бонус: ${run.free.count} фриспинов, выигрыш ${fmt(run.free.total)} ${unit}`)
        return
      }
      setFrameIdx(idx)
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
    setFrames(null)
    setFrameIdx(-1)
    const data = await onSpin(s)
    setBusy(false)
    if (!data) return
    setSpinning(true)
    play(data.run)
  }

  return (
    <div className="wl-banner-card highlight" style={{ padding: '18px 12px 26px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • MEGAWAYS</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 'clamp(22px, 6vw, 28px)', margin: '10px 0 4px' }}>БОНАНЗА ⛏️💎</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 13, margin: '0 auto 10px', maxWidth: 560 }}>
        До 117 649 способов выиграть. Каскады сносят winners и сыпят новые блоки,
        4 буквы G·O·L·D дают фриспины с безлимитным множителем.
      </p>

      <div className="bonanza-hud">
        <span className="bonanza-megaways">{megaways > 0 ? `${megaways.toLocaleString('ru-RU')} ways` : 'MEGAWAYS™'}</span>
        {spinning && frame?.phase === 'free' && (
          <span className="bonanza-mult">x{currentMult} безлимит</span>
        )}
        {spinning && runWin > 0 && (
          <span className="bonanza-runwin">{fmt(runWin)} {unit}</span>
        )}
      </div>

      <div className="bonanza-board" role="img" aria-label="Барабаны Бонанзы">
        {heights.map((h, r) => (
          <div key={r} className="bonanza-reel">
            {Array.from({ length: h }).map((_, rowFromTop) => {
              const row = ROWS - h + rowFromTop
              const cell = frame ? frame.grid[r * ROWS + row] : -1
              const isWin = Boolean(frame && cell >= 1 && frame.wins.some(w => w.s === cell))
              const isLetter = cell >= 11 && cell <= 14
              return (
                <div
                  key={row}
                  className={[
                    'bonanza-cell',
                    cell === 0 ? 'empty' : '',
                    cell === -1 ? 'preview' : '',
                    isWin ? 'hit' : '',
                    isLetter ? 'gold-letter' : GEM_CLASS[cell] || (cell > 0 && cell <= 10 ? 'rank' : '')
                  ].join(' ')}
                >
                  {isLetter ? LETTER_TEXT[cell] : RANK_TEXT[cell] || (cell >= 1 && cell <= 4 ? '💎' : '')}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {summary && (
        <div className={`bonanza-summary ${summary.win > 0 ? 'win' : 'lose'}`}>
          {summary.win > 0
            ? <>Выигрыш <b>{fmt(summary.win)} {unit}</b>{summary.free > 0 ? ` · GOLD-бонус ${summary.free} фриспинов` : ''}</>
            : 'Пусто. Каскады не сложились — крут ещё раз'}
        </div>
      )}

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
        className="wl-btn-orange"
        style={{ minHeight: 48, padding: '0 34px', fontWeight: 800, opacity: busy || spinning ? 0.6 : 1 }}
        disabled={busy || spinning}
        onClick={spin}
      >
        {busy ? 'Крутим…' : spinning ? 'Каскады…' : 'Крутить'}
      </button>

      {error && <p className="pick-notice" style={{ color: '#ff8f8f' }}>{error}</p>}
      <p className="pick-fine">
        Символы падают каскадами: собранные комбинации сгорают, новые падают сверху.
        4 буквы G·O·L·D — 10 фриспинов, множитель растёт с каждым каскадом. RTP ~97%.
      </p>
    </div>
  )
}
