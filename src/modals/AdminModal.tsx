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

type Props = { CATS: any; S: any; accounts: any; addVirtualMoney: any; adminModalOpen: any; adminTab: any; allEvents: any; applyTemplate: any; currentUser: any; fetchSupabaseUsers: any; freshState: any; handleAdminDeleteUser: any; handleAdminPurgeEmpty: any; handleAdminReset: any; handleAdminToggleBlock: any; handleAdminTopUp: any; handleCancelEventAction: any; handleClearAllEvents: any; handleCreateMatch: any; handleSettleEventAction: any; handleToggleEventClosedAction: any; isAdmin: any; newMatchCat: any; newMatchIsLive: any; newMatchLeague: any; newMatchOdds1: any; newMatchOdds2: any; newMatchOddsX: any; newMatchScore: any; newMatchTeam1: any; newMatchTeam2: any; newMatchTime: any; newMatchTitle: any; notify: any; setAdminModalOpen: any; setAdminTab: any; setCreateMatchModalOpen: any; setDeleteEventModal: any; setEditEventModal: any; setEditIsLive: any; setEditLiveTime: any; setEditScore: any; setInspectingUser: any; setNewMatchCat: any; setNewMatchIsLive: any; setNewMatchLeague: any; setNewMatchOdds1: any; setNewMatchOdds2: any; setNewMatchOddsX: any; setNewMatchScore: any; setNewMatchTeam1: any; setNewMatchTeam2: any; setNewMatchTime: any; setNewMatchTitle: any; setS: any; setSelectedBet: any }

export default function AdminModal(props: Props) {
  const { CATS, S, accounts, addVirtualMoney, adminModalOpen, adminTab, allEvents, applyTemplate, currentUser, fetchSupabaseUsers, freshState, handleAdminDeleteUser, handleAdminPurgeEmpty, handleAdminReset, handleAdminToggleBlock, handleAdminTopUp, handleCancelEventAction, handleClearAllEvents, handleCreateMatch, handleSettleEventAction, handleToggleEventClosedAction, isAdmin, newMatchCat, newMatchIsLive, newMatchLeague, newMatchOdds1, newMatchOdds2, newMatchOddsX, newMatchScore, newMatchTeam1, newMatchTeam2, newMatchTime, newMatchTitle, notify, setAdminModalOpen, setAdminTab, setCreateMatchModalOpen, setDeleteEventModal, setEditEventModal, setEditIsLive, setEditLiveTime, setEditScore, setInspectingUser, setNewMatchCat, setNewMatchIsLive, setNewMatchLeague, setNewMatchOdds1, setNewMatchOdds2, setNewMatchOddsX, setNewMatchScore, setNewMatchTeam1, setNewMatchTeam2, setNewMatchTime, setNewMatchTitle, setS, setSelectedBet } = props
  return (
    <>
{/* 6. ADMIN DASHBOARD MODAL */}
{adminModalOpen && isAdmin && (
  <div className="wl-modal-overlay" onClick={() => setAdminModalOpen(false)}>
    <div className="wl-modal-card" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
      <div className="wl-modal-header" style={{ background: '#241a0d', borderBottomColor: '#f59e0b44' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={22} color="#f59e0b" />
          <span style={{ fontWeight: 800, fontSize: 17, color: '#f59e0b' }}>
            ПАНЕЛЬ АДМИНИСТРАТОРА ЛИНИИ SWINLINE
          </span>
        </div>
        <button className="wl-modal-x" onClick={() => setAdminModalOpen(false)} style={{ color: 'var(--tx-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={18} />
        </button>
      </div>

      {/* Admin Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#141824', padding: '8px 16px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        <button
          className={`wl-slip-tab ${adminTab === 'users' ? 'active' : ''}`}
          onClick={() => setAdminTab('users')}
        >
          Слежка за игроками ({accounts.length})
        </button>
        <button
          className={`wl-slip-tab ${adminTab === 'create' ? 'active' : ''}`}
          onClick={() => setAdminTab('create')}
        >
          + Добавить матч в линию
        </button>
        <button
          className={`wl-slip-tab ${adminTab === 'matches' ? 'active' : ''}`}
          onClick={() => setAdminTab('matches')}
        >
          Управление событиями ({allEvents.length})
        </button>
        <button
          className={`wl-slip-tab ${adminTab === 'bank' ? 'active' : ''}`}
          onClick={() => setAdminTab('bank')}
        >
          Касса и Балансы
        </button>
      </div>

      <div className="wl-modal-body">
        {/* TAB 0: USER SURVEILLANCE */}
        {adminTab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-secondary)' }}>
                МОНИТОРИНГ И УПРАВЛЕНИЕ ИГРОКАМИ ({accounts.length}):
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="wl-demo-btn"
                  style={{ color: '#3b82f6', borderColor: '#3b82f644' }}
                  onClick={async () => {
                    await fetchSupabaseUsers()
                    notify('Список игроков обновлен из Supabase! 🔄')
                  }}
                  title="Загрузить свежих игроков из Supabase"
                >
                  🔄 Обновить из Supabase
                </button>
                <button
                  className="wl-demo-btn"
                  style={{ color: '#f59e0b', borderColor: '#f59e0b44' }}
                  onClick={handleAdminPurgeEmpty}
                  title="Удалить пустые и неактивные аккаунты"
                >
                  🧹 Очистить пустые
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="wl-admin-table">
                <thead>
                  <tr>
                    <th>Игрок</th>
                    <th>Роль</th>
                    <th>Баланс</th>
                    <th>Статус</th>
                    <th>Действия администратора</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UserAvatar avatar={acc.avatar} name={acc.username} size={30} crown={acc.role === 'admin'} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{acc.username}</div>
                            <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{acc.title}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: acc.role === 'admin' ? '#f59e0b' : '#3b82f6', fontWeight: 700 }}>
                          {acc.role === 'admin' ? 'Администратор' : 'Игрок'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, fontFamily: 'var(--font-d)', color: 'var(--org)' }}>
                        {fmt(acc.bal)}
                      </td>
                      <td>
                        <span className={`wl-status-badge ${acc.isBlocked ? 'blocked' : 'active'}`}>
                          {acc.isBlocked ? 'Заблокирован ⛔' : 'Активен 🟢'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="wl-demo-btn"
                            style={{ color: 'var(--green)' }}
                            onClick={() => handleAdminTopUp(acc.id, 10000)}
                            title="Начислить 10 000 SV₽"
                          >
                            +10k SV₽
                          </button>
                          <button
                            className="wl-demo-btn"
                            style={{ color: '#ef4444' }}
                            onClick={() => handleAdminReset(acc.id)}
                            title="Обнулить баланс"
                          >
                            Обнулить
                          </button>
                          {acc.role !== 'admin' && (
                            <>
                              <button
                                className="wl-demo-btn"
                                onClick={() => handleAdminToggleBlock(acc.id)}
                              >
                                {acc.isBlocked ? 'Разблокировать' : 'Блок'}
                              </button>
                              <button
                                className="wl-demo-btn"
                                style={{ color: '#ef4444' }}
                                onClick={() => handleAdminDeleteUser(acc.id)}
                                title="Удалить аккаунт"
                              >
                                Удалить
                              </button>
                            </>
                          )}
                          <button
                            className="wl-demo-btn"
                            style={{ color: 'var(--tx-secondary)' }}
                            onClick={() => setInspectingUser(acc)}
                          >
                            Купоны ({acc.bets?.length || 0})
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 1: ADD MATCH FORM */}
        {adminTab === 'create' && (
          <form onSubmit={handleCreateMatch}>
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

            {/* Odds inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
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
                id="isLiveCheck"
                checked={newMatchIsLive}
                onChange={e => setNewMatchIsLive(e.target.checked)}
              />
              <label htmlFor="isLiveCheck" style={{ fontSize: 13, cursor: 'pointer' }}>
                Опубликовать как активный <b>● LIVE матч</b> (с красным пульсирующим индикатором)
              </label>
            </div>

            <button
              type="submit"
              className="wl-btn-orange"
              style={{ width: '100%', height: 46, fontSize: 15, borderRadius: 10, marginTop: 10 }}
            >
              + Опубликовать событие в линию SWINLINE 🚀
            </button>
          </form>
        )}

        {/* TAB 2: LIVE MATCH CONTROLLER */}
        {adminTab === 'matches' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-secondary)' }}>
                МАТЧИ В ЛИНИИ ({allEvents.length}):
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="wl-demo-btn"
                  style={{ color: 'var(--org)', borderColor: 'rgba(255,85,0,0.3)' }}
                  onClick={() => { setAdminModalOpen(false); setCreateMatchModalOpen(true) }}
                >
                  <PlusCircle size={14} /> + Добавить матч
                </button>
                {allEvents.length > 0 && (
                  <button
                    className="wl-demo-btn"
                    style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                    onClick={handleClearAllEvents}
                  >
                    <Trash2 size={14} /> Очистить все
                  </button>
                )}
              </div>
            </div>

            {allEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--tx-muted)', fontSize: 13, background: '#111520', borderRadius: 10, border: '1px dashed var(--border)' }}>
                В линии нет событий. Нажмите «+ Добавить матч» или перейдите во вкладку «+ Добавить матч в линию»!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 440, overflowY: 'auto' }}>
                {allEvents.map(ev => {
                  const st = S.st[ev.id]?.s || 'open'
                  return (
                    <div key={ev.id} style={{ background: '#171b26', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div>
                          <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev.league}</span>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {ev.title} {ev.score && <span className="wl-match-score-badge" style={{ marginLeft: 6 }}>{ev.score}</span>}
                          </div>
                        </div>
                        <span className={`st ${st === 'open' ? 'o' : st === 'closed' ? 'c' : st === 'done' ? 'f' : 'x'}`}>
                          {st === 'open' ? 'Открыто 🟢' : st === 'closed' ? 'Закрыто 🔒' : st === 'done' ? 'Завершено 🏆' : 'Отменено ❌'}
                        </span>
                      </div>

                      {/* Admin Action Buttons */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                        {st !== 'done' && st !== 'cancel' && (
                          <button
                            className="wl-demo-btn"
                            onClick={() => handleToggleEventClosedAction(ev)}
                          >
                            {st === 'closed' ? 'Открыть приём' : 'Закрыть приём'}
                          </button>
                        )}

                        <button
                          className="wl-demo-btn"
                          onClick={() => {
                            setEditEventModal(ev)
                            setEditScore(ev.score || '0 : 0')
                            setEditLiveTime(ev.liveTime || 'Скоро')
                            setEditIsLive(Boolean(ev.isLive))
                          }}
                        >
                          <Edit3 size={13} /> Счёт: {ev.score || '0 : 0'}
                        </button>

                        {/* Settle winners */}
                        {st !== 'done' && st !== 'cancel' && ev.out.slice(0, 3).map((out, idx) => (
                          <button
                            key={idx}
                            className="wl-demo-btn"
                            style={{ borderColor: 'var(--green-glow)' }}
                            onClick={() => handleSettleEventAction(ev, idx)}
                          >
                            Победил {out[0]}
                          </button>
                        ))}

                        {st !== 'done' && st !== 'cancel' && (
                          <button
                            className="wl-demo-btn"
                            style={{ color: '#ef4444' }}
                            onClick={() => handleCancelEventAction(ev)}
                          >
                            Отменить матч
                          </button>
                        )}

                        <button
                          className="wl-demo-btn"
                          style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', marginLeft: 'auto' }}
                          onClick={() => setDeleteEventModal(ev)}
                          title="Удалить матч из линии с подтверждением"
                        >
                          <Trash2 size={13} /> Удалить
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BANK & CASHIER */}
        {adminTab === 'bank' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              Управление кассой и балансами:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              <button
                className="wl-btn-orange"
                onClick={() => addVirtualMoney(50000)}
              >
                + 50 000 SV₽
              </button>
              <button
                className="wl-btn-orange"
                style={{ background: '#3b82f6' }}
                onClick={() => addVirtualMoney(250000)}
              >
                + 250 000 SV₽
              </button>
              <button
                className="wl-btn-green"
                onClick={() => addVirtualMoney(1000000)}
              >
                + 1 000 000 SV₽
              </button>
            </div>

            <button
              className="wl-sidebar-quick-btn"
              style={{ border: '1px solid #ef4444', color: '#ef4444', width: '100%', justifyContent: 'center' }}
              onClick={() => {
                if (confirm('Сбросить весь банк и историю ставок к начальным 10 000 SV₽?')) {
                  if (currentUser) {
                    supabase.rpc('self_reset_balance').then(({ data, error }) => {
                      if (!error && data) setS({ ...freshState(), bal: Number(data.bal) })
                      else notify('❌ Не удалось сбросить банк')
                    })
                  } else {
                    setS(freshState())
                  }
                  setSelectedBet(null)
                  notify('Касса и прогресс полностью сброшены')
                }
              }}
            >
              Сбросить кассу к исходным 10 000 SV₽
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
)}
    </>
  )
}
