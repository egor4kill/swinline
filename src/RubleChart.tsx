import { useEffect, useRef, useState } from 'react'
import { TICKS, PAYOUT, genPath, r2, type Side } from './rubleLogic'

export type RubleResult = {
  start: number
  final: number
  ticks: number[]
  dir: 'up' | 'down' | 'flat'
  win: boolean
  mul: number
  payout: number
}
type Props = {
  bal: number
  // Сервер генерирует путь курса, решает исход и платит; клиент только рисует график
  onPredict: (side: Side, stake: number) => Promise<RubleResult | null>
}

const MIN_BET = 10
const W = 640, H = 260, PAD = 26
const STEP_MS = 70
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

const NEWS_UP = [
  'ЦБ: рубль показал сильные позиции, всё под контролем',
  'Нефть подорожала на 3 копейки — рубль вырос вдвое',
  'Эксперты: падение отменяется, у нас график зелёный',
  'Минфин нашёл деньги. Оказалось, у графика',
]
const NEWS_DOWN = [
  'Рубль упал. Эксперты советуют не падать',
  'ЦБ повысил ключевую ставку до 146% — рынок отреагировал смехом',
  'Причина падения курса — падение курса, подтверждают источники',
  'Аналитики: курс прогнозируемо непредсказуем',
]
const NEWS_FLAT = ['Курс остался на месте. Инвесторы в шоке от стабильности']

export default function RubleChart({ bal, onPredict }: Props) {
  const [stake, setStake] = useState('100')
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<number[]>([100])
  const [news, setNews] = useState('Курс стабильно непредсказуем. Делайте ставки, господа')
  const [hist, setHist] = useState<{ id: number; dir: string; win: boolean; pct: number }[]>([])
  const timer = useRef(0)
  const cb = useRef({ onPredict })
  cb.current = { onPredict }

  useEffect(() => () => clearInterval(timer.current), [])

  const launch = async (side: Side) => {
    const s = Math.floor(parseFloat(stake))
    if (!(s >= MIN_BET)) return alert(`Минимальная ставка: ${MIN_BET} SV₽`)
    if (busy) return
    setBusy(true)
    clearInterval(timer.current)
    let res: RubleResult | null = null
    try {
      res = await cb.current.onPredict(side, s)
    } finally {
      if (!res) setBusy(false)
    }
    if (!res) return
    // анимация: открываем тики по одному, исход уже решён сервером
    const path = [res.start, ...res.ticks]
    let i = 1
    timer.current = window.setInterval(() => {
      setShown(path.slice(0, i + 1))
      i++
      if (i > path.length - 1) {
        clearInterval(timer.current)
        const pct = Math.round(((res.final - res.start) / res.start) * 10000) / 100
        setHist(h => [{ id: Date.now(), dir: res.dir, win: res.win, pct }, ...h].slice(0, 10))
        const pool = res.dir === 'flat' ? NEWS_FLAT : res.dir === 'up' ? NEWS_UP : NEWS_DOWN
        setNews(pool[Math.floor(Math.random() * pool.length)])
        setBusy(false)
      }
    }, STEP_MS)
  }

  // масштаб графика по видимой части пути
  const lo = Math.min(...shown), hi = Math.max(...shown)
  const span = Math.max(hi - lo, 0.5)
  const x = (i: number) => PAD + (i / TICKS) * (W - 2 * PAD)
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD)
  const pts = shown.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = shown[shown.length - 1]
  const curUp = last >= shown[0]
  const revealAll = shown.length >= TICKS + 1

  return (
    <div className="wl-banner-card highlight" style={{ padding: '24px 16px 28px', textAlign: 'center' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • БИНАРНЫЕ ОПЦИОНЫ</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 28, margin: '12px 0 6px' }}>КУРС РУБЛЯ 📉📈</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, margin: '0 auto 12px', maxWidth: 560 }}>
        Угадай, куда пойдёт курс рубля за {TICKS} тиков: вверх или вниз. Угадал — забираешь x{PAYOUT}. ЦБ гарантирует*
      </p>
      <div style={{ color: 'var(--tx-secondary)', fontSize: 12, fontStyle: 'italic', margin: '0 auto 10px', maxWidth: 560, minHeight: 16 }} aria-live="polite">
        «{news}»
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График курса рубля" style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto', background: '#1b1c1e', borderRadius: 12 }}>
        <line x1={PAD} y1={y(100)} x2={W - PAD} y2={y(100)} stroke="#6b6e74" strokeDasharray="4 4" strokeWidth="1" />
        <text x={W - PAD - 2} y={y(100) - 5} textAnchor="end" fontSize="11" fill="#6b6e74">старт 100,00 ₽</text>
        <polyline points={pts} fill="none" stroke={revealAll ? (curUp ? '#37c26e' : '#ff4d4d') : '#e8b53a'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {revealAll && (
          <g>
            <circle cx={x(TICKS)} cy={y(last)} r="5" fill={curUp ? '#37c26e' : '#ff4d4d'} />
            <text x={x(TICKS) - 6} y={y(last) - 10} textAnchor="end" fontSize="14" fontWeight="800" fill={curUp ? '#37c26e' : '#ff4d4d'}>
              {fmt(last)} ₽ ({curUp ? '+' : ''}{Math.round(((last - 100) / 100) * 10000) / 100}%)
            </text>
          </g>
        )}
        {!revealAll && <circle cx={x(shown.length - 1)} cy={y(last)} r="4" fill="#e8b53a" />}
      </svg>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0', minHeight: 30 }} aria-live="polite">
        {hist.map(h => (
          <span key={h.id} style={{ border: `1px solid ${h.win ? '#37c26e' : '#ff4d4d'}`, color: h.win ? '#37c26e' : '#ff4d4d', borderRadius: 8, padding: '2px 8px', fontWeight: 800, fontSize: 13 }}>
            {h.dir === 'flat' ? 'флэт' : h.dir === 'up' ? '▲' : '▼'} {h.pct > 0 ? '+' : ''}{h.pct}%
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label="Ставка, SV₽" inputMode="numeric" value={stake} onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
          style={{ width: 110, padding: '12px', borderRadius: 10, border: '1px solid var(--line, #2d2f33)', background: '#262729', color: 'inherit', fontWeight: 800, fontSize: 18, textAlign: 'center' }} />
        {[10, 100, 500].map(v => <button key={v} className="wl-round-btn" onClick={() => setStake(String(v))}>{v}</button>)}
        <button className="wl-round-btn" onClick={() => setStake(String(Math.max(MIN_BET, Math.floor(bal))))}>Всё</button>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <button className="wl-btn-orange" disabled={busy} style={{ minHeight: 46, padding: '0 26px', fontWeight: 800, background: busy ? '#268a4e' : undefined, opacity: busy ? 0.85 : 1 }} onClick={() => launch('up')}>
          📈 Вверх (x{PAYOUT})
        </button>
        <button className="wl-btn-orange" disabled={busy} style={{ minHeight: 46, padding: '0 26px', fontWeight: 800, background: busy ? '#a03030' : undefined, opacity: busy ? 0.85 : 1 }} onClick={() => launch('down')}>
          📉 Вниз (x{PAYOUT})
        </button>
      </div>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 12, marginTop: 10 }}>
        Выплата = ставка × {PAYOUT}, исход решает сервер в момент ставки. *Гарантий нет. Сейчас на балансе {fmt(r2(bal))} SV₽.
      </p>
    </div>
  )
}
