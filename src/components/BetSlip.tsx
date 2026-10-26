import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { FormEvent } from 'react'
import {
  Trophy,
  Gamepad2,
  Flame,
  Building,
  Sparkles,
  Swords,
  Activity,
  Utensils,
  Search,
  Star,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Pause,
  Volume2,
  Maximize2,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Sparkle,
  User,
  PlusCircle,
  Settings,
  Award,
  Wallet,
  Zap,
  Check,
  TrendingUp,
  AlertTriangle,
  Users,
  Trash2,
  Edit3,
  Lock,
  Unlock,
  RotateCcw
} from 'lucide-react'
import {
  CATS,
  SPORT_CATEGORIES,
  EVENTS,
  TOURNAMENT_PILLS,
  PROMOS,
  NEWS,
  ABOUT,
  START,
  MINBET,
  DEFAULT_ACCOUNTS,
  type Ev,
  type UserAccount
} from '../data'
import { payout, r2 } from '../logic'
import { mult as crashMult, flightSeconds } from '../crashLogic'
import { supabase, ADMIN_USERNAME } from '../supabase'
import { SECTORS as ROULETTE_SECTORS } from '../wheelLogic'
import ceoPhoto from '../assets/ceo.jpg'
import { fmt } from '../fmt'
import { PigLogo, UserAvatar, getTwitchAvatar } from '../components/Avatars'

type Props = { S: any; activeBetsCount: any; allEvents: any; err: any; handlePlaceBet: any; isStakeValid: any; potentialPayout: any; selectedBet: any; setErr: any; setSelectedBet: any; setSlipOpen: any; setSlipTab: any; setStake: any; slipOpen: any; slipTab: any; stake: any; playCurrency: 'sv' | 'ar'; setPlayCurrency: (c: 'sv' | 'ar') => void; arBalance: number; currentUser: any; onNeedAuth: () => void }

export default function BetSlip(props: Props) {
  const { S, activeBetsCount, allEvents, err, handlePlaceBet, isStakeValid, potentialPayout, selectedBet, setErr, setSelectedBet, setSlipOpen, setSlipTab, setStake, slipOpen, slipTab, stake, playCurrency, setPlayCurrency, arBalance, currentUser, onNeedAuth } = props
  const unit = playCurrency === 'ar' ? 'АР' : 'SV₽'
  const num = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
  const money = (n: number, u: string = unit) => num(n) + ' ' + u

  // На телефоне купон — модальная шторка: фон не должен скроллиться под ней
  useEffect(() => {
    if (!slipOpen) return
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [slipOpen])

  return (
    <>
{/* 4. Floating BetSlip Drawer */}
{slipOpen && (
  <>
  <div className="wl-sheet-backdrop" onClick={() => setSlipOpen(false)} />
  <div className="wl-betslip-drawer" role="dialog" aria-modal="true" aria-label="Купон">
    <div className="wl-sheet-handle" aria-hidden="true" />
    <div className="wl-slip-header">
      <div className="wl-slip-tabs">
        <button
          className={`wl-slip-tab ${slipTab === 'coupon' ? 'active' : ''}`}
          onClick={() => setSlipTab('coupon')}
        >
          Купон {selectedBet ? '(1)' : ''}
        </button>
        <button
          className={`wl-slip-tab ${slipTab === 'ingame' ? 'active' : ''}`}
          onClick={() => setSlipTab('ingame')}
        >
          В игре ({activeBetsCount})
        </button>
      </div>
      <button
        type="button"
        aria-label="Закрыть купон"
        onClick={() => setSlipOpen(false)}
        style={{ color: 'var(--tx-muted)' }}
      >
        <X size={18} />
      </button>
    </div>

    {slipTab === 'coupon' ? (
      <div className="wl-slip-body">
        {!selectedBet ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--tx-muted)' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Купон пуст</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Выберите исход в линии, чтобы добавить его в купон.
            </div>
          </div>
        ) : (
          <form onSubmit={handlePlaceBet}>
            {(() => {
              const ev = allEvents.find(e => e.id === selectedBet.evId)
              return (
                <div style={{ background: '#1b212d', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev?.league}</div>
                    <button
                      type="button"
                      className="wl-slip-remove"
                      onClick={() => setSelectedBet(null)}
                      style={{ color: '#ef4444' }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                    {ev?.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid #283142', paddingTop: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--org)', fontWeight: 700 }}>
                      {selectedBet.outcomeTitle}
                    </span>
                    <span style={{ fontFamily: 'var(--font-d)', fontWeight: 800, fontSize: 16 }}>
                      {selectedBet.odds.toFixed(2)}
                    </span>
                  </div>
                </div>
              )
            })()}

            <div className="wl-slip-currency">
              <button
                type="button"
                className={`wl-round-btn ${playCurrency === 'sv' ? 'active' : ''}`}
                onClick={() => { setPlayCurrency('sv'); setErr('') }}
              >
                SV₽ · {num(Number(S.bal || 0))}
              </button>
              <button
                type="button"
                className={`wl-round-btn ${playCurrency === 'ar' ? 'active' : ''}`}
                onClick={() => {
                  if (!currentUser) { onNeedAuth(); return }
                  setPlayCurrency('ar')
                  setErr('')
                }}
                disabled={!currentUser}
                title={currentUser ? 'Играть на алмазной валюте' : 'Войди через Twitch, чтобы играть на АР'}
              >
                АР · {num(arBalance)}
              </button>
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--tx-secondary)', fontWeight: 600 }}>
                Сумма ставки, {unit}:
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="wl-stake-input"
                value={stake}
                onChange={e => {
                  setStake(e.target.value.replace(',', '.'))
                  setErr('')
                }}
              />
            </div>

            <div className="wl-quick-stakes">
              {(playCurrency === 'ar' ? ['1', '5', '10', '50'] : ['100', '500', '1000']).map(val => (
                <button
                  key={val}
                  type="button"
                  className="wl-quick-btn"
                  onClick={() => { setStake(val); setErr('') }}
                >
                  +{val}
                </button>
              ))}
              <button
                type="button"
                className="wl-quick-btn"
                style={{ color: 'var(--org)' }}
                onClick={() => { setStake(String(Math.floor(playCurrency === 'ar' ? arBalance : S.bal))); setErr('') }}
              >
                Всё
              </button>
            </div>

            <div style={{ background: '#0e1117', padding: 10, borderRadius: 8, margin: '12px 0', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tx-secondary)' }}>
                <span>Возможный выигрыш:</span>
                <span style={{ fontFamily: 'var(--font-d)', fontWeight: 800, color: 'var(--org)', fontSize: 15 }}>
                  {isStakeValid ? money(potentialPayout) : '—'}
                </span>
              </div>
            </div>

            {err && (
              <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              className="wl-btn-orange"
              style={{ width: '100%', padding: '12px 0', fontSize: 15, borderRadius: 10 }}
            >
              Сделать ставку
            </button>
          </form>
        )}
      </div>
    ) : (
      <div className="wl-slip-body">
        {activeBetsCount === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--tx-muted)' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>⏳</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Нет активных ставок</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {S.bets.filter((b: any) => b.state === 'open').map((b: any) => {
              const ev = allEvents.find(e => e.id === b.ev)
              return (
                <div key={b.id} style={{ background: '#1c2230', padding: 12, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev?.league}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{ev?.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                    <span>{ev?.out[b.i]?.[0]} (x{b.odds.toFixed(2)})</span>
                    <span style={{ fontWeight: 700, color: 'var(--org)' }}>{money(b.stake, b.currency === 'ar' ? 'АР' : 'SV₽')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )}
  </div>
  </>
)}
    </>
  )
}
