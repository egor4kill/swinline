import { useEffect, useRef, useState } from 'react'
import { ROWS, TABLES, RISKS, r2, type Risk } from './plinkoLogic'

type DropResult = { slot: number; mul: number; win: number }
type Props = {
  bal: number
  unit: string
  // Сервер принимает ставку, решает ячейку и платит; возвращает результат броска
  onBet: (stake: number, risk: Risk) => Promise<DropResult | null>
}
type Ball = { id: number; pts: [number, number][]; t0: number; stake: number; risk: Risk; slot: number; win: number; x: number; y: number }

const DX = 40, DY = 36, CX = 300, TOP = 60, MIN_BET = 10, MAX_BALLS = 5
const SLOT_Y = TOP + ROWS * DY + 8
const pegX = (r: number, k: number) => CX + (k - r / 2) * DX
const pegY = (r: number) => TOP + r * DY
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
const color = (m: number) => (m >= 10 ? '#ff4d4d' : m >= 2 ? '#ff6a00' : m >= 1 ? '#ffb35c' : '#6b6e74')

// Путь: старт над верхушкой, удар о колышки, ячейка. Визуальные шаги подбираем так,
// чтобы сумма «правых» равнялась серверной ячейке — куда упал, решает сервер.
function path(bits: number[]): [number, number][] {
  const pts: [number, number][] = [[CX, TOP - 44]]
  let k = 0
  for (let r = 0; r < ROWS; r++) { pts.push([pegX(r, k), pegY(r) - 11]); k += bits[r] }
  pts.push([CX + (k - ROWS / 2) * DX, SLOT_Y + 12])
  return pts
}

function bitsForSlot(slot: number): number[] {
  const bits = Array(ROWS).fill(0)
  const idxs = [...Array(ROWS).keys()]
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]]
  }
  let left = slot
  for (const k of idxs) { if (left > 0) { bits[k] = 1; left-- } }
  return bits
}

function PigBall({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-9 -6 L-8 -15 L-1 -9Z M9 -6 L8 -15 L1 -9Z" fill="#ff8fb0" />
      <circle r="11" fill="#ffb3c7" stroke="#101010" strokeWidth="1.5" />
      <ellipse cy="3" rx="6" ry="4.5" fill="#ff8fb0" />
      <circle cx="-2" cy="3" r="1.1" fill="#7a2a45" /><circle cx="2" cy="3" r="1.1" fill="#7a2a45" />
      <circle cx="-4.5" cy="-3" r="1.5" fill="#101010" /><circle cx="4.5" cy="-3" r="1.5" fill="#101010" />
    </g>
  )
}

export default function Plinko({ bal, unit, onBet }: Props) {
  const money = (n: number) => fmt(n) + ' ' + unit
  const minBet = unit === 'АР' ? 1 : 10
  const [stake, setStake] = useState('100')
  const [risk, setRisk] = useState<Risk>('mid')
  const [, setTick] = useState(0)
  const [hist, setHist] = useState<{ id: number; m: number }[]>([])
  const [flash, setFlash] = useState<{ slot: number; n: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const balls = useRef<Ball[]>([])
  const idRef = useRef(0)
  const raf = useRef(0)
  const cb = useRef({ onBet })
  cb.current = { onBet }
  const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const STEP = calm ? 40 : 230

  const running = useRef(false)
  const frame = (now: number) => {
    const done: Ball[] = []
    try {
      balls.current = balls.current.filter(b => {
        const el = (now - b.t0) / STEP, i = Math.floor(el), f = el - i
        if (i >= b.pts.length - 1) { done.push(b); return false }
        const [x0, y0] = b.pts[i], [x1, y1] = b.pts[i + 1]
        b.x = x0 + (x1 - x0) * (1 - (1 - f) * (1 - f))
        b.y = y0 + (y1 - y0) * f - Math.sin(Math.PI * f) * (i === 0 ? 0 : 12)
        return true
      })
    } catch (e) { console.error(e) }
    // выплата уже прошла на сервере при броске — здесь только показываем результат
    done.forEach(b => {
      setHist(h => [{ id: b.id, m: TABLES[b.risk][b.slot] }, ...h].slice(0, 10))
      setFlash({ slot: b.slot, n: b.id })
    })
    setTick(t => t + 1)
    if (balls.current.length) raf.current = requestAnimationFrame(frame)
    else running.current = false
  }
  // уходя со вкладки, просто останавливаем анимацию — деньги на сервере в безопасности
  useEffect(() => () => {
    cancelAnimationFrame(raf.current)
    running.current = false
    balls.current = []
  }, [])

  const launch = async () => {
    const s = Math.floor(parseFloat(stake))
    if (!(s >= minBet)) return alert(`Минимальная ставка: ${minBet} ${unit}`)
    if (balls.current.length >= MAX_BALLS || busy) return
    setBusy(true)
    let res: DropResult | null = null
    try {
      res = await cb.current.onBet(s, risk)
    } finally {
      setBusy(false)
    }
    if (!res) return
    const p = path(bitsForSlot(res.slot))
    balls.current.push({ id: ++idRef.current, pts: p, t0: performance.now(), stake: s, risk, slot: res.slot, win: res.win, x: p[0][0], y: p[0][1] })
    if (!running.current) { running.current = true; raf.current = requestAnimationFrame(frame) }
  }

  const pegs: JSX.Element[] = []
  for (let r = 0; r < ROWS; r++) for (let k = 0; k <= r; k++) pegs.push(<circle key={r + '-' + k} cx={pegX(r, k)} cy={pegY(r)} r="3.5" fill="#e8e8e8" />)
  const t = TABLES[risk]

  return (
    <div className="wl-banner-card highlight" style={{ padding: '24px 16px 28px', textAlign: 'center' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • ПЛИНКО</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 'clamp(22px, 6vw, 28px)', margin: '12px 0 6px' }}>ПЯТОЧОК-ПЛИНКО 🐷</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, margin: '0 auto 12px', maxWidth: 520 }}>
        Бросай Пяточка на вершину пирамиды. Он прыгает по колышкам и падает в ячейку с иксом. До {MAX_BALLS} шариков одновременно.
      </p>
      <svg viewBox={`0 0 600 ${SLOT_Y + 54}`} role="img" aria-label="Пирамида плинко с ячейками множителей" style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto' }}>
        {pegs}
        {t.map((m, k) => (
          <g key={k + (flash && flash.slot === k ? '-' + flash.n : '')} className={flash && flash.slot === k ? 'plinko-hit' : ''}>
            <rect x={CX + (k - ROWS / 2) * DX - DX / 2 + 2} y={SLOT_Y} width={DX - 4} height={30} rx="7" fill="#1b1c1e" stroke={color(m)} strokeWidth="2" />
            <text x={CX + (k - ROWS / 2) * DX} y={SLOT_Y + 20} textAnchor="middle" fontSize="11" fontWeight="800" fill={color(m)}>{m}x</text>
          </g>
        ))}
        {balls.current.map(b => <PigBall key={b.id} x={b.x} y={b.y} />)}
      </svg>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0', minHeight: 30 }} aria-live="polite">
        {hist.map(h => <span key={h.id} style={{ border: `1px solid ${color(h.m)}`, color: color(h.m), borderRadius: 8, padding: '2px 8px', fontWeight: 800, fontSize: 13 }}>{h.m}x</span>)}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Риск">
        {RISKS.map(r => <button key={r.id} className={`wl-round-btn ${risk === r.id ? 'active' : ''}`} aria-pressed={risk === r.id} onClick={() => setRisk(r.id)}>{r.label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label={`Ставка, ${unit}`} inputMode="numeric" value={stake} onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
          style={{ width: 110, padding: '12px', borderRadius: 10, border: '1px solid var(--line, #2d2f33)', background: '#262729', color: 'inherit', fontWeight: 800, fontSize: 18, textAlign: 'center' }} />
        {(unit === 'АР' ? [1, 5, 10, 50] : [10, 100, 500]).map(v => <button key={v} className="wl-round-btn" onClick={() => setStake(String(v))}>{v}</button>)}
        <button className="wl-round-btn" onClick={() => setStake(String(Math.max(minBet, Math.floor(bal))))}>Всё</button>
        <button className="wl-btn-orange" style={{ minHeight: 46, padding: '0 22px', fontWeight: 800, opacity: busy ? 0.6 : 1 }} onClick={launch}>{busy ? 'Бросок…' : 'Бросить Пяточка'}</button>
      </div>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 12, marginTop: 10 }}>Выплата = ставка × икс ячейки (решает сервер). Сейчас на балансе {money(r2(bal))}.</p>
    </div>
  )
}
