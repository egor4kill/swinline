import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { TICK_SECONDS, PAYOUT, r2, type Side } from './rubleLogic'

export type RubleResult = {
  start: number
  final: number
  resolveMs: number
  dir: 'up' | 'down' | 'flat'
  win: boolean
  mul: number
  payout: number
}
type Props = {
  bal: number
  // Сервер сверяет ставку с общей лентой (цена через 30 секунд) и платит; клиент только рисует
  onPredict: (side: Side, stake: number) => Promise<RubleResult | null>
}

const MIN_BET = 10
const W = 640, H = 260, PAD = 26
const WINDOW = 90          // тиков ленты на экране (тик = 1 секунда)
const DRAW_MS = 50         // точка отрисовки каждые 50 мс (плавность между тиками)
const SMOOTH = 0.12        // сглаживание движения к последнему тику
const POLL_MS = 600        // поллинг ленты с запасом перекрытия
const OVERLAP_S = 5        // каждый запрос забирает последние N секунд заново (от потерь)
const STALL_MS = 4000      // нет новых тиков столько — зовём ruble_ensure
const RESEED_MS = 12000    // всё ещё нет — пере-загружаем историю целиком
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
  const [news, setNews] = useState('Один курс для всех. Лента идёт всегда, даже когда ты спишь')
  const [hist, setHist] = useState<{ id: number; dir: string; win: boolean; pct: number }[]>([])
  const [, setTick] = useState(0)

  // Общая лента из БД. Тики приходят поллингом (иногда пачками) и проигрываются
  // в естественном темпе; отрисовка сглаживает движение между тиками.
  const drawRef = useRef<number[]>([])                 // отрисованные точки (каждые DRAW_MS)
  const priceRef = useRef(100)                         // сглаженная цена на экране
  const targetRef = useRef(100)                        // цена последнего проигранного тика
  const queueRef = useRef<{ ms: number; price: number }[]>([]) // тики на проигрывание
  const lastTickMsRef = useRef(0)                      // водяной знак загруженных тиков
  const lastPlayRef = useRef(0)
  const lastNewTickRef = useRef(0)                     // когда последний раз приходили тики
  const lastHealRef = useRef(0)
  const lastReseedRef = useRef(0)
  const pendingRef = useRef<{ res: RubleResult } | null>(null)
  const resultRef = useRef<{ win: boolean; pct: number } | null>(null)

  const ingest = (price: number, ms: number) => {
    if (!(ms > lastTickMsRef.current)) return
    lastTickMsRef.current = ms
    lastNewTickRef.current = Date.now()
    queueRef.current.push({ ms, price })
    if (queueRef.current.length > 200) queueRef.current.splice(0, queueRef.current.length - 200)
  }

  useEffect(() => {
    let alive = true

    const reseed = async () => {
      // сначала просим сервер дотянуть ленту (дёшево, идемпотентно), потом берём историю
      try { await supabase.rpc('ruble_ensure') } catch { /* сервер ответит и так */ }
      const { data, error } = await supabase.from('ruble_prices').select('tick_at,price')
        .order('tick_at', { ascending: false }).limit(WINDOW)
      if (error || !alive) return
      const rows = (data || []).reverse()
      if (!rows.length) return
      const first = Number(rows[0].price)
      drawRef.current = rows.map(r => Number(r.price))
      if (drawRef.current.length < WINDOW) drawRef.current = Array(WINDOW - drawRef.current.length).fill(first).concat(drawRef.current)
      while (drawRef.current.length > WINDOW * 2) drawRef.current.shift()
      priceRef.current = Number(rows[rows.length - 1].price)
      targetRef.current = priceRef.current
      queueRef.current = []
      lastTickMsRef.current = Date.parse(rows[rows.length - 1].tick_at)
      lastNewTickRef.current = Date.now()
    }
    const poll = async () => {
      if (!alive) return
      try {
        // перекрытие на OVERLAP_S секунд назад: потери и дыры не страшны, дедуп по времени
        const from = new Date(Math.max(0, lastTickMsRef.current - OVERLAP_S * 1000)).toISOString()
        const { data, error } = await supabase.from('ruble_prices').select('tick_at,price')
          .gt('tick_at', from).order('tick_at').limit(120)
        if (error || !alive) return
        ;(data || []).forEach(r => ingest(Number(r.price), Date.parse(r.tick_at)))
      } catch { /* следующий поллинг повторит */ }
    }

    reseed()
    const pollId = window.setInterval(poll, POLL_MS)
    // самозаживление: лента встала — дотягиваем сервером, не помогло — пере-загружаем историю
    const healId = window.setInterval(() => {
      if (!alive) return
      const stalled = Date.now() - lastNewTickRef.current
      if (stalled > RESEED_MS && Date.now() - lastReseedRef.current > RESEED_MS) {
        lastReseedRef.current = Date.now()
        reseed()
      } else if (stalled > STALL_MS && Date.now() - lastHealRef.current > 20000) {
        lastHealRef.current = Date.now()
        Promise.resolve(supabase.rpc('ruble_ensure')).catch(() => {})
      }
    }, 2000)
    return () => { alive = false; clearInterval(pollId); clearInterval(healId) }
  }, [])

  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // setInterval вместо rAF: не замирает в неактивных/встроенных окнах
    const loopId = window.setInterval(() => {
      const now = performance.now()
      // проигрываем очередь тиков: ~1/сек, пачка — с плавным ускорением
      const q = queueRef.current
      if (q.length && now - lastPlayRef.current >= Math.max(120, Math.min(1000, Math.floor(1000 / q.length)))) {
        lastPlayRef.current = now
        targetRef.current = q.shift()!.price
      }
      priceRef.current += (targetRef.current - priceRef.current) * (calm ? 0.6 : SMOOTH)
      // каждая итерация = новая точка отрисовки (интервал = DRAW_MS)
      drawRef.current.push(priceRef.current)
      if (drawRef.current.length > WINDOW * 2) drawRef.current.shift()
      // ставка сыграла, когда лента дошла до момента расчёта
      const p = pendingRef.current
      if (p && (lastTickMsRef.current >= p.res.resolveMs || Date.now() > p.res.resolveMs + 5000)) {
        pendingRef.current = null
        const pct = Math.round(((p.res.final - p.res.start) / p.res.start) * 10000) / 100
        resultRef.current = { win: p.res.win, pct }
        const pool = p.res.dir === 'flat' ? NEWS_FLAT : p.res.dir === 'up' ? NEWS_UP : NEWS_DOWN
        setNews(pool[Math.floor(Math.random() * pool.length)])
        setHist(h => [{ id: Date.now(), dir: p.res.dir, win: p.res.win, pct }, ...h].slice(0, 10))
        setBusy(false)
      }
      setTick(t => t + 1)
    }, DRAW_MS)
    return () => clearInterval(loopId)
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
    pendingRef.current = { res }
  }
  const cb = useRef({ onPredict })
  cb.current = { onPredict }

  // масштаб по отрисованной ленте
  const buf = drawRef.current
  const lo0 = Math.min(...buf), hi0 = Math.max(...buf)
  const mid = (lo0 + hi0) / 2, half = Math.max((hi0 - lo0) / 2, 0.4) * 1.3
  const y = (v: number) => PAD + (1 - (v - (mid - half)) / (2 * half)) * (H - 2 * PAD)
  const x = (i: number) => PAD + (i / Math.max(1, buf.length - 1)) * (W - 2 * PAD)
  const pts = buf.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const price = priceRef.current
  const slope = price - buf[Math.max(0, buf.length - 6)]
  const liveColor = slope >= 0 ? '#37c26e' : '#ff4d4d'
  const res = resultRef.current
  const pending = pendingRef.current
  const waitSec = pending ? Math.max(0, Math.ceil((pending.res.resolveMs - Date.now()) / 1000)) : 0

  return (
    <div className="wl-banner-card highlight" style={{ padding: '24px 16px 28px', textAlign: 'center' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • БИНАРНЫЕ ОПЦИОНЫ • ОДИН КУРС ДЛЯ ВСЕХ</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 28, margin: '12px 0 6px' }}>КУРС РУБЛЯ 📉📈</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, margin: '0 auto 12px', maxWidth: 560 }}>
        Общая биржевая лента: тик каждую секунду, идёт всегда и у всех одинаковая. Ставь «вверх»
        или «вниз» — если через {TICK_SECONDS} секунд курс пойдёт в твою сторону, забираешь x{PAYOUT}. ЦБ гарантирует*
      </p>
      <div style={{ color: 'var(--tx-secondary)', fontSize: 12, fontStyle: 'italic', margin: '0 auto 10px', maxWidth: 560, minHeight: 16 }} aria-live="polite">
        «{news}»
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Общий график курса рубля" style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto', background: '#1b1c1e', borderRadius: 12 }}>
        <line x1={PAD} y1={y(100)} x2={W - PAD} y2={y(100)} stroke="#6b6e74" strokeDasharray="4 4" strokeWidth="1" />
        <text x={W - PAD - 2} y={y(100) - 5} textAnchor="end" fontSize="11" fill="#6b6e74">базовый курс 100,00 ₽</text>
        <polyline points={pts} fill="none" stroke={liveColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(buf.length - 1)} cy={y(price)} r="4" fill={liveColor} />
        <text x={W - PAD - 8} y={PAD + 4} textAnchor="end" fontSize="14" fontWeight="800" fill={liveColor}>{fmt(price)} ₽</text>
        {pending && (
          <text x={PAD + 8} y={PAD + 8} fontSize="14" fontWeight="800" fill="#e8b53a">
            РАУНД ЗАКРОЕТСЯ ЧЕРЕЗ {waitSec} С…
          </text>
        )}
        {!pending && res && (
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
          {pending ? `…${waitSec}с` : `📈 Вверх (x${PAYOUT})`}
        </button>
        <button className="wl-btn-orange" disabled={busy} style={{ minHeight: 46, padding: '0 26px', fontWeight: 800, background: busy ? '#a03030' : undefined, opacity: busy ? 0.85 : 1 }} onClick={() => launch('down')}>
          {pending ? `…${waitSec}с` : `📉 Вниз (x${PAYOUT})`}
        </button>
      </div>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 12, marginTop: 10 }}>
        Выплата = ставка × {PAYOUT}. Исход решает общая лента на сервере: цена сейчас против цены через {TICK_SECONDS} секунд.
        *Гарантий нет. Сейчас на балансе {fmt(r2(bal))} SV₽.
      </p>
    </div>
  )
}
