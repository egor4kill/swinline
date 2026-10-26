import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { fmtSV } from './casinoStripHelpers'

type Win = { username: string; game: string; win: number; at: string }

const GAME_NAME: Record<string, string> = {
  wheel: 'Корыто Фортуны',
  plinko: 'Плинко',
  puddles: 'Грязевые лужи',
  ruble: 'Курс рубля',
  jackpot: 'ХРЯК-ПОТ',
  cashback: 'Кэшбэк',
}

// Казино-полоса: Хряк-пот с живым горшком + бегущая лента чужих выигрышей.
// Realtime не доставляет события — поллинг каждые 5 секунд.
export default function CasinoStrip() {
  const [pot, setPot] = useState(0)
  const [lastWinner, setLastWinner] = useState('')
  const [wins, setWins] = useState<Win[]>([])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const { data } = await supabase.from('casino_jackpot').select('pot,last_winner').limit(1).maybeSingle()
        if (alive && data) {
          setPot(Number(data.pot || 0))
          setLastWinner(data.last_winner || '')
        }
        const { data: w } = await supabase.rpc('recent_wins')
        if (alive && w) setWins(w as Win[])
      } catch { /* следующий поллинг повторит */ }
    }
    poll()
    const id = window.setInterval(poll, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return (
    <div className="wl-casino-strip" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
      <div
        className="wl-banner-card highlight"
        style={{
          padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto',
          background: 'linear-gradient(100deg, #3a1500, #7c2d12 60%, #3a1500)',
          borderColor: '#f59e0b', minWidth: 260,
        }}
        title="С каждой ставки 1% капает в горшок. С шансом 1 к 3000 горшок целиком уходит счастливчику"
      >
        <span style={{ fontSize: 26, filter: 'drop-shadow(0 0 6px #f59e0b)' }}>🎰</span>
        <div style={{ lineHeight: 1.15, textAlign: 'left' }}>
          <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 800, letterSpacing: 1 }}>ХРЯК-ПОТ</div>
          <div style={{ fontFamily: 'var(--font-d)', fontSize: 24, fontWeight: 800, color: '#fde68a' }}>
            {fmtSV(pot)} <span style={{ fontSize: 13 }}>SV₽</span>
          </div>
          {lastWinner && (
            <div style={{ fontSize: 10, color: '#fbbf24' }}>сорвал: {lastWinner}</div>
          )}
        </div>
      </div>
      <div
        className="wl-banner-card"
        style={{ padding: '8px 14px', flex: '1 1 260px', display: 'flex', alignItems: 'center', overflow: 'hidden', minHeight: 56 }}
        title="Последние выигрыши игроков"
      >
        {wins.length === 0 ? (
          <span style={{ color: 'var(--tx-muted)', fontSize: 13 }}>Лента выигрышей пуста — стань первым легендой 🐷</span>
        ) : (
          <div style={{ display: 'flex', gap: 18, whiteSpace: 'nowrap', animation: 'wl-marquee 30s linear infinite' }}>
            {[...wins, ...wins].map((w, i) => (
              <span key={i} style={{ fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: 'var(--tx-secondary)' }}>{w.username}</span>{' '}
                <span style={{ color: '#37c26e' }}>выиграл {fmtSV(w.win)} SV₽</span>{' '}
                <span style={{ color: 'var(--tx-muted)' }}>в «{GAME_NAME[w.game] || w.game}»</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Полноэкранная анимация срыва джекпота.
export function JackpotOverlay({ amount, onClose }: { amount: number | null; onClose: () => void }) {
  const cbRef = useRef(onClose)
  cbRef.current = onClose
  useEffect(() => {
    if (amount === null) return
    const t = window.setTimeout(() => cbRef.current(), 7000)
    return () => clearTimeout(t)
  }, [amount])
  if (amount === null) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer',
        background: 'radial-gradient(ellipse at center, rgba(124,45,18,0.96), rgba(10,8,6,0.98))',
        animation: 'jackpot-flash 0.6s ease-out',
      }}
    >
      <div style={{ fontSize: 72, animation: 'jackpot-bounce 1s ease-in-out infinite' }}>🎰🐷</div>
      <div style={{ fontFamily: 'var(--font-d)', fontSize: 44, fontWeight: 900, color: '#fde68a', textShadow: '0 0 24px #f59e0b', letterSpacing: 2 }}>
        ХРЯК-ПОТ!
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#37c26e' }}>+{fmtSV(amount)} SV₽</div>
      <div style={{ fontSize: 14, color: '#fbbf24' }}>Ты сорвал весь горшок. ЦБ в шоке, казино в минусе, мама гордится</div>
      <div style={{ fontSize: 12, color: 'var(--tx-muted)', marginTop: 6 }}>(нажми, чтобы закрыть)</div>
    </div>
  )
}
