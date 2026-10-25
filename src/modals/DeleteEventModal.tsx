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

type Props = { deleteEventModal: any; handleDeleteEventConfirmed: any; setDeleteEventModal: any }

export default function DeleteEventModal(props: Props) {
  const { deleteEventModal, handleDeleteEventConfirmed, setDeleteEventModal } = props
  return (
    <>
{/* 6.1 SAFE DELETE CONFIRMATION MODAL */}
{deleteEventModal && (
  <div className="wl-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setDeleteEventModal(null)}>
    <div className="wl-confirm-modal-card" onClick={e => e.stopPropagation()}>
      <div style={{ background: '#251216', padding: '16px 20px', borderBottom: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={22} color="#ef4444" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#ef4444' }}>
            Подтверждение удаления события
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
            Защита от случайного удаления
          </div>
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: '#e2e8f0', marginBottom: 14 }}>
          Вы действительно хотите безвозвратно удалить матч <b>«{deleteEventModal.title}»</b> ({deleteEventModal.league}) из линии?
        </p>

        <div style={{ background: '#1c2232', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 12, color: 'var(--tx-secondary)', lineHeight: 1.4 }}>
          ⚠️ <b>Внимание:</b> Это действие необратимо. Если на матч были сделаны открытые ставки, они будут автоматически аннулированы с полным возвратом средств игрокам.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            className="wl-sidebar-quick-btn"
            style={{ padding: '10px 18px', fontSize: 14, fontWeight: 700 }}
            onClick={() => setDeleteEventModal(null)}
          >
            Отмена
          </button>
          <button
            className="wl-btn-orange"
            style={{ background: '#ef4444', borderColor: '#ef4444', padding: '10px 20px', fontSize: 14, fontWeight: 800, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleDeleteEventConfirmed}
          >
            <Trash2 size={16} />
            <span>Да, удалить событие 🗑️</span>
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </>
  )
}
