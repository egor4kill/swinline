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

type Props = { CATS: any; applyTemplate: any; createMatchModalOpen: any; handleCreateMatch: any; newMatchCat: any; newMatchDesc: any; newMatchIsLive: any; newMatchLeague: any; newMatchOdds1: any; newMatchOdds2: any; newMatchOddsX: any; newMatchScore: any; newMatchTeam1: any; newMatchTeam2: any; newMatchTime: any; newMatchTitle: any; setCreateMatchModalOpen: any; setNewMatchCat: any; setNewMatchDesc: any; setNewMatchIsLive: any; setNewMatchLeague: any; setNewMatchOdds1: any; setNewMatchOdds2: any; setNewMatchOddsX: any; setNewMatchScore: any; setNewMatchTeam1: any; setNewMatchTeam2: any; setNewMatchTime: any; setNewMatchTitle: any }

export default function CreateMatchModal(props: Props) {
  const { CATS, applyTemplate, createMatchModalOpen, handleCreateMatch, newMatchCat, newMatchDesc, newMatchIsLive, newMatchLeague, newMatchOdds1, newMatchOdds2, newMatchOddsX, newMatchScore, newMatchTeam1, newMatchTeam2, newMatchTime, newMatchTitle, setCreateMatchModalOpen, setNewMatchCat, setNewMatchDesc, setNewMatchIsLive, setNewMatchLeague, setNewMatchOdds1, setNewMatchOdds2, setNewMatchOddsX, setNewMatchScore, setNewMatchTeam1, setNewMatchTeam2, setNewMatchTime, setNewMatchTitle } = props
  return (
    <>
{/* 6.3 STANDALONE CREATE MATCH MODAL */}
{createMatchModalOpen && (
  <div className="wl-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setCreateMatchModalOpen(false)}>
    <div className="wl-modal-card" style={{ maxWidth: 650 }} onClick={e => e.stopPropagation()}>
      <div className="wl-modal-header" style={{ background: '#241a0d', borderBottomColor: '#f59e0b44' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PlusCircle size={20} color="var(--org)" />
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--org)' }}>Создать новое событие в линию</span>
        </div>
        <button className="wl-modal-x" onClick={() => setCreateMatchModalOpen(false)} style={{ color: 'var(--tx-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
      </div>

      <div className="wl-modal-body">
        {/* Quick Template Pills */}
        <div style={{ background: '#161c29', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--org)', marginBottom: 8, letterSpacing: '0.04em' }}>
            ⚡ БЫСТРЫЕ ШАБЛОНЫ В 1 КЛИК:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="wl-demo-btn" onClick={() => applyTemplate('football')}>
              ⚽ Спартак vs Зенит
            </button>
            <button type="button" className="wl-demo-btn" onClick={() => applyTemplate('cs2')}>
              🎮 CS2: NAVI vs Spirit
            </button>
            <button type="button" className="wl-demo-btn" onClick={() => applyTemplate('mma')}>
              🥊 UFC: Махачев vs Царукян
            </button>
            <button type="button" className="wl-demo-btn" onClick={() => applyTemplate('burger')}>
              🌭 Бургер-батл
            </button>
          </div>
        </div>

        <form onSubmit={handleCreateMatch}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div className="wl-form-group">
              <label className="wl-form-label">Название матча / вывеска:</label>
              <input
                type="text"
                className="wl-form-input"
                placeholder="Например: Спартак Хряк vs Зенит Боровы"
                value={newMatchTitle}
                onChange={e => setNewMatchTitle(e.target.value)}
                required
              />
            </div>

            <div className="wl-form-group">
              <label className="wl-form-label">Категория:</label>
              <select
                className="wl-form-input"
                value={newMatchCat}
                onChange={e => setNewMatchCat(Number(e.target.value))}
              >
                {CATS.map((c, i) => (
                  <option key={i} value={i}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="wl-form-group">
              <label className="wl-form-label">Команда / Участник 1:</label>
              <input
                type="text"
                className="wl-form-input"
                placeholder="Хозяева"
                value={newMatchTeam1}
                onChange={e => setNewMatchTeam1(e.target.value)}
              />
            </div>
            <div className="wl-form-group">
              <label className="wl-form-label">Команда / Участник 2:</label>
              <input
                type="text"
                className="wl-form-input"
                placeholder="Гости"
                value={newMatchTeam2}
                onChange={e => setNewMatchTeam2(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 14 }}>
            <div className="wl-form-group">
              <label className="wl-form-label">Турнир / Лига:</label>
              <input
                type="text"
                className="wl-form-input"
                placeholder="Свин-Лига РПЛ"
                value={newMatchLeague}
                onChange={e => setNewMatchLeague(e.target.value)}
              />
            </div>
            <div className="wl-form-group">
              <label className="wl-form-label">Текущий счёт:</label>
              <input
                type="text"
                className="wl-form-input"
                placeholder="0 : 0"
                value={newMatchScore}
                onChange={e => setNewMatchScore(e.target.value)}
              />
            </div>
            <div className="wl-form-group">
              <label className="wl-form-label">Время / Статус:</label>
              <input
                type="text"
                className="wl-form-input"
                placeholder="Скоро"
                value={newMatchTime}
                onChange={e => setNewMatchTime(e.target.value)}
              />
            </div>
          </div>

          <div className="wl-form-group">
            <label className="wl-form-label">Описание / Комментарий:</label>
            <input
              type="text"
              className="wl-form-input"
              placeholder="Краткое описание для карточки матча"
              value={newMatchDesc}
              onChange={e => setNewMatchDesc(e.target.value)}
            />
          </div>

          {/* Odds inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 6 }}>
            <div className="wl-form-group">
              <label className="wl-form-label">Кэф на Победу 1 (П1):</label>
              <input
                type="text"
                className="wl-form-input"
                value={newMatchOdds1}
                onChange={e => setNewMatchOdds1(e.target.value)}
              />
            </div>
            <div className="wl-form-group">
              <label className="wl-form-label">Кэф на Ничью (X):</label>
              <input
                type="text"
                className="wl-form-input"
                value={newMatchOddsX}
                onChange={e => setNewMatchOddsX(e.target.value)}
              />
            </div>
            <div className="wl-form-group">
              <label className="wl-form-label">Кэф на Победу 2 (П2):</label>
              <input
                type="text"
                className="wl-form-input"
                value={newMatchOdds2}
                onChange={e => setNewMatchOdds2(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
            <input
              type="checkbox"
              id="modalIsLiveCheck"
              checked={newMatchIsLive}
              onChange={e => setNewMatchIsLive(e.target.checked)}
            />
            <label htmlFor="modalIsLiveCheck" style={{ fontSize: 13, cursor: 'pointer' }}>
              Опубликовать как активный <b>● LIVE матч</b> (с красным пульсирующим индикатором)
            </label>
          </div>

          <button
            type="submit"
            className="wl-btn-orange"
            style={{ width: '100%', height: 46, fontSize: 15, borderRadius: 10, marginTop: 8 }}
          >
            + Опубликовать событие в линию SWINLINE 🚀
          </button>
        </form>
      </div>
    </div>
  </div>
)}
    </>
  )
}
