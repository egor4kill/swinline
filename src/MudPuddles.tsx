import { useEffect, useRef, useState } from 'react'
import { N, multiplier, r2 } from './puddlesLogic'

type PickResult = {
  hit: boolean
  opened: number[]
  mines?: number[]
  auto_cashed?: boolean
  mul?: number
  win?: number
}
type CashResult = { mul: number; win: number; mines: number[] }
type Props = {
  bal: number
  unit: string
  // Раунд, раскладка луж и выплаты — на сервере; клиент только показывает
  onStart: (stake: number, mines: number) => Promise<string | null>
  onPick: (roundId: string, cell: number) => Promise<PickResult | null>
  onCash: (roundId: string) => Promise<CashResult | null>
  onRestore: () => Promise<{ roundId: string; stake: number; mines: number; opened: number[]; currency: 'sv' | 'ar' } | null>
}
type Phase = 'idle' | 'play' | 'lost' | 'cashed'
const MIN_BET = 10
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

// Стили поля здесь же, чтобы заменить нужно было один файл
const TILE_CSS = `
.mp-grid{width:100%;max-width:380px;grid-template-columns:repeat(5,minmax(0,1fr))}
.mp-grid .mp-tile{min-width:0;overflow:hidden}
.mp-grid .mp-tile{background:linear-gradient(145deg,#3a3d43,#2a2c31);border:1px solid #62666e;box-shadow:inset 0 1px 0 #ffffff1a,0 3px 0 #0b0b0c}
.mp-grid .mp-tile:empty::after{content:'?';color:#a3a9b3;font-weight:800;font-size:clamp(16px,5vw,24px)}
.mp-grid .mp-tile:hover:not(:disabled){background:linear-gradient(145deg,#4a3320,#33261a);border-color:#ff6a00}
.mp-grid .mp-tile:disabled:empty{opacity:.6}
.mp-grid .mp-tile.safe{background:#17301f;border-color:#4cd08a;box-shadow:none}
.mp-grid .mp-tile.boom{background:#3a1d12;border-color:#ff4d4d;box-shadow:none}
`

const Puddle = () => (
  <svg viewBox="0 0 40 40" width="70%" height="70%" aria-hidden="true">
    <ellipse cx="20" cy="25" rx="17" ry="9" fill="#6b4423" />
    <ellipse cx="15" cy="23" rx="6" ry="2.2" fill="#8a5a33" />
    <circle cx="26" cy="14" r="2.5" fill="#6b4423" /><circle cx="30" cy="9" r="1.6" fill="#6b4423" />
  </svg>
)

export default function MudPuddles({ bal, unit, onStart, onPick, onCash, onRestore }: Props) {
  const [stake, setStake] = useState('100')
  const [mines, setMines] = useState(3)
  const [roundUnit, setRoundUnit] = useState(unit)
  const money = (n: number, u: string = roundUnit) => fmt(n) + ' ' + u
  const minBet = unit === 'АР' ? 1 : 10
  const [phase, setPhase] = useState<Phase>('idle')
  const [open, setOpen] = useState<number[]>([])
  const [boom, setBoom] = useState<number | null>(null)
  const [field, setField] = useState<number[] | null>(null) // раскладка показывается после конца раунда
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const roundRef = useRef<string | null>(null)
  const stakeRef = useRef(0)
  const openRef = useRef<number[]>([])
  const minesRef = useRef(3)
  const cb = useRef({ onPick, onCash })
  cb.current = { onPick, onCash }

  // Раунд живёт на сервере: после перезагрузки страницы восстанавливаем незакрытый
  useEffect(() => {
    onRestore().then(r => {
      if (!r) return
      roundRef.current = r.roundId
      stakeRef.current = r.stake
      minesRef.current = r.mines
      openRef.current = r.opened || []
      setStake(String(r.stake))
      setMines(r.mines)
      setRoundUnit(r.currency === 'ar' ? 'АР' : 'SV₽')
      setOpen(r.opened || [])
      setBoom(null); setField(null); setPhase('play'); setMsg('')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = async () => {
    if (busy) return
    const s = Math.floor(parseFloat(stake))
    if (!(s >= minBet)) return setMsg(`Минимальная ставка: ${minBet} ${unit}`)
    setBusy(true)
    const id = await onStart(s, mines)
    setBusy(false)
    if (!id) return
    roundRef.current = id
    stakeRef.current = s
    minesRef.current = mines
    openRef.current = []
    setRoundUnit(unit)
    setOpen([]); setBoom(null); setField(null); setPhase('play'); setMsg('')
  }

  const cash = async () => {
    const r = roundRef.current
    if (!r || openRef.current.length < 1 || busy) return
    setBusy(true)
    const res = await cb.current.onCash(r)
    setBusy(false)
    if (!res) return
    setField(res.mines || null)
    setPhase('cashed')
    setMsg(`Забрал ${money(res.win)} (x${res.mul})`)
  }

  const pick = async (i: number) => {
    const r = roundRef.current
    if (!r || busy || openRef.current.includes(i)) return
    setBusy(true)
    const res = await cb.current.onPick(r, i)
    setBusy(false)
    if (!res) return
    if (res.hit) {
      setBoom(i)
      setField(res.mines || [])
      setPhase('lost')
      setMsg('Лужа! Ставка осталась в грязи.')
      return
    }
    openRef.current = res.opened || [...openRef.current, i]
    setOpen(openRef.current)
    if (res.auto_cashed) {
      setField(res.mines || null)
      setPhase('cashed')
      setMsg(`Открыл всё безопасное — автоматом забрано ${money(res.win || 0)} (x${res.mul})`)
    }
  }

  const randomPick = () => {
    const left = Array.from({ length: N }, (_, i) => i).filter(i => !openRef.current.includes(i))
    if (left.length) pick(left[Math.floor(Math.random() * left.length)])
  }

  const k = open.length
  const playing = phase === 'play'
  const m = minesRef.current
  const cur = multiplier(m, k)
  const next = k < N - m ? multiplier(m, k + 1) : null
  const st = stakeRef.current

  return (
    <div className="wl-banner-card highlight" style={{ padding: '24px 16px 28px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
      <style>{TILE_CSS}</style>
      <span className="wl-banner-tag">ИГРЫ 24/7 • МИНЫ</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 'clamp(22px, 6vw, 28px)', margin: '12px 0 6px' }}>ГРЯЗЕВЫЕ ЛУЖИ 🐷</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, margin: '0 auto 14px', maxWidth: 520 }}>
        Открывай клетки поля. Под каждой либо чистое место, либо лужа. Чем больше открыл, тем выше икс. Попал в лужу и ставка сгорела, вовремя нажал «Забрать» и деньги твои.
      </p>

      <div className="mp-grid" role="group" aria-label="Поле 5 на 5">
        {Array.from({ length: N }, (_, i) => {
          const isOpen = open.includes(i), isBoom = boom === i
          const revealMine = !playing && field?.includes(i) && !isBoom
          const cls = isBoom ? 'boom' : isOpen ? 'safe' : revealMine ? 'ghost' : ''
          return (
            <button key={i} className={`mp-tile ${cls}`} disabled={!playing || busy || isOpen} onClick={() => pick(i)} aria-label={`Клетка ${i + 1}`}>
              {isBoom || revealMine ? <Puddle /> : isOpen ? '🐷' : ''}
            </button>
          )
        })}
      </div>

      <div style={{ margin: '14px 0 8px', minHeight: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} aria-live="polite">
        {playing ? (
          <>
            <div style={{ fontFamily: 'var(--font-d)', fontSize: 26, color: 'var(--org)' }}>x{cur} {k > 0 && <span style={{ fontSize: 15, color: 'var(--tx-secondary)' }}>= {money(r2(st * cur))}</span>}</div>
            <div style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>{k === 0 ? 'Нажми на любую клетку поля' : next ? `Следующая клетка: x${next}` : 'Это последняя безопасная клетка'}</div>
          </>
        ) : <div style={{ fontWeight: 700 }}>{msg || 'Выбери число луж и ставку, потом нажми «Начать»'}</div>}
      </div>

      {/* Фиксированная высота панели: окно не прыгает при переходе между «настройка» и «игра» */}
      <div style={{ minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {playing ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="wl-round-btn" onClick={randomPick} disabled={busy}>Случайная клетка</button>
          <button className="wl-btn-orange" style={{ minHeight: 46, padding: '0 22px', fontWeight: 800, opacity: k < 1 || busy ? 0.5 : 1 }} disabled={k < 1 || busy} onClick={cash}>
            Забрать {k > 0 ? money(r2(st * cur)) : ''}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Количество луж">
            <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--tx-secondary)' }}>Луж на поле:</span>
            {[1, 3, 5, 10].map(v => <button key={v} className={`wl-round-btn ${mines === v ? 'active' : ''}`} aria-pressed={mines === v} onClick={() => setMines(v)}>{v}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label={`Ставка, ${unit}`} inputMode="numeric" value={stake} onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
              style={{ width: 110, padding: 12, borderRadius: 10, border: '1px solid var(--line, #2d2f33)', background: '#262729', color: 'inherit', fontWeight: 800, fontSize: 18, textAlign: 'center' }} />
            {(unit === 'АР' ? [1, 5, 10, 50] : [10, 100, 500]).map(v => <button key={v} className="wl-round-btn" onClick={() => setStake(String(v))}>{v}</button>)}
            <button className="wl-round-btn" onClick={() => setStake(String(Math.max(minBet, Math.floor(bal))))}>Всё</button>
            <button className="wl-btn-orange" style={{ minHeight: 46, padding: '0 22px', fontWeight: 800, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={start}>{busy ? 'Старт…' : phase === 'idle' ? 'Начать' : 'Ещё раунд'}</button>
          </div>
        </>
      )}
      </div>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 12, marginTop: 10 }}>Баланс: {money(r2(bal), unit)}. Раскладку луж и выплату решает сервер.</p>
    </div>
  )
}
