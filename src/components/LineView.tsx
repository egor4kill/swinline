import type { Dispatch, SetStateAction } from 'react'
import {
  Star,
  PlusCircle,
  ShieldCheck,
  Lock,
  Unlock,
  Edit3,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { TOURNAMENT_PILLS, type Ev } from '../data'
import { PigLogo } from './Avatars'

type LineViewProps = {
  view: string
  setView: (v: string) => void
  selectedSport: number | null
  setSelectedSport: (s: number | null) => void
  allEvents: Ev[]
  groupedByLeague: [string, Ev[]][]
  S: any
  expandedMarkets: Record<string, boolean>
  favorites: Record<string, boolean>
  selectedBet: { evId: string; outcomeIdx: number; outcomeTitle: string; odds: number } | null
  isAdmin: boolean
  notify: (m: string) => void
  setSearchQuery: Dispatch<SetStateAction<string>>
  setCreateMatchModalOpen: (v: boolean) => void
  applyTemplate: (type: 'football' | 'cs2' | 'mma' | 'burger') => void
  toggleFavorite: (id: string, e: React.MouseEvent) => void
  toggleMarket: (id: string) => void
  selectOdd: (ev: Ev, outcomeIdx: number, title: string, odds: number) => void
  handleToggleEventClosedAction: (ev: Ev) => void
  handleSettleEventAction: (ev: Ev, outcomeIdx: number) => void
  handleCancelEventAction: (ev: Ev) => void
  setDeleteEventModal: (ev: Ev | null) => void
  setEditEventModal: (ev: Ev | null) => void
  setEditScore: (v: string) => void
  setEditLiveTime: (v: string) => void
  setEditIsLive: (v: boolean) => void
}

export default function LineView({
  view,
  setView,
  selectedSport,
  setSelectedSport,
  allEvents,
  groupedByLeague,
  S,
  expandedMarkets,
  favorites,
  selectedBet,
  isAdmin,
  notify,
  setSearchQuery,
  setCreateMatchModalOpen,
  applyTemplate,
  toggleFavorite,
  toggleMarket,
  selectOdd,
  handleToggleEventClosedAction,
  handleSettleEventAction,
  handleCancelEventAction,
  setDeleteEventModal,
  setEditEventModal,
  setEditScore,
  setEditLiveTime,
  setEditIsLive
}: LineViewProps) {
  return (
    <>
      {/* Banners */}
      <div className="wl-banners-slider">
        <div className="wl-banner-card highlight">
          <span className="wl-banner-tag">СТАРТОВЫЙ БОНУС</span>
          <div className="wl-banner-title">
            <span>10 000 SV₽</span> ДЛЯ НОВЫХ ИГРОКОВ
          </div>
          <div className="wl-banner-desc">
            Моментальное зачисление на баланс при входе. Делайте ставки на любые спортивные и киберспортивные матчи!
          </div>
          <div className="wl-banner-mascot">
            <PigLogo />
          </div>
        </div>

        <div className="wl-banner-card">
          <span className="wl-banner-tag" style={{ background: '#3b82f6', color: '#fff' }}>ХРЯК-КРЭШ</span>
          <div className="wl-banner-title" style={{ fontSize: 16 }}>
            Мультиплеер в реальном времени
          </div>
          <div className="wl-banner-desc">
            Раунды каждые 6 секунд для всех игроков — забирайте выигрыш с коэффициентами до x25.0!
          </div>
        </div>

        <div className="wl-banner-card">
          <span className="wl-banner-tag" style={{ background: '#a855f7', color: '#fff' }}>КОРЫТО ФОРТУНЫ</span>
          <div className="wl-banner-title" style={{ fontSize: 16 }}>
            Колесо множителей
          </div>
          <div className="wl-banner-desc">
            Вращайте колесо и получайте моментальные призы с джекпотом x10.0!
          </div>
        </div>
      </div>

      {/* Tournament Pills & Admin Fast Action */}
      <div className="wl-tournaments-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
          {TOURNAMENT_PILLS.map((pill, idx) => (
            <button
              key={idx}
              className="wl-tourney-pill"
              onClick={() => {
                setSearchQuery(pill.name.split(' ')[0])
                notify(`Фильтр по турниру: ${pill.name}`)
              }}
            >
              <span className="wl-tourney-badge">{pill.tag}</span>
              <span>{pill.name}</span>
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            className="wl-btn-orange"
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
            onClick={() => setCreateMatchModalOpen(true)}
          >
            <PlusCircle size={15} />
            <span>+ Создать событие</span>
          </button>
        )}
      </div>

      {/* Round Filters */}
      <div className="wl-round-filters">
        <button
          className={`wl-round-btn ${selectedSport === null ? 'active' : ''}`}
          onClick={() => setSelectedSport(null)}
        >
          <div className="wl-round-icon">✓</div>
          <span>Все исходы ({allEvents.length})</span>
        </button>
        <button
          className={`wl-round-btn ${view === 'live' ? 'active' : ''}`}
          onClick={() => setView(view === 'live' ? 'line' : 'live')}
        >
          <div className="wl-round-icon" style={{ background: '#ef4444', color: '#fff' }}>●</div>
          <span>Live матчи ({allEvents.filter(e => e.isLive).length})</span>
        </button>
        <button
          className={`wl-round-btn ${selectedSport === 0 ? 'active' : ''}`}
          onClick={() => setSelectedSport(0)}
        >
          <div className="wl-round-icon">⚽</div>
          <span>Свин-Лига РПЛ</span>
        </button>
        <button
          className={`wl-round-btn ${selectedSport === 4 ? 'active' : ''}`}
          onClick={() => setSelectedSport(4)}
        >
          <div className="wl-round-icon">🎮</div>
          <span>Кибер-Хряк</span>
        </button>
        <button
          className={`wl-round-btn ${selectedSport === 6 ? 'active' : ''}`}
          onClick={() => setSelectedSport(6)}
        >
          <div className="wl-round-icon">🥊</div>
          <span>Хрюк-MMA</span>
        </button>
      </div>

      {/* Matches grouped by League */}
      {groupedByLeague.length === 0 ? (
        isAdmin ? (
          <div style={{ textAlign: 'center', padding: '50px 24px', background: 'var(--bg-card)', borderRadius: 16, border: '1px dashed rgba(255, 85, 0, 0.45)', margin: '14px 0' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: '#fff' }}>
              Линия событий пуста
            </h3>
            <p style={{ color: 'var(--tx-secondary)', fontSize: 14, maxWidth: 500, margin: '0 auto 20px', lineHeight: 1.5 }}>
              Все старые ставки и тестовые матчи очищены. Вы вошли со статусом <b>ADMIN (egor4kill)</b> — создайте новые матчи или запустите готовые шаблоны в 1 клик:
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
              <button
                className="wl-btn-orange"
                style={{ padding: '12px 26px', fontSize: 15, fontWeight: 800, borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                onClick={() => setCreateMatchModalOpen(true)}
              >
                <PlusCircle size={18} />
                <span>+ Создать событие в линию</span>
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx-muted)', marginBottom: 10, fontWeight: 700 }}>
              БЫСТРЫЕ ШАБЛОНЫ МАТЧЕЙ:
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="wl-demo-btn" onClick={() => { applyTemplate('football'); setCreateMatchModalOpen(true) }}>
                ⚽ Футбол: Спартак vs Зенит
              </button>
              <button className="wl-demo-btn" onClick={() => { applyTemplate('cs2'); setCreateMatchModalOpen(true) }}>
                🎮 CS2: NAVI vs Spirit
              </button>
              <button className="wl-demo-btn" onClick={() => { applyTemplate('mma'); setCreateMatchModalOpen(true) }}>
                🥊 UFC: Махачев vs Царукян
              </button>
              <button className="wl-demo-btn" onClick={() => { applyTemplate('burger'); setCreateMatchModalOpen(true) }}>
                🌭 Поедание бургеров
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 14, border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🐷</div>
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>Линия обновляется</h3>
            <p style={{ color: 'var(--tx-secondary)', fontSize: 14 }}>
              Администратор готовит свежие события и коэффициенты. Скоро здесь появятся новые матчи!
            </p>
          </div>
        )
      ) : (
        groupedByLeague.map(([leagueName, leagueEvents]) => (
          <div className="wl-table-container" key={leagueName}>
            <div className="wl-league-header">
              <div className="wl-league-title">
                <span>{leagueName}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
                Событий: {leagueEvents.length}
              </div>
            </div>

            <div className="wl-columns-header">
              <div>Событие / Участники</div>
              <div className="wl-odds-columns-labels">
                <span>1</span>
                <span>X</span>
                <span>2</span>
                <span>Фора 1</span>
                <span>Фора 2</span>
                <span>Тотал М</span>
                <span>Тотал Б</span>
              </div>
            </div>

            {leagueEvents.map(ev => {
              const eventStatus = S.st[ev.id]?.s || 'open'
              const isClosed = eventStatus === 'closed'
              const isDone = eventStatus === 'done'
              const isCancelled = eventStatus === 'cancel'
              const winningIdx = S.st[ev.id]?.w
              const isExpanded = !!expandedMarkets[ev.id]

              const extraOutcomesCount = Math.max(0, ev.out.length - 3) +
                (ev.extraMarkets?.reduce((n, m) => n + m.out.length, 0) || 0)
              // На телефоне первые три исхода главные, остальные прячутся под «+N»
              const oddsCols = Math.min(4, ev.out.length + (extraOutcomesCount > 0 ? 1 : 0))

              return (
                <div key={ev.id} className="wl-event-block">
                  <div className="wl-match-row">
                    <div className="wl-match-info">
                      <div className="wl-match-teams">
                        <button
                          onClick={(e) => toggleFavorite(ev.id, e)}
                          title="Добавить в избранное"
                          style={{ color: favorites[ev.id] ? 'var(--org)' : '#4a5568' }}
                        >
                          <Star size={15} fill={favorites[ev.id] ? 'var(--org)' : 'none'} />
                        </button>
                        <span>{ev.title}</span>
                        {ev.score && (
                          <span className="wl-match-score-badge">{ev.score}</span>
                        )}
                      </div>

                      <div className="wl-match-meta">
                        {ev.isLive ? (
                          <span className="live-indicator">● {ev.liveTime || 'LIVE'}</span>
                        ) : (
                          <span>{ev.liveTime || 'Скоро'}</span>
                        )}
                        <span>•</span>
                        <span style={{ color: 'var(--tx-muted)' }}>{ev.desc}</span>
                        {ev.extraMarkets && ev.extraMarkets.length > 0 && (
                          <button
                            className="wl-match-extra-link"
                            onClick={() => toggleMarket(ev.id)}
                          >
                            {isExpanded ? 'Скрыть роспись ▲' : `+${ev.extraMarkets.length * 2} вариантов ➔`}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={`wl-odds-matrix ${isExpanded ? 'expanded' : ''} ${oddsCols < 4 ? `wl-odds-cols-${oddsCols}` : ''}`}>
                      {ev.out.slice(0, 7).map((outcome, idx) => {
                        const isSelected = selectedBet?.evId === ev.id && selectedBet?.outcomeIdx === idx
                        const isWinner = isDone && winningIdx === idx
                        const isDisabled = isClosed || isDone || isCancelled

                        return (
                          <button
                            key={idx}
                            className={`wl-odd-box ${isSelected ? 'selected' : ''}`}
                            style={{
                              borderColor: isWinner ? 'var(--green)' : undefined,
                              boxShadow: isWinner ? '0 0 10px rgba(34, 197, 94, 0.4)' : undefined
                            }}
                            disabled={isDisabled}
                            onClick={() => selectOdd(ev, idx, outcome[0], outcome[1])}
                          >
                            <span className="wl-odd-val">{outcome[1].toFixed(2)}</span>
                            <span className="wl-odd-lbl">{outcome[0].split(' ')[0]}</span>
                          </button>
                        )
                      })}
                      {extraOutcomesCount > 0 && (
                        <button
                          type="button"
                          className={`wl-odds-more ${isExpanded ? 'expanded' : ''}`}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Скрыть дополнительные рынки' : `Показать ещё ${extraOutcomesCount} рынков`}
                          title={isExpanded ? 'Скрыть дополнительные рынки' : `Ещё ${extraOutcomesCount} рынков`}
                          onClick={() => toggleMarket(ev.id)}
                        >
                          {isExpanded ? 'Скрыть' : `+${extraOutcomesCount}`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Extra Markets (if any) */}
                  {isExpanded && ev.extraMarkets && (
                    <div className="wl-extra-markets" style={{ padding: '10px 16px', background: '#111520', borderTop: '1px solid #1a202c' }}>
                      {ev.extraMarkets.map((market, mIdx) => (
                        <div key={mIdx} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 4 }}>
                            {market.title}:
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {market.out.map((o, oIdx) => (
                              <div key={oIdx} style={{ background: '#171c28', padding: '6px 12px', borderRadius: 6, fontSize: 12 }}>
                                <span>{o[0]}</span> <b style={{ color: 'var(--org)' }}>{o[1].toFixed(2)}</b>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* IN-LINE ADMIN BAR FOR THE PLATFORM OWNER */}
                  {isAdmin && (
                    <div className="wl-match-admin-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ShieldCheck size={13} /> АДМИН:
                        </span>
                        <span className={`wl-status-badge ${eventStatus === 'open' ? 'active' : eventStatus === 'done' ? 'active' : 'blocked'}`}>
                          {eventStatus === 'open' ? 'Приём открыт 🟢' : eventStatus === 'closed' ? 'Приём закрыт 🔒' : eventStatus === 'done' ? 'Завершён 🏆' : 'Отменён ❌'}
                        </span>

                        {/* Close/Open toggle */}
                        {eventStatus !== 'done' && eventStatus !== 'cancel' && (
                          <button
                            className={`wl-admin-action-btn ${isClosed ? 'success' : 'warning'}`}
                            onClick={() => handleToggleEventClosedAction(ev)}
                          >
                            {isClosed ? <Unlock size={12} /> : <Lock size={12} />}
                            <span>{isClosed ? 'Открыть приём' : 'Закрыть приём'}</span>
                          </button>
                        )}

                        {/* Score & Live Editor */}
                        <button
                          className="wl-admin-action-btn"
                          onClick={() => {
                            setEditEventModal(ev)
                            setEditScore(ev.score || '0 : 0')
                            setEditLiveTime(ev.liveTime || 'Скоро')
                            setEditIsLive(Boolean(ev.isLive))
                          }}
                          title="Редактировать текущий счёт и статус"
                        >
                          <Edit3 size={12} />
                          <span>Счёт: {ev.score || '0 : 0'}</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {/* Winner settling */}
                        {eventStatus !== 'done' && eventStatus !== 'cancel' && (
                          <>
                            <span style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 600 }}>Рассчитать:</span>
                            {ev.out.slice(0, 3).map((outcome, oIdx) => (
                              <button
                                key={oIdx}
                                className="wl-admin-action-btn success"
                                onClick={() => handleSettleEventAction(ev, oIdx)}
                                title={`Рассчитать победу: ${outcome[0]}`}
                              >
                                Победил {outcome[0]}
                              </button>
                            ))}
                            <button
                              className="wl-admin-action-btn warning"
                              onClick={() => handleCancelEventAction(ev)}
                              title="Отменить событие и вернуть деньги игрокам"
                            >
                              <RotateCcw size={12} />
                              <span>Отменить матч</span>
                            </button>
                          </>
                        )}

                        {/* Safe Deletion Button */}
                        <button
                          className="wl-admin-action-btn danger"
                          onClick={() => setDeleteEventModal(ev)}
                          title="Удалить событие из линии (с защитой)"
                        >
                          <Trash2 size={12} />
                          <span>Удалить</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}
    </>
  )
}
