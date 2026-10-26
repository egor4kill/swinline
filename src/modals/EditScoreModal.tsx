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

type Props = { editEventModal: any; editIsLive: any; editLiveTime: any; editScore: any; handleEditEventSave: any; setEditEventModal: any; setEditIsLive: any; setEditLiveTime: any; setEditScore: any }

export default function EditScoreModal(props: Props) {
  const { editEventModal, editIsLive, editLiveTime, editScore, handleEditEventSave, setEditEventModal, setEditIsLive, setEditLiveTime, setEditScore } = props
  return (
    <>
{/* 6.2 EDIT SCORE & LIVE STATUS MODAL */}
{editEventModal && (
  <div className="wl-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setEditEventModal(null)}>
    <div className="wl-modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
      <div className="wl-modal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Edit3 size={18} color="var(--org)" />
          <span style={{ fontWeight: 800 }}>Редактирование счёта матча</span>
        </div>
        <button className="wl-modal-x" onClick={() => setEditEventModal(null)} style={{ color: 'var(--tx-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
      </div>
      <div className="wl-modal-body">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#fff' }}>
          {editEventModal.title}
        </div>
        <div className="wl-form-group">
          <label className="wl-form-label">Текущий счёт:</label>
          <input
            type="text"
            className="wl-form-input"
            value={editScore}
            onChange={e => setEditScore(e.target.value)}
            placeholder="например: 2 : 1"
          />
        </div>
        <div className="wl-form-group">
          <label className="wl-form-label">Время / Статус тайма:</label>
          <input
            type="text"
            className="wl-form-input"
            value={editLiveTime}
            onChange={e => setEditLiveTime(e.target.value)}
            placeholder="например: 2-й тайм 75' или Скоро"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
          <input
            type="checkbox"
            id="modalEditIsLiveCheck"
            checked={editIsLive}
            onChange={e => setEditIsLive(e.target.checked)}
          />
          <label htmlFor="modalEditIsLiveCheck" style={{ fontSize: 13, cursor: 'pointer' }}>
            Статус <b>● LIVE</b> (показывать в фильтре Live)
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            className="wl-btn-orange"
            style={{ flex: 1, height: 42, borderRadius: 8, fontSize: 14 }}
            onClick={handleEditEventSave}
          >
            Сохранить изменения
          </button>
        </div>
      </div>
    </div>
  </div>
)}
    </>
  )
}
