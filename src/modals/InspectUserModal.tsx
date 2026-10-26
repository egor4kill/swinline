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

type Props = { allEvents: any; inspectingUser: any; setInspectingUser: any }

export default function InspectUserModal(props: Props) {
  const { allEvents, inspectingUser, setInspectingUser } = props
  return (
    <>
{/* ADMIN: INSPECTING USER'S BETS MODAL */}
{inspectingUser && (
  <div className="wl-modal-overlay" onClick={() => setInspectingUser(null)}>
    <div className="wl-modal-card" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
      <div className="wl-modal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserAvatar avatar={inspectingUser.avatar} name={inspectingUser.username} size={28} crown={inspectingUser.role === 'admin'} />
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            Купоны игрока {inspectingUser.username}
          </span>
        </div>
        <button className="wl-modal-x" onClick={() => setInspectingUser(null)} style={{ color: 'var(--tx-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>
      <div className="wl-modal-body">
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 13, background: '#181d28', padding: 10, borderRadius: 8 }}>
          <span>Баланс: <b style={{ color: 'var(--org)' }}>{fmt(inspectingUser.bal)}</b></span>
          <span>Статус: <b style={{ color: inspectingUser.isBlocked ? '#ef4444' : 'var(--green)' }}>{inspectingUser.isBlocked ? 'Заблокирован' : 'Активен'}</b></span>
        </div>

        {inspectingUser.bets && inspectingUser.bets.length > 0 ? (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="wl-admin-table">
              <thead>
                <tr>
                  <th>Событие</th>
                  <th>Ставка</th>
                  <th>Коэф.</th>
                  <th>Итог</th>
                </tr>
              </thead>
              <tbody>
                {inspectingUser.bets.map((b: any) => {
                  const ev = allEvents.find(e => e.id === b.ev || e.id === b.event_id)
                  const title = b.match_title || ev?.title || b.ev || 'Матч'
                  const pick = b.pick_name || b.pick || ''
                  const oddsVal = typeof b.odds === 'number' ? b.odds.toFixed(2) : String(b.odds || '-')
                  const isWon = b.status === 'won' || b.state === 'won'
                  const isLost = b.status === 'lost' || b.state === 'lost'
                  const isRefund = b.status === 'refund' || b.state === 'refund'
                  const statusLabel = isWon ? 'Выигрыш' : isLost ? 'Проигрыш' : isRefund ? 'Возврат' : 'В игре'
                  return (
                    <tr key={b.id}>
                      <td>
                        <div><b>{title}</b></div>
                        {pick && <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Выбор: {pick}</div>}
                      </td>
                      <td style={{ fontWeight: 700 }}>{fmt(Number(b.stake || 0))}</td>
                      <td>{oddsVal}</td>
                      <td>
                        <span style={{ color: isWon ? 'var(--green)' : isLost ? '#ef4444' : isRefund ? '#94a3b8' : '#f59e0b', fontWeight: 700 }}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx-muted)' }}>
            У этого игрока пока нет совершённых ставок.
          </div>
        )}
      </div>
    </div>
  </div>
)}
    </>
  )
}
