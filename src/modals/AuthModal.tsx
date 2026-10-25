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

type Props = { authModalOpen: any; handleOAuthLogin: any; setAuthModalOpen: any }

export default function AuthModal(props: Props) {
  const { authModalOpen, handleOAuthLogin, setAuthModalOpen } = props
  return (
    <>
{/* AUTH MODAL (TWITCH-FIRST) */}
{authModalOpen && (
  <div className="wl-modal-overlay" onClick={() => setAuthModalOpen(false)}>
    <div className="wl-modal-card" style={{ maxWidth: 420, textAlign: 'center', padding: '24px 20px' }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>
          Вход в SWINLINE
        </span>
        <button onClick={() => setAuthModalOpen(false)} style={{ color: 'var(--tx-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ margin: '8px 0 20px' }}>
        <div style={{
          width: 68,
          height: 68,
          borderRadius: '50%',
          background: 'rgba(145, 70, 255, 0.15)',
          border: '2px solid #9146ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
          color: '#9146ff'
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
          </svg>
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: '#fff' }}>
          Авторизация через Twitch
        </h3>
        <p style={{ fontSize: 13, color: 'var(--tx-secondary)', margin: 0, lineHeight: 1.5 }}>
          Войдите под своим Twitch-аккаунтом для доступа к линии ставок и мини-играм.
        </p>
      </div>

      {/* Main Twitch Button */}
      <button
        type="button"
        style={{
          background: 'linear-gradient(135deg, #9146ff, #772ce8)',
          color: '#fff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          width: '100%',
          height: 52,
          borderRadius: 12,
          fontSize: 16,
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(145, 70, 255, 0.45)',
          transition: 'all 0.2s',
          marginBottom: 18
        }}
        onClick={() => handleOAuthLogin('twitch')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
        </svg>
        <span>Войти через Twitch</span>
      </button>

      {/* Benefits box */}
      <div style={{
        background: '#141822',
        border: '1px solid #242c3d',
        borderRadius: 10,
        padding: '12px 14px',
        fontSize: 12,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        color: 'var(--tx-secondary)',
        lineHeight: 1.4
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🟣</span>
          <span><b>Мгновенный вход:</b> имя и аватар берутся прямо из Twitch</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💰</span>
          <span><b>Стартовый бонус:</b> +10 000 SV₽ каждому новому игроку</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>👑</span>
          <span><b>Владелец ({ADMIN_USERNAME}):</b> автоматический статус Администратора</span>
        </div>
      </div>
    </div>
  </div>
)}
    </>
  )
}
