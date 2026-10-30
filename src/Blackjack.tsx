import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { rankOf, suitOf, isRed, handValue } from './blackjackLogic'
import { r2 } from './logic'

type Round = {
  id: string
  stake: number
  currency: 'sv' | 'ar'
  doubled: boolean
  playerCards: number[]
  dealerVisible: number
  playerValue: number
  status: 'play' | 'won' | 'lost' | 'push' | 'blackjack'
  payout: number
  dealerCards: number[] | null
}

type Props = {
  bal: number
  currency: 'sv' | 'ar'
  unit: string
  // Синхронизация баланса и лога: сервер сам считает ставки и выплаты
  onBal: (bal: number, log: { x: string; d: number } | null, currency: 'sv' | 'ar') => void
  notify: (m: string) => void
  onNeedAuth: () => void
}

const MIN_BET = 10
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

const STATUS_TEXT: Record<string, string> = {
  won: 'ВЫИГРЫШ x2',
  blackjack: 'БЛЭКДЖЕК x2.5',
  push: 'НИЧЬЯ — ставка возвращена',
  lost: 'ПРОИГРЫШ',
}

function Card({ card, hidden }: { card?: number; hidden?: boolean }) {
  if (hidden || card === undefined) {
    return (
      <div style={{
        width: 52, height: 76, borderRadius: 7, flexShrink: 0,
        background: 'repeating-linear-gradient(45deg, #26314a, #26314a 5px, #1c2438 5px, #1c2438 10px)',
        border: '1px solid #3c4a68', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, color: '#4a5a7d',
      }}>
        🐷
      </div>
    )
  }
  const red = isRed(card)
  return (
    <div style={{
      width: 52, height: 76, borderRadius: 7, flexShrink: 0,
      background: '#f4f2ee', border: '1px solid #c9c4bb',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: red ? '#c0392b' : '#1a1a1a', lineHeight: 1.05,
    }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{rankOf(card)}</div>
      <div style={{ fontSize: 20 }}>{suitOf(card)}</div>
    </div>
  )
}

export default function Blackjack({ bal, currency, unit, onBal, notify, onNeedAuth }: Props) {
  const [stake, setStake] = useState('100')
  const [round, setRound] = useState<Round | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [restored, setRestored] = useState(false)

  // Раздача живёт в БД: после перезагрузки страницы доигрываем текущую
  useEffect(() => {
    supabase.from('bj_rounds').select('id,stake,currency,doubled,player_cards,dealer_visible,status,payout')
      .eq('status', 'play').order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRound({
            id: data.id, stake: Number(data.stake),
            currency: (data.currency === 'ar' ? 'ar' : 'sv') as 'sv' | 'ar',
            doubled: Boolean(data.doubled),
            playerCards: (data.player_cards || []).map(Number),
            dealerVisible: Number(data.dealer_visible),
            playerValue: handValue((data.player_cards || []).map(Number)),
            status: 'play', payout: 0, dealerCards: null,
          })
        }
        setRestored(true)
      })
  }, [])

  const roundUnit = round ? (round.currency === 'ar' ? 'АР' : 'SV₽') : unit
  const money = (n: number, u: string = roundUnit) => fmt(n) + ' ' + u
  const minBet = unit === 'АР' ? 1 : 10

  const err = (e: { message?: string } | null, fallback: string) => {
    const m = e?.message || fallback
    setMsg(m)
    if (/войти/i.test(m)) onNeedAuth()
    else notify(`❌ ${m}`)
  }

  const deal = async () => {
    if (busy) return
    const s = Math.floor(parseFloat(stake))
    if (!(s >= minBet)) { setMsg(`Минимальная ставка: ${minBet} ${unit}`); return }
    setBusy(true)
    const cur = currency
    const { data, error } = await supabase.rpc('bj_deal', { p_stake: s, p_currency: cur })
    setBusy(false)
    if (error || !data) return err(error, 'Не удалось раздать')
    const realCur = (data.currency === 'ar' ? 'ar' : cur) as 'sv' | 'ar'
    onBal(Number(data.bal), { x: 'Ставка в «Свинджеке»', d: -s }, realCur)
    const resolved = data.status !== 'play'
    if (resolved && Number(data.payout) > 0) {
      const label = data.status === 'blackjack' ? 'БЛЭКДЖЕК! Выигрыш в «Свинджеке» (x2.5)' : 'Выигрыш в «Свинджеке»'
      onBal(Number(data.bal), { x: label, d: Number(data.payout) }, realCur)
    }
    setRound({
      id: data.round_id, stake: s, currency: realCur, doubled: false,
      playerCards: (data.player_cards || []).map(Number),
      dealerVisible: Number(data.dealer_visible),
      playerValue: Number(data.player_value),
      status: data.status, payout: Number(data.payout), dealerCards: null,
    })
    setMsg(resolved ? (STATUS_TEXT[data.status] || data.status) : '')
  }

  const act = async (kind: 'hit' | 'stand' | 'double') => {
    if (busy || !round || round.status !== 'play') return
    setBusy(true)
    const cur = round.currency
    const rpc = kind === 'hit' ? 'bj_hit' : kind === 'stand' ? 'bj_stand' : 'bj_double'
    const { data, error } = await supabase.rpc(rpc, { p_round: round.id })
    setBusy(false)
    if (error || !data) return err(error, 'Ход не принят')
    const moneyNow = (n: number) => money(n, cur)
    if (kind === 'double') {
      onBal(Number(data.bal), { x: `Дабл в «Свинджеке» (+${moneyNow(round.stake)})`, d: -round.stake }, cur)
    }
    setRound(prev => prev ? {
      ...prev,
      playerCards: (data.player_cards || []).map(Number),
      playerValue: Number(data.player_value),
      dealerCards: data.dealer_cards ? (data.dealer_cards as number[]).map(Number) : null,
      status: data.status,
      payout: Number(data.payout),
    } : prev)
    if (data.status && data.status !== 'play') {
      const payout = Number(data.payout)
      if (payout > 0) {
        const label = data.status === 'push' ? 'Ничья в «Свинджеке» — ставка возвращена' : 'Выигрыш в «Свинджеке»'
        onBal(Number(data.bal), { x: label, d: payout }, cur)
      }
      setMsg(data.status === 'lost' && Number(data.player_value) > 21 ? 'ПЕРЕБОР' : (STATUS_TEXT[data.status] || data.status))
      notify(data.status === 'push' ? 'Ничья — ставка возвращена' : data.status === 'won' ? `Выигрыш ${moneyNow(payout)}!` : '')
    } else {
      onBal(Number(data.bal), null, cur)
    }
  }

  const playing = round?.status === 'play'
  const resolved = round && round.status !== 'play'
  const dealerValue = round?.dealerCards ? handValue(round.dealerCards) : null

  return (
    <div className="wl-banner-card highlight" style={{ padding: '24px 16px 28px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • КАРТЫ</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 'clamp(22px, 6vw, 28px)', margin: '12px 0 6px' }}>СВИНДЖЕК 🐷🃏</h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, margin: '0 auto 14px', maxWidth: 560 }}>
        Набери 21 или больше крупье, но не перебери. Блэкджек платит x2.5, ничья возвращает ставку.
        Колода и крупье — на сервере, карта дилера втемную.
      </p>

      {/* Стол */}
      <div style={{
        maxWidth: 640, width: '100%', margin: '0 auto', background: '#1b1c1e', borderRadius: 12, padding: '18px 16px',
        display: 'flex', flexDirection: 'column', gap: 14, minHeight: 240,
      }}>
        {/* Рука дилера */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>
            СВИН-КРУПЬЕ {dealerValue !== null ? `— ${dealerValue}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', minHeight: 78 }}>
            {round ? (
              <>
                <Card card={round.dealerVisible} />
                {round.dealerCards
                  ? round.dealerCards.slice(1).map((c, i) => <Card key={i} card={c} />)
                  : <Card hidden />}
              </>
            ) : (
              <div style={{ color: 'var(--tx-muted)', fontSize: 13, alignSelf: 'center' }}>Раздай карты, чтобы начать</div>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #3a3d43' }} />

        {/* Рука игрока */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>
            ТЫ {round ? `— ${round.playerValue}${round.playerValue > 21 ? ' (перебор)' : ''}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', minHeight: 78 }}>
            {round ? round.playerCards.map((c, i) => <Card key={i} card={c} />) : null}
          </div>
        </div>

        {/* Статус раздачи */}
        <div style={{ minHeight: 24, fontSize: 15, fontWeight: 800 }} aria-live="polite">
          {resolved && round && (
            <span style={{ color: round.status === 'won' || round.status === 'blackjack' ? 'var(--green)' : round.status === 'push' ? '#94a3b8' : '#ff4d4d' }}>
              {STATUS_TEXT[round.status]}
              {round.payout > 0 ? ` • +${money(round.payout)}` : round.status === 'lost' ? ' • −' + money(r2(round.stake * (round.doubled ? 2 : 1))) : ''}
            </span>
          )}
          {playing && msg && <span style={{ color: '#e8b53a' }}>{msg}</span>}
        </div>
      </div>

      {/* Управление */}
      <div style={{ minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: 14 }}>
        {playing ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="wl-btn-orange" disabled={busy} style={{ minHeight: 46, padding: '0 22px', fontWeight: 800 }} onClick={() => act('hit')}>
              🃏 Ещё
            </button>
            <button className="wl-btn-green" disabled={busy} style={{ minHeight: 46, padding: '0 22px', fontWeight: 800 }} onClick={() => act('stand')}>
              ✋ Хватит
            </button>
            {round && round.playerCards.length === 2 && !round.doubled && (
              <button className="wl-btn-orange" disabled={busy} style={{ minHeight: 46, padding: '0 22px', fontWeight: 800, background: '#7c3aed' }} onClick={() => act('double')}>
                ⏫ Дабл (+{money(round.stake)})
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <input aria-label={`Ставка, ${unit}`} inputMode="numeric" value={stake} onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
                style={{ width: 110, padding: 12, borderRadius: 10, border: '1px solid var(--line, #2d2f33)', background: '#262729', color: 'inherit', fontWeight: 800, fontSize: 18, textAlign: 'center' }} />
              {(unit === 'АР' ? [1, 5, 10, 50] : [10, 100, 500]).map(v => <button key={v} className="wl-round-btn" onClick={() => setStake(String(v))}>{v}</button>)}
              <button className="wl-round-btn" onClick={() => setStake(String(Math.max(minBet, Math.floor(bal))))}>Всё</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="wl-btn-orange" disabled={busy || !restored} style={{ minHeight: 46, padding: '0 30px', fontWeight: 800, opacity: busy ? 0.6 : 1 }} onClick={deal}>
                {busy ? 'Раздаём…' : resolved ? 'Ещё раздачу' : 'Раздать карты'}
              </button>
            </div>
          </>
        )}
      </div>

      <p style={{ color: 'var(--tx-secondary)', fontSize: 12, marginTop: 10 }}>
        Выплата x2 за победу, x2.5 за блэкджек (туз + картинка), ничья возвращает ставку.
        Крупье добирает до 17. Дабл — только на первых двух картах. Сейчас на балансе {money(r2(bal), unit)}.
      </p>
    </div>
  )
}
