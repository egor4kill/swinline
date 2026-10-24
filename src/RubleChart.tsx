import { useEffect, useRef, useState } from 'react'
import { PAYOUT, ambientStep, r2, type Side } from './rubleLogic'

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
const WINDOW = 90          // точек в видимой истории (по одной каждые ~50 мс)
const AMBIENT_MS = 300     // новая «биржевая» цель фона
const TICK_MS = 90         // скорость проигрывания серверного пути
const SMOOTH = 0.15        // сглаживание движения к цели (каждый кадр)
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
  const [news, setNews] = useState('Курс стабильно непредсказуем. Делайте ставки, господа')
  const [hist, setHist] = useState<{ id: number; dir: string; win: boolean; pct: number }[]>([])
  const [, setTick] = useState(0)

  // живой график: рисуемая цена → цель (сглаживание), буфер истории, очередь тиков ставки
  const priceRef = useRef(100)
  const targetRef = useRef(100)
  const bufRef = useRef<number[]>(Array(WINDOW).fill(100))
  const queueRef = useRef<number[]>([])
  const pendingRef = useRef<{ res: RubleResult; startPrice: number } | null>(null)
  const resultRef = useRef<{ win: boolean; pct: number } | null>(null)
  const endsAtRef = useRef(0)
  const lastAmbRef = useRef(0)
  const lastPushRef = useRef(0)
  const lastTickRef = useRef(0)

  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const loop = (now: number) => {
      // новая биржевая цель, только когда ставка не играет
      if (!queueRef.current.length && now - lastAmbRef.current > AMBIENT_MS) {
        lastAmbRef.current = now
        targetRef.current = ambientStep(targetRef.current)
      }
      // серверный путь: следующий тик каждые TICK_MS
      if (queueRef.current.length && now - lastTickRef.current > TICK_MS) {
        lastTickRef.current = now
        targetRef.current = queueRef.current.shift()!
      }
      // плавное движение к цели
      priceRef.current += (targetRef.current - priceRef.current) * (calm ? 0.6 : SMOOTH)
      // точка истории каждые ~50 мс
      if (now - lastPushRef.current > 50) {
        lastPushRef.current = now
        bufRef.current.push(priceRef.current)
        if (bufRef.current.length > WINDOW) bufRef.current.shift()
      }
      // ставка сыграла: очередь пуста и цена дошла
      if (pendingRef.current && !queueRef.current.length && now > endsAtRef.current &&
          Math.abs(priceRef.current - targetRef.current) < 0.01) {
        const { res, startPrice } = pendingRef.current
        pendingRef.current = null
        resultRef.current = { win: res.win, pct: Math.round(((priceRef.current - startPrice) / startPrice) * 10000) / 100 }
        const pool = res.dir === 'flat' ? NEWS_FLAT : res.dir === 'up' ? NEWS_UP : NEWS_DOWN
        setNews(pool[Math.floor(Math.random() * pool.length)])
        setHist(h => [{ id: Date.now(), dir: res.dir, win: res.win, pct: resultRef.current!.pct }, ...h].slice(0, 10))
        setBusy(false)
      }
      setTick(t => t + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const launch = async (side: Side) => {
    const s = Math.floor(parseFloat(stake))
    if (!(s >= MIN_BET)) return alert(`Минимальная ставка: ${MIN_BET} SV₽`)
    if (busy) return
    setBusy(true)
    resultRef.current = null
    let res: RubleResult | null = null
    try {
      res = await cb.current.onPredict(side, s)
    } finally {
      if (!res) setBusy(false)
    }
    if (!res) return
    // вливаем серверный путь в живой график: стартуем с текущей цены,
    // весь путь сдвигаем на ту же дельту — направление исхода сохраняется
    const startPrice = priceRef.current
    const shift = startPrice - res.start
    queueRef.current = [startPrice, ...res.ticks.map(t => t + shift)]
    pendingRef.current = { res, startPrice }
    endsAtRef.current = performance.now() + TICK_MS * (queueRef.current.length + 2)
    lastTickRef.current = 0
  }
  const cb = useRef({ onPredict })
  cb.current = { onPredict }

  // масштаб по видимой истории
  const buf = bufRef.current
  const lo0 = Math.min(...buf), hi0 = Math.max(...buf)
  const mid = (lo0 + hi0) / 2, half = Math.max((hi0 - lo0) / 2, 0.6) * 1.25
  const y = (v: number) => PAD + (1 - (v - (mid - half)) / (2 * half)) * (H - 2 * PAD)
  const x = (i: number) => PAD + (i / (WINDOW - 1)) * (W - 2 * PAD)
  const pts = buf.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const price = priceRef.current
  const slope = price - buf[buf.length - 4]
  const liveColor = slope >= 0 ? '#37c26e' : '#ff4d4d'
  const res = resultRef.current

  return (
    <div className="wl-banner-card highlight" style={{ padding: '24px 16px 28px', textAlign: 'center' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • БИНАРНЫЕ ОПЦИОНЫ</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 28, margin: '12px 0 6px' }}>КУРС РУБЛЯ 📉📈</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, margin: '0 auto 12px', maxWidth: 560 }}>
        Живой график рубля идёт круглосуточно. Ставь на «вверх» или «вниз» — угадал за 30 тиков, забираешь x{PAYOUT}. ЦБ гарантирует*
      </p>
      <div style={{ color: 'var(--tx-secondary)', fontSize: 12, fontStyle: 'italic', margin: '0 auto 10px', maxWidth: 560, minHeight: 16 }} aria-live="polite">
        «{news}»
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Живой график курса рубля" style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto', background: '#1b1c1e', borderRadius: 12 }}>
        <line x1={PAD} y1={y(100)} x2={W - PAD} y2={y(100)} stroke="#6b6e74" strokeDasharray="4 4" strokeWidth="1" />
        <text x={W - PAD - 2} y={y(100) - 5} textAnchor="end" fontSize="11" fill="#6b6e74">официальный курс 100,00 ₽</text>
        <polyline points={pts} fill="none" stroke={liveColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(WINDOW - 1)} cy={y(price)} r="4" fill={liveColor} />
        <text x={W - PAD - 8} y={PAD + 4} textAnchor="end" fontSize="14" fontWeight="800" fill={liveColor}>{fmt(price)} ₽</text>
        {res && (
          <text x={PAD + 8} y={PAD + 8} fontSize="15" fontWeight="800" fill={res.win ? '#37c26e' : '#ff4d4d'}>
            {res.pct > 0 ? '▲ +' : res.pct < 0 ? '▼ ' : '● '}{res.pct}% — {res.win ? `ВЫИГРЫШ x${PAYOUT}` : 'ПРОИГРЫШ'}
          </text>
        )}
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
