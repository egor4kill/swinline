import { useEffect, useState } from 'react'
import { REWARDS, msToMidnight } from './dailyLogic'
import type { useDaily } from './useDaily'

type Props = { daily: ReturnType<typeof useDaily>; onClaim: () => void }
const fmt = (n: number) => n.toLocaleString('ru-RU')
const hms = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000)), p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`
}

const CSS = `
.dr-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:14px 0}
.dr-tile{height:96px;border-radius:12px;border:1px solid #3a3d43;background:#1f2023;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;min-width:0}
.dr-tile small{font-size:11px;color:#9a9da3}
.dr-tile b{font-size:15px;font-family:var(--font-d,inherit)}
.dr-tile .ic{font-size:18px;height:22px}
.dr-tile.done{background:#17301f;border-color:#4cd08a}
.dr-tile.now{border-color:#ff6a00;background:#2a1a0d;box-shadow:0 0 18px #ff6a0055}
.dr-tile.last{border-style:dashed}
@media(max-width:640px){.dr-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(prefers-reduced-motion:no-preference){.dr-tile.now{animation:drPulse 1.6s ease-in-out infinite}}
@keyframes drPulse{50%{box-shadow:0 0 28px #ff6a00aa}}
`

export default function DailyRewards({ daily, onClaim }: Props) {
  const st = daily.status
  const [left, setLeft] = useState(msToMidnight())
  useEffect(() => {
    if (st.canClaim) return
    setLeft(msToMidnight())
    const t = setInterval(() => setLeft(msToMidnight()), 1000)
    return () => clearInterval(t)
  }, [st.canClaim, daily.today])

  const note = !daily.loggedIn ? 'Войди через Twitch, чтобы получать награды'
    : st.broken && st.canClaim ? 'Серия прервалась, начинаем с первого дня'
    : st.canClaim ? (daily.state.streak ? `Серия: ${daily.state.streak} дн. Не пропусти сегодняшний день` : 'Забери первую награду')
    : `Серия: ${daily.state.streak} дн. Следующая награда +${fmt(REWARDS[st.pos])} SV₽`

  return (
    <div className="wl-banner-card highlight" style={{ marginBottom: 20, textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
      <style>{CSS}</style>
      <h3 style={{ fontFamily: 'var(--font-d)', fontSize: 20, margin: '0 0 4px' }}>ЕЖЕДНЕВНАЯ НАГРАДА 🎁</h3>
      <div style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>Заходи каждый день: серия растёт, награда тоже. Пропустил день и серия начнётся заново.</div>
      <div className="dr-grid">
        {REWARDS.map((r, i) => {
          const done = daily.loggedIn && i < st.done, now = daily.loggedIn && st.canClaim && i === st.pos
          return (
            <div key={i} className={`dr-tile ${done ? 'done' : ''} ${now ? 'now' : ''} ${i === 6 ? 'last' : ''}`}>
              <small>День {i + 1}</small>
              <span className="ic">{done ? '✅' : now ? '🎁' : i === 6 ? '👑' : '🐷'}</span>
              <b>+{fmt(r)}</b>
            </div>
          )
        })}
      </div>
      <div style={{ minHeight: 22, fontSize: 13, color: 'var(--tx-secondary)', marginBottom: 8 }} aria-live="polite">{note}</div>
      <div style={{ minHeight: 48 }}>
        {st.canClaim || !daily.loggedIn ? (
          <button className="wl-btn-orange" style={{ minHeight: 46, padding: '0 26px', fontWeight: 800 }} onClick={onClaim}>
            {daily.loggedIn ? `Забрать +${fmt(st.reward)} SV₽` : 'Войти и забрать'}
          </button>
        ) : (
          <button className="wl-round-btn" disabled style={{ minHeight: 46, padding: '0 26px', opacity: 0.8 }}>Следующая награда через {hms(left)}</button>
        )}
      </div>
    </div>
  )
}
