import { ShieldCheck } from 'lucide-react'
import type { UserAccount } from '../data'
import { fmt } from '../fmt'
import { PigLogo, UserAvatar } from './Avatars'
import VipBadge from '../VipBadge'
import type { useDaily } from '../useDaily'

type HeaderProps = {
  view: string
  setView: (v: string) => void
  setSelectedSport: (s: number | null) => void
  balance: number
  currentUser: UserAccount | null
  isAdmin: boolean
  daily: ReturnType<typeof useDaily>
  onOpenAdminCenter: () => void
  onOpenProfile: () => void
  onAddMoney: () => void
  onLogout: () => void
  onOAuthLogin: (provider: 'github' | 'twitch' | 'discord') => void
}

export default function Header({
  view,
  setView,
  setSelectedSport,
  balance,
  currentUser,
  isAdmin,
  daily,
  onOpenAdminCenter,
  onOpenProfile,
  onAddMoney,
  onLogout,
  onOAuthLogin
}: HeaderProps) {
  return (
    <header className="wl-header">
      <div className="wl-header-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* Logo stadium-pill */}
          <button type="button" className="wl-logo-pill" aria-label="На главную" onClick={() => { setView('line'); setSelectedSport(null) }}>
            <PigLogo />
            <div className="wl-logo-text">
              SWIN<span>LINE</span>
            </div>
          </button>

          {/* Navigation links */}
          <nav className="wl-nav">
            <button
              className={`wl-nav-link ${view === 'line' ? 'active' : ''}`}
              onClick={() => { setView('line'); setSelectedSport(null) }}
            >
              Линия
            </button>
            <button
              className={`wl-nav-link ${view === 'live' ? 'active' : ''}`}
              onClick={() => { setView('live'); setSelectedSport(null) }}
            >
              <div className="live-badge-dot" />
              Live сейчас
            </button>
            <button
              className={`wl-nav-link ${view === 'esports' ? 'active' : ''}`}
              onClick={() => { setView('esports'); setSelectedSport(4) }}
            >
              Киберспорт
            </button>
            <button
              className={`wl-nav-link ${view === 'games24' ? 'active' : ''}`}
              onClick={() => setView('games24')}
            >
              Игры 24/7
            </button>
            <button
              className={`wl-nav-link ${view === 'mine' ? 'active' : ''}`}
              onClick={() => setView('mine')}
            >
              <span className="mc-nav-dot" />
              Шахта
            </button>
            <button
              className={`wl-nav-link ${view === 'wallet' ? 'active' : ''}`}
              onClick={() => setView('wallet')}
            >
              Мой счет
            </button>
            <button
              className={`wl-nav-link ${view === 'promos' ? 'active' : ''}`}
              onClick={() => setView('promos')}
            >
              Акции
            </button>
            <button
              className={`wl-nav-link ${view === 'results' ? 'active' : ''}`}
              onClick={() => setView('results')}
            >
              Результаты
            </button>
            <button
              className={`wl-nav-link ${view === 'about' ? 'active' : ''}`}
              onClick={() => setView('about')}
            >
              О компании
            </button>
          </nav>
        </div>

        {/* Right Header: User Account, Admin Badge, Balance & Actions */}
        <div className="wl-header-right">
          {currentUser ? (
            <>
              {/* Admin Badge if admin */}
              {isAdmin && (
                <button
                  className="wl-admin-badge"
                  onClick={onOpenAdminCenter}
                  title="Открыть панель администратора"
                >
                  <ShieldCheck size={14} />
                  <span>АДМИН-ЦЕНТР</span>
                </button>
              )}

              {/* User Profile Chip */}
              <button
                type="button"
                className="wl-user-chip"
                aria-label="Личный кабинет"
                onClick={onOpenProfile}
                title="Личный кабинет"
              >
                <UserAvatar avatar={currentUser.avatar} name={currentUser.username} size={30} crown={isAdmin} />
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{currentUser.username}</span>
                  <span style={{ fontSize: 10, color: isAdmin ? '#f59e0b' : 'var(--tx-muted)' }}>
                    {currentUser.title}
                  </span>
                  <VipBadge userId={currentUser.id} />
                </div>
              </button>

              {/* Balance chip */}
              <button
                type="button"
                className="wl-balance-chip"
                title="Мой счёт"
                aria-label={`Баланс ${fmt(balance)} — открыть мой счёт`}
                onClick={() => setView('wallet')}
              >
                <span className="wl-balance-amount">{fmt(balance)}</span>
              </button>

              <button
                className={`wl-btn-green wl-btn-daily ${daily.status.canClaim ? 'pulse' : ''}`}
                onClick={() => setView('wallet')}
                title="Ежедневная награда"
              >
                🎁 Награда
              </button>

              <button
                className="wl-btn-orange wl-btn-topup"
                onClick={onAddMoney}
                title="Начислить бесплатные SV₽"
              >
                + Начислить
              </button>

              <button
                className="wl-sidebar-quick-btn wl-btn-logout"
                style={{ border: '1px solid var(--border)', padding: '6px 10px', fontSize: 12 }}
                onClick={onLogout}
                title="Выйти из аккаунта"
              >
                Выйти ↪
              </button>
            </>
          ) : (
            <button
              className="wl-btn-orange wl-login-btn"
              aria-label="Войти через Twitch"
              style={{
                background: 'linear-gradient(135deg, #9146ff, #772ce8)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
                padding: '9px 18px',
                borderRadius: 8,
                fontSize: 14,
                boxShadow: '0 2px 12px rgba(145, 70, 255, 0.4)'
              }}
              onClick={() => onOAuthLogin('twitch')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
              </svg>
              <span className="wl-login-full">Войти через Twitch</span>
              <span className="wl-login-short">Войти</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
