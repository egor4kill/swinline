import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

type Currency = 'sv' | 'ar'

type PickRound = { id: string; stake: number; row: number; currency: Currency }

type PickResult = { kind: 'bust' | 'cash'; row: number; mult?: number; win?: number; full?: boolean } | null

type Props = {
  bal: number
  unit: string
  currency: Currency
  onStart: (stake: number) => Promise<string | null>
  onPick: (roundId: string, col: number) => Promise<any>
  onCash: (roundId: string) => Promise<any>
  onRestore: () => Promise<{ roundId: string; stake: number; row: number; currency: Currency } | null>
  onBal: (bal: number, log: { x: string; d: number } | null, currency: Currency) => void
}

const ROWS = 8
const MULT = [1, 1.45, 2.18, 3.16, 4.63, 6.84, 10.15, 15.03, 22.43]

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

// «Кирка»: 8 рядов по 3 блока, в каждом ряду один динамит.
// Кирка падает на выбранный блок: алмаз — ряд пройден, динамит — взрыв.
// Расклад скрыт на сервере, клиент показывает только то, что вернул RPC.
export default function PickGame({ bal, unit, currency, onStart, onPick, onCash, onRestore, onBal }: Props) {
  const [stake, setStake] = useState(currency === 'ar' ? '1' : '100')
  const [round, setRound] = useState<PickRound | null>(null)
  const [cleared, setCleared] = useState<number[]>([]) // колонки, выбитые по рядам (индекс ряда -> колонка)
  const [hits, setHits] = useState<Record<number, number>>({}) // взорванные блоки после проигрыша
  const [bombs, setBombs] = useState<number[] | null>(null)
  const [falling, setFalling] = useState<{ row: number; col: number } | null>(null)
  const [result, setResult] = useState<PickResult>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    onRestore().then(r => {
      if (!r) return
      setRound({ id: r.roundId, stake: r.stake, row: r.row, currency: r.currency })
      const rpcRow = Math.max(0, r.row - 1)
      setCleared([])
      setNotice('Продолжаем незавершённый спуск.')
      if (r.row > 0) {
        // ряд уже пройден, но какая колонка — сервер не хранит; показываем нейтрально
        setCleared(new Array(r.row).fill(-1) as unknown as number[])
      }
      void rpcRow
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const minBet = currency === 'ar' ? 1 : 10
  const potential = round ? Math.floor(round.stake * (MULT[round.row] ?? 1) * 100) / 100 : 0

  const start = async () => {
    if (busy || round) return
    const s = Math.floor(parseFloat(stake) || 0)
    if (!(s >= minBet)) { setNotice(`Минимальная ставка: ${minBet} ${unit}`); return }
    setBusy(true)
    setNotice('')
    setResult(null)
    setHits({})
    setBombs(null)
    setCleared([])
    const id = await onStart(s)
    setBusy(false)
    if (!id) return
    setRound({ id, stake: s, row: 0, currency })
  }

  const pick = async (col: number) => {
    if (!round || falling || busy || round.row >= ROWS) return
    setBusy(true)
    setNotice('')
    setFalling({ row: round.row, col })
    // время падения кирки — 450 мс, потом смотрим ответ сервера
    await new Promise(r => setTimeout(r, 450))
    const data = await onPick(round.id, col)
    if (!data) {
      setFalling(null)
      setBusy(false)
      return
    }
    if (data.hit) {
      setBombs(data.bombs || null)
      setHits({ [data.row - 1]: col })
      setFalling(null)
      setResult({ kind: 'bust', row: (data.row ?? 1) - 1 })
      setNotice(`💥 Динамит в ряду ${data.row}. Ставка сгорела.`)
      setRound(null)
      setCleared([])
      setBusy(false)
      return
    }
    const nextRow = Number(data.row)
    setCleared(prev => [...prev, col])
    setFalling(null)
    if (data.auto_cashed) {
      setResult({ kind: 'cash', row: nextRow, mult: Number(data.mul), win: Number(data.win), full: true })
      setBombs(data.bombs || null)
      setNotice(`🎉 Башня пройдена! x${data.mul} — ${fmt(Number(data.win))} ${unit}`)
      onBal(Number(data.bal), { x: `Выигрыш в «Кирке» (x${data.mul})`, d: Number(data.win) }, round.currency)
      setRound(null)
      setBusy(false)
      return
    }
    setRound({ ...round, row: nextRow })
    setBusy(false)
  }

  const cash = async () => {
    if (!round || busy || round.row < 1) return
    setBusy(true)
    const data = await onCash(round.id)
    setBusy(false)
    if (!data) return
    setBombs(data.bombs || null)
    setResult({ kind: 'cash', row: round.row, mult: Number(data.mul), win: Number(data.win) })
    setNotice(`💰 Забрал x${data.mul} — ${fmt(Number(data.win))} ${unit}`)
    onBal(Number(data.bal), { x: `Выигрыш в «Кирке» (x${data.mul})`, d: Number(data.win) }, round.currency)
    setRound(null)
  }

  const activeRow = falling ? falling.row : (round?.row ?? -1)

  return (
    <div className="wl-banner-card highlight" style={{ padding: '20px 14px 26px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • ШАХТА</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 'clamp(22px, 6vw, 28px)', margin: '10px 0 6px' }}>КИРКА ⛏️</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 13.5, margin: '0 auto 14px', maxWidth: 560 }}>
        Восемь рядов по три блока — под одним из них динамит. Кидай кирку в блок:
        алмаз — множитель растёт, динамит — взрыв. Забирай выигрыш в любой момент.
      </p>

      {/* Лесенка множителей слева от башни */}
      <div className="pick-tower-wrap">
        <div className="pick-ladder">
          {Array.from({ length: ROWS + 1 }).map((_, i) => (
            <div key={i} className={`pick-ladder-step ${(round?.row ?? 0) >= i ? 'reached' : ''} ${i === 0 ? 'base' : ''}`}>
              x{MULT[i]}
            </div>
          ))}
        </div>

        <div className="pick-tower">
          {Array.from({ length: ROWS }).map((_, rowIdx) => {
            const rowFromTop = ROWS - 1 - rowIdx
            const isDone = rowFromTop < (round?.row ?? (result ? result.row : 0)) || cleared.length > rowFromTop
            const clearedCol = cleared[rowFromTop]
            const isBusted = hits[rowFromTop] !== undefined
            const isActive = round && rowFromTop === round.row && !falling
            return (
              <div key={rowIdx} className={`pick-row ${rowFromTop === activeRow ? 'active' : ''}`}>
                {rowFromTop === activeRow && falling && (
                  <div className="pick-falling" style={{ left: `${falling.col * 33.33 + 16.66}%` }}>
                    ⛏️
                  </div>
                )}
                {[0, 1, 2].map(col => {
                  const clearedHere = isDone && clearedCol === col
                  const bombHere = isBusted && hits[rowFromTop] === col
                  const ghostBomb = bombs && (isDone || isBusted || !round) && bombs[rowFromTop] === col && !clearedHere && !bombHere
                  return (
                    <button
                      key={col}
                      type="button"
                      className={[
                        'pick-block',
                        clearedHere ? 'cleared' : '',
                        bombHere ? 'boom' : '',
                        ghostBomb ? 'ghost-bomb' : '',
                        isActive ? 'pickable' : ''
                      ].join(' ')}
                      disabled={!isActive}
                      onClick={() => pick(col)}
                      aria-label={`Ряд ${rowFromTop + 1}, блок ${col + 1}`}
                    >
                      {clearedHere && <span className="pick-gem">💎</span>}
                      {bombHere && <span className="pick-bomb">🧨</span>}
                      {ghostBomb && <span className="pick-bomb ghost">🧨</span>}
                      {!clearedHere && !bombHere && <span className="pick-stone" />}
                    </button>
                  )
                })}
              </div>
            )
          })}
          {round && (
            <div className="pick-target-hint">Ряд {round.row + 1} из {ROWS} — выбери блок</div>
          )}
        </div>
      </div>

      {result && (
        <div className={`pick-result ${result.kind}`}>
          {result.kind === 'bust'
            ? <>Взрыв на ряду {result.row + 1}. Ставка {fmt(round ? 0 : 0)}{result.row >= 0 ? '' : ''}сгорела.</>
            : <>Забрано <b>x{result.mult?.toFixed(2)}</b> — {fmt(result.win ?? 0)} {unit} {result.full ? '(вся башня!)' : ''}</>}
        </div>
      )}

      {!round ? (
        <>
          <div className="pick-controls">
            <input
              aria-label={`Ставка, ${unit}`}
              inputMode="numeric"
              value={stake}
              onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
              className="pick-stake"
            />
            {[currency === 'ar' ? [1, 5, 25, 100] : [100, 500, 1000, 5000]].flat().map(v => (
              <button key={v} type="button" className="wl-round-btn" onClick={() => setStake(String(v))}>{v}</button>
            ))}
            <button type="button" className="wl-round-btn" onClick={() => setStake(String(Math.max(minBet, Math.floor(bal))))}>Всё</button>
          </div>
          <button
            type="button"
            className="wl-btn-orange"
            style={{ minHeight: 48, padding: '0 30px', fontWeight: 800, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            onClick={start}
          >
            {busy ? 'Ставим…' : 'Начать спуск'}
          </button>
        </>
      ) : (
        <div className="pick-cashbar">
          <div className="pick-cashbar-info">
            <span>Ряд {round.row}/{ROWS}</span>
            <b>Забрать: {fmt(potential)} {unit}</b>
          </div>
          <button
            type="button"
            className="wl-btn-green"
            style={{ minHeight: 48, padding: '0 22px', fontWeight: 800 }}
            disabled={busy || round.row < 1}
            onClick={cash}
          >
            {round.row < 1 ? 'Разбей первый ряд' : 'Забрать'}
          </button>
        </div>
      )}

      {notice && <p className="pick-notice">{notice}</p>}
      <p className="pick-fine">
        В каждом ряду 1 из 3 блоков — динамит. Множитель ряда i = 1.5^i × 0.97 (теоретический возврат ~97%).
      </p>
    </div>
  )
}
