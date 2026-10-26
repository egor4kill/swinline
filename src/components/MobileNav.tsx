import { useEffect, useState } from 'react'
import {
  Activity,
  ChevronRight,
  Ellipsis,
  Gamepad2,
  Gem,
  Gift,
  Info,
  List,
  LogOut,
  MessageSquare,
  MonitorPlay,
  Pickaxe,
  ReceiptText,
  ShieldCheck,
  Trophy,
  Wallet,
  X
} from 'lucide-react'
import type { UserAccount } from '../data'
import { fmt } from '../fmt'
import { UserAvatar } from './Avatars'

type MobileNavProps = {
  view: string
  setView: (v: string) => void
  setSelectedSport: (s: number | null) => void
  slipOpen: boolean
  onToggleSlip: () => void
  couponCount: number
  activeBetsCount: number
  currentUser: UserAccount | null
  isAdmin: boolean
  balance: number
  onOpenProfile: () => void
  onOpenAdmin: () => void
  onOAuthLogin: (provider: 'github' | 'twitch' | 'discord') => void
  onLogout: () => void
  onSupport: () => void
}

const PRIMARY_VIEWS = ['line', 'live', 'games24']

export default function MobileNav({
  view,
  setView,
  setSelectedSport,
  slipOpen,
  onToggleSlip,
  couponCount,
  activeBetsCount,
  currentUser,
  isAdmin,
  balance,
  onOpenProfile,
  onOpenAdmin,
  onOAuthLogin,
  onLogout,
  onSupport
}: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [moreOpen])

  const go = (next: string, sport: number | null = null) => {
    setView(next)
    setSelectedSport(sport)
    setMoreOpen(false)
  }

  const isSecondary = !PRIMARY_VIEWS.includes(view)
  // Когда открыта шторка, подсвечиваем только её вкладку — без двух активных сразу
  const sheetOpen = slipOpen || moreOpen
  const couponBadge = couponCount > 0 ? couponCount : 0

  return (
    <>
      <nav className="wl-mobile-nav" aria-label="Основная навигация">
        <button
          type="button"
          className={`wl-mobile-nav-item ${view === 'line' && !sheetOpen ? 'active' : ''}`}
          aria-current={view === 'line' ? 'page' : undefined}
          onClick={() => go('line')}
        >
          <span className="wl-mobile-nav-icon"><List size={22} /></span>
          <span className="wl-mobile-nav-label">Линия</span>
        </button>

        <button
          type="button"
          className={`wl-mobile-nav-item ${view === 'live' && !sheetOpen ? 'active' : ''}`}
          aria-current={view === 'live' ? 'page' : undefined}
          onClick={() => go('live')}
        >
          <span className="wl-mobile-nav-icon">
            <Activity size={22} />
            <i className="wl-mobile-nav-dot" aria-hidden="true" />
          </span>
          <span className="wl-mobile-nav-label">Live</span>
        </button>

        <button
          type="button"
          className={`wl-mobile-nav-item ${view === 'games24' && !sheetOpen ? 'active' : ''}`}
          aria-current={view === 'games24' ? 'page' : undefined}
          onClick={() => go('games24')}
        >
          <span className="wl-mobile-nav-icon"><Gamepad2 size={22} /></span>
          <span className="wl-mobile-nav-label">Игры</span>
        </button>

        <button
          type="button"
          className={`wl-mobile-nav-item ${slipOpen ? 'active' : ''}`}
          aria-expanded={slipOpen}
          onClick={onToggleSlip}
        >
          <span className="wl-mobile-nav-icon">
            <ReceiptText size={22} />
            {couponBadge > 0 ? (
              <span className="wl-mobile-nav-badge">{couponBadge > 9 ? '9+' : couponBadge}</span>
            ) : activeBetsCount > 0 ? (
              <i className="wl-mobile-nav-dot" aria-hidden="true" />
            ) : null}
          </span>
          <span className="wl-mobile-nav-label">Купон</span>
        </button>

        <button
          type="button"
          className={`wl-mobile-nav-item ${(isSecondary || moreOpen) && !slipOpen ? 'active' : ''}`}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <span className="wl-mobile-nav-icon"><Ellipsis size={22} /></span>
          <span className="wl-mobile-nav-label">Ещё</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="wl-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="wl-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Ещё"
            onClick={e => e.stopPropagation()}
          >
            <div className="wl-sheet-handle" aria-hidden="true" />
            <div className="wl-more-head">
              <h2>Ещё</h2>
              <button type="button" className="wl-more-close" aria-label="Закрыть" onClick={() => setMoreOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {currentUser ? (
              <button type="button" className="wl-more-profile" onClick={() => { setMoreOpen(false); onOpenProfile() }}>
                <UserAvatar avatar={currentUser.avatar} name={currentUser.username} size={40} crown={isAdmin} />
                <span className="wl-more-profile-text">
                  <b>{currentUser.username}</b>
                  <small>{isAdmin ? 'Владелец платформы' : currentUser.title}</small>
                </span>
                <span className="wl-more-profile-balance">{fmt(balance)}</span>
                <ChevronRight size={18} />
              </button>
            ) : (
              <button type="button" className="wl-more-login" onClick={() => { setMoreOpen(false); onOAuthLogin('twitch') }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                </svg>
                <span>Войти через Twitch</span>
              </button>
            )}

            <div className="wl-more-group">
              <span className="wl-more-group-title">Разделы</span>
              <button type="button" className="wl-more-item" onClick={() => go('wallet')}>
                <Wallet size={19} />
                <span>Мой счёт</span>
                <small>{currentUser ? fmt(balance) : 'Баланс и история'}</small>
                <ChevronRight size={17} />
              </button>
              <button type="button" className="wl-more-item" onClick={() => go('mine')}>
                <Pickaxe size={19} />
                <span>Шахта</span>
                <small><Gem size={12} /> АР из Minecraft</small>
                <ChevronRight size={17} />
              </button>
              <button type="button" className="wl-more-item" onClick={() => go('promos')}>
                <Gift size={19} />
                <span>Акции</span>
                <ChevronRight size={17} />
              </button>
              <button type="button" className="wl-more-item" onClick={() => go('results')}>
                <Trophy size={19} />
                <span>Результаты</span>
                <ChevronRight size={17} />
              </button>
              <button type="button" className="wl-more-item" onClick={() => go('esports', 4)}>
                <MonitorPlay size={19} />
                <span>Киберспорт</span>
                <ChevronRight size={17} />
              </button>
              <button type="button" className="wl-more-item" onClick={() => go('about')}>
                <Info size={19} />
                <span>О компании</span>
                <ChevronRight size={17} />
              </button>
            </div>

            <div className="wl-more-group">
              {isAdmin && (
                <button type="button" className="wl-more-item wl-more-admin" onClick={() => { setMoreOpen(false); onOpenAdmin() }}>
                  <ShieldCheck size={19} />
                  <span>Админ-центр</span>
                  <ChevronRight size={17} />
                </button>
              )}
              <button type="button" className="wl-more-item" onClick={() => { setMoreOpen(false); onSupport() }}>
                <MessageSquare size={19} />
                <span>Поддержка</span>
                <small>@egor4kill</small>
                <ChevronRight size={17} />
              </button>
              {currentUser && (
                <button type="button" className="wl-more-item wl-more-logout" onClick={() => { setMoreOpen(false); onLogout() }}>
                  <LogOut size={19} />
                  <span>Выйти</span>
                </button>
              )}
            </div>

            <p className="wl-more-note">18+ · SV₽ — виртуальная валюта. Реальных денег нет.</p>
          </div>
        </div>
      )}
    </>
  )
}
