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
import VipBadge from '../VipBadge'
import { PigLogo, UserAvatar, getTwitchAvatar } from '../components/Avatars'

type Props = { S: any; currentUser: any; handleLogout: any; isAdmin: any; myStats: any; profileModalOpen: any; setProfileModalOpen: any }

export default function ProfileModal(props: Props) {
  const { S, currentUser, handleLogout, isAdmin, myStats, profileModalOpen, setProfileModalOpen } = props
  return (
    <>
{/* 5. USER PROFILE MODAL */}
{profileModalOpen && currentUser && (
  <div className="wl-modal-overlay" onClick={() => setProfileModalOpen(false)}>
    <div className="wl-modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
      <div className="wl-modal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <User size={20} color="var(--org)" />
          <span style={{ fontWeight: 800, fontSize: 17 }}>Личный кабинет</span>
        </div>
        <button onClick={() => setProfileModalOpen(false)} style={{ color: 'var(--tx-muted)' }}>
          <X size={18} />
        </button>
      </div>

      <div className="wl-modal-body">
        {/* Profile Card */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1f2c, #151a26)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 18,
          marginBottom: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <UserAvatar avatar={currentUser.avatar} name={currentUser.username} size={64} crown={isAdmin} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.username}
              </div>
              <VipBadge userId={currentUser.id} />
              <div style={{ fontSize: 12, color: isAdmin ? '#f59e0b' : 'var(--tx-secondary)', fontWeight: 700 }}>
                {currentUser.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 4 }}>
                В SWINLINE с {new Date(currentUser.createdAt).toLocaleDateString('ru-RU')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            {isAdmin && (
              <span className="wl-admin-badge">
                <ShieldCheck size={14} /> ADMIN
              </span>
            )}
            <span style={{
              background: '#1c2232',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--org)'
            }}>
              {currentUser.role === 'admin' ? 'Админ' : S.bal >= 50000 ? 'VIP' : 'Игрок'}
            </span>
          </div>
        </div>

        {/* Balance / In-play / Attempts strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18, textAlign: 'center' }}>
          <div style={{ background: '#161a25', border: '1px solid rgba(255, 85, 0, 0.25)', padding: '12px 8px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Баланс</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--org)' }}>{fmt(S.bal)}</div>
          </div>
          <div style={{ background: '#161a25', padding: '12px 8px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>В игре</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {fmt(myStats ? myStats.bets.filter((b: any) => b.status === 'pending').reduce((a: number, b: any) => a + Number(b.stake || 0), 0) : 0)}
            </div>
          </div>
          <div style={{ background: '#161a25', padding: '12px 8px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Игровых попыток</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{myStats ? myStats.attempts : '—'}</div>
          </div>
        </div>

        {/* Bet stats (server) */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8 }}>
            СТАТИСТИКА СТАВОК (из базы):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
            <div style={{ background: '#161a25', padding: 10, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Ставок</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{myStats ? myStats.bets.length : '—'}</div>
            </div>
            <div style={{ background: '#161a25', padding: 10, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Винрейт</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>
                {(() => {
                  const settled = myStats ? myStats.bets.filter((b: any) => b.status === 'won' || b.status === 'lost') : []
                  const won = settled.filter((b: any) => b.status === 'won').length
                  return settled.length ? `${Math.round((won / settled.length) * 100)}%` : '—'
                })()}
              </div>
            </div>
            <div style={{ background: '#161a25', padding: 10, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Профит</div>
              {(() => {
                const settled = myStats ? myStats.bets.filter((b: any) => b.status === 'won' || b.status === 'lost') : []
                const net = settled.reduce((a: number, b: any) => a + Number(b.payout || 0) - Number(b.stake || 0), 0)
                return (
                  <div style={{ fontSize: 16, fontWeight: 800, color: settled.length ? (net >= 0 ? 'var(--green)' : '#ef4444') : '#fff' }}>
                    {settled.length ? `${net >= 0 ? '+' : ''}${fmt(net)}` : '—'}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Recent bets (server) */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8 }}>
            ПОСЛЕДНИЕ СТАВКИ:
          </div>
          {!myStats ? (
            <div style={{ background: '#161a25', borderRadius: 10, padding: '18px 0', textAlign: 'center', fontSize: 12, color: 'var(--tx-muted)' }}>
              Загружаем из базы…
            </div>
          ) : myStats.bets.length === 0 ? (
            <div style={{ background: '#161a25', borderRadius: 10, padding: '18px 0', textAlign: 'center', fontSize: 12, color: 'var(--tx-muted)' }}>
              Ставок пока нет. Загляни в линию или в игры 24/7!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto' }}>
              {myStats.bets.slice(0, 8).map((b: any) => {
                const isWon = b.status === 'won'
                const isLost = b.status === 'lost'
                const isRefund = b.status === 'refund'
                const color = isWon ? 'var(--green)' : isLost ? '#ef4444' : isRefund ? '#94a3b8' : '#f59e0b'
                const label = isWon ? `+${fmt(Number(b.payout || 0))}` : isLost ? `−${fmt(Number(b.stake || 0))}` : isRefund ? 'возврат' : 'в игре'
                return (
                  <div key={b.id} style={{ background: '#161a25', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.match_title || b.event_id}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
                        {b.pick_name || b.pick} × {Number(b.odds).toFixed(2)} • {fmt(Number(b.stake))}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color, flexShrink: 0 }}>{label}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Achievements */}
        {currentUser.achievements.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={14} color="var(--org)" />
              ДОСТИЖЕНИЯ:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {currentUser.achievements.map((ach, i) => (
                <span
                  key={i}
                  style={{ background: '#1c2232', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}
                >
                  🏆 {ach}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          className="wl-sidebar-quick-btn"
          style={{ border: '1px solid #ef444455', color: '#ef4444', width: '100%', justifyContent: 'center' }}
          onClick={handleLogout}
        >
          Выйти из профиля ↪
        </button>
      </div>
    </div>
  </div>
)}
    </>
  )
}
