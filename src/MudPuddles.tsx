import { useEffect, useRef, useState } from 'react'
import { N, multiplier, newRound, r2 } from './puddlesLogic'

type Props = {
  bal: number
  onBet: (stake: number) => boolean // списывает ставку, вернёт false если нельзя
  onWin: (amount: number, label: string) => void // начисляет выигрыш
}
type Phase = 'idle' | 'play' | 'lost' | 'cashed'
const MIN_BET = 10
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

const Puddle = () => (
  <svg viewBox="0 0 40 40" width="70%" height="70%" aria-hidden="true">
    <ellipse cx="20" cy="25" rx="17" ry="9" fill="#6b4423" />
    <ellipse cx="15" cy="23" rx="6" ry="2.2" fill="#8a5a33" />
    <circle cx="26" cy="14" r="2.5" fill="#6b4423" /><circle cx="30" cy="9" r="1.6" fill="#6b4423" />
  </svg>
)

export default function MudPuddles({ bal, onBet, onWin }: Props) {
  const [stake, setStake] = useState('100')
  const [mines, setMines] = useState(3)
  const [phase, setPhase] = useState<Phase>('idle')
  const [open, setOpen] = useState<number[]>([])
  const [boom, setBoom] = useState<number | null>(null)
  const [field, setField] = useState<boolean[] | null>(null) // показываем только после конца раунда
  const [msg, setMsg] = useState('')
  const round = useRef<{ mines: boolean[]; stake: number; m: number } | null>(null)
  const openRef = useRef<number[]>([])
  const cb = useRef({ onWin })
  cb.current = { onWin }

  // Ушёл с вкладки посреди раунда: забираем текущий выигрыш (или возвращаем ставку, если ничего не открыто)
  useEffect(() => () => {
    const r = round.current
    if (!r) return
    const k = openRef.current.length
    cb.current.onWin(r2(r.stake * multiplier(r.m, k)), k ? 'авто-вывод' : 'возврат')
    round.current = null
  }, [])

  const finish = (p: Phase, text: string, r: NonNullable<typeof round.current>) => {
    setField(r.mines); setPhase(p); setMsg(text)
    round.current = null // защита от двойного выигрыша
  }

  const start = () => {
    const s = Math.floor(parseFloat(stake))
    if (!(s >= MIN_BET)) return setMsg(`Минимальная ставка: ${MIN_BET} SV₽`)
    if (!onBet(s)) return
    round.current = { mines: newRound(mines), stake: s, m: mines }
    openRef.current = []
    setOpen([]); setBoom(null); setField(null); setPhase('play'); setMsg('')
  }

  const cash = () => {
    const r = round.current
    const k = openRef.current.length
    if (!r || k < 1) return
    const win = r2(r.stake * multiplier(r.m, k))
    cb.current.onWin(win, `${multiplier(r.m, k)}x`)
    finish('cashed', `Забрал ${fmt(win)} SV₽ (x${multiplier(r.m, k)})`, r)
  }

  const pick = (i: number) => {
    const r = round.current
    if (!r || openRef.current.includes(i)) return
    if (r.mines[i]) { setBoom(i); finish('lost', 'Лужа! Ставка осталась в грязи.', r); return }
    openRef.current = [...openRef.current, i]
    setOpen(openRef.current)
    if (openRef.current.length === N - r.m) cash() // открыл всё безопасное — автоматически забираем
  }

  const randomPick = () => {
    const left = Array.from({ length: N }, (_, i) => i).filter(i => !openRef.current.includes(i))
    if (left.length) pick(left[Math.floor(Math.random() * left.length)])
  }

  const k = open.length
  const playing = phase === 'play'
  const m = round.current?.m ?? mines
  const cur = multiplier(m, k)
  const next = k < N - m ? multiplier(m, k + 1) : null
  const st = round.current?.stake ?? 0

  return (
    <div className="wl-banner-card highlight" style={{ padding: '24px 16px 28px', textAlign: 'center' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • МИНЫ</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 28, margin: '12px 0 6px' }}>ГРЯЗЕВЫЕ ЛУЖИ 🐷</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, margin: '0 auto 14px', maxWidth: 520 }}>
        Открывай клетки поля. Под каждой либо чистое место, либо лужа. Чем больше открыл, тем выше икс. Попал в лужу и ставка сгорела, вовремя нажал «Забрать» и деньги твои.
      </p>

      <div className="mp-grid" role="group" aria-label="Поле 5 на 5">
        {Array.from({ length: N }, (_, i) => {
          const isOpen = open.includes(i), isBoom = boom === i
          const revealMine = !playing && field?.[i] && !isBoom
          const cls = isBoom ? 'boom' : isOpen ? 'safe' : revealMine ? 'ghost' : ''
          return (
            <button key={i} className={`mp-tile ${cls}`} disabled={!playing || isOpen} onClick={() => pick(i)} aria-label={`Клетка ${i + 1}`}>
              {isBoom || revealMine ? <Puddle /> : isOpen ? '🐷' : ''}
            </button>
          )
        })}
      </div>

      <div style={{ margin: '14px 0 4px', minHeight: 48 }} aria-live="polite">
        {playing ? (
          <>
            <div style={{ fontFamily: 'var(--font-d)', fontSize: 26, color: 'var(--org)' }}>x{cur} {k > 0 && <span style={{ fontSize: 15, color: 'var(--tx-secondary)' }}>= {fmt(r2(st * cur))} SV₽</span>}</div>
            <div style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>{next ? `Следующая клетка: x${next}` : 'Это последняя безопасная клетка'}</div>
          </>
        ) : <div style={{ fontWeight: 700 }}>{msg}</div>}
      </div>

      {playing ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="wl-round-btn" onClick={randomPick}>Случайная клетка</button>
          <button className="wl-btn-orange" style={{ minHeight: 46, padding: '0 22px', fontWeight: 800, opacity: k < 1 ? 0.5 : 1 }} disabled={k < 1} onClick={cash}>
            Забрать {k > 0 ? fmt(r2(st * cur)) + ' SV₽' : ''}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Количество луж">
            <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--tx-secondary)' }}>Луж на поле:</span>
            {[1, 3, 5, 10].map(v => <button key={v} className={`wl-round-btn ${mines === v ? 'active' : ''}`} aria-pressed={mines === v} onClick={() => setMines(v)}>{v}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label="Ставка, SV₽" inputMode="numeric" value={stake} onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
              style={{ width: 110, padding: 12, borderRadius: 10, border: '1px solid var(--line, #2d2f33)', background: '#262729', color: 'inherit', fontWeight: 800, fontSize: 18, textAlign: 'center' }} />
            {[10, 100, 500].map(v => <button key={v} className="wl-round-btn" onClick={() => setStake(String(v))}>{v}</button>)}
            <button className="wl-round-btn" onClick={() => setStake(String(Math.max(MIN_BET, Math.floor(bal))))}>Всё</button>
            <button className="wl-btn-orange" style={{ minHeight: 46, padding: '0 22px', fontWeight: 800 }} onClick={start}>{phase === 'idle' ? 'Начать' : 'Ещё раунд'}</button>
          </div>
        </>
      )}
      <p style={{ color: 'var(--tx-secondary)', fontSize: 12, marginTop: 10 }}>Баланс: {fmt(r2(bal))} SV₽. Выплата = ставка × икс.</p>
    </div>
  )
}
