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

type Props = { activeBetsCount: any; notify: any; selectedBet: any; setSlipOpen: any; slipOpen: any }

export default function CouponBar(props: Props) {
  const { activeBetsCount, notify, selectedBet, setSlipOpen, slipOpen } = props
  return (
    <>
{/* 3. Floating Bottom-Right Coupon Button */}
<div className="wl-floating-coupon-bar">
  <button
    className="wl-coupon-trigger-btn"
    onClick={() => setSlipOpen(prev => !prev)}
  >
    <span>Купон</span>
    <span className="wl-coupon-count-badge">
      {selectedBet ? 1 : 0}
    </span>
    <span style={{ opacity: 0.6 }}>|</span>
    <span>В игре</span>
    <span className="wl-coupon-count-badge" style={{ background: '#252d3d' }}>
      {activeBetsCount}
    </span>
    {slipOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
  </button>

  <button
    className="wl-floating-chat-btn"
    onClick={() => {
      notify('💬 Поддержка: Связь с администратором в Telegram: @egor4kill')
      window.open('https://t.me/egor4kill', '_blank')
    }}
    title="Служба поддержки (@egor4kill)"
  >
    <MessageSquare size={20} />
  </button>
</div>
    </>
  )
}
