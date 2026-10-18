import { useState, useEffect, useRef, useMemo } from 'react'
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
  BarChart3,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Sparkle
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
  type Ev
} from './data'
import { payout, r2, placeBet, settleEvent, cancelEvent } from './logic'

const KEY = 'svinline.v2'
const freshState = () => ({
  bal: START,
  bets: [] as any[],
  log: [{ t: Date.now(), x: 'Стартовый баланс', d: START }],
  st: {} as Record<string, { s: string; w?: number }>
})

function loadState() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (o && typeof o.bal === 'number') return o
  } catch {}
  return freshState()
}

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' SV₽'

const PigLogo = () => (
  <svg width="28" height="28" viewBox="0 0 100 100" role="img" aria-label="Свин-маскот SVINLINE">
    <use href="#pig" />
  </svg>
)

export default function App() {
  const [S, setS] = useState<any>(loadState)
  const [view, setView] = useState('line') // line | live | esports | games24 | wallet | promos | results | about
  const [selectedSport, setSelectedSport] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({})

  // Bet slip state
  const [selectedBet, setSelectedBet] = useState<{ evId: string; outcomeIdx: number; outcomeTitle: string; odds: number } | null>(null)
  const [stake, setStake] = useState('500')
  const [slipOpen, setSlipOpen] = useState(false)
  const [slipTab, setSlipTab] = useState<'coupon' | 'ingame'>('coupon')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  // Esports player simulation state
  const [streamPlaying, setStreamPlaying] = useState(true)
  const [chatMessages, setChatMessages] = useState<string[]>([
    '🔥 SvinPro: ХРЯК С Deagle ПРОСТО МОНСТР!!',
    '🐷 BaconKing: Ставил 5000 SV₽ на FURIA, не подведите!',
    '🎮 CyberKaban: Эко-раунд от BetBoom, сейчас будет камбэк',
    '⭐ LuckyPig: Коэффициент 1.42 железобетон',
    '⚡ Porky_99: Где трансляция? А, вот пошла!'
  ])

  // Games 24/7 Roulette state
  const [spinning, setSpinning] = useState(false)
  const [rouletteResult, setRouletteResult] = useState<string | null>(null)

  const busy = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S))
    } catch {}
  }, [S])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2800)
    return () => clearTimeout(t)
  }, [msg])

  // Fake live chat in Esports
  useEffect(() => {
    if (view !== 'esports') return
    const fakeChats = [
      'Хряки давят на B-пленте!',
      'КТО ВЫИГРАЕТ 2-Ю КАРТУ???',
      'SVINLINE ДЕЛАЕТ РАЗНИЦУ',
      'Кабан 1 в 3 затащил!',
      'Коэффициент уже 1.85, успевайте',
      'Фрибет зашел на ура',
      'Свинья на AWP лучший снайпер турнира'
    ]
    const interval = setInterval(() => {
      const randomMsg = fakeChats[Math.floor(Math.random() * fakeChats.length)]
      const user = ['PorkMaster', 'OinkBoy', 'BaconGod', 'HamsterPro', 'PiggyBoss'][Math.floor(Math.random() * 5)]
      setChatMessages(prev => [...prev.slice(-12), `${user}: ${randomMsg}`])
    }, 3800)
    return () => clearInterval(interval)
  }, [view])

  const notify = (m: string) => setMsg(m)

  const mutate = (fn: (s: any) => void, message?: string) => {
    const next = structuredClone(S)
    fn(next)
    setS(next)
    if (message) notify(message)
  }

  const addVirtualMoney = (amount: number = 5000) => {
    mutate(s => {
      s.bal = r2(s.bal + amount)
      s.log.unshift({ t: Date.now(), x: `Начисление ${fmt(amount)} (Бесплатно)`, d: amount })
    }, `+${fmt(amount)} начислено на виртуальный счёт!`)
  }

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavorites(prev => ({ ...prev, [id]: !prev[id] }))
    notify(favorites[id] ? 'Удалено из избранного' : 'Добавлено в избранное ⭐')
  }

  const toggleMarket = (id: string) => {
    setExpandedMarkets(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const selectOdd = (ev: Ev, outcomeIdx: number, title: string, odds: number) => {
    if (selectedBet?.evId === ev.id && selectedBet?.outcomeIdx === outcomeIdx) {
      setSelectedBet(null)
      return
    }
    setSelectedBet({
      evId: ev.id,
      outcomeIdx,
      outcomeTitle: title,
      odds
    })
    setSlipTab('coupon')
    setSlipOpen(true)
    setErr('')
  }

  const handlePlaceBet = (e: FormEvent) => {
    e.preventDefault()
    if (busy.current || !selectedBet) return
    const v = parseFloat(stake)
    const next = structuredClone(S)
    const res = placeBet(next, selectedBet.evId, selectedBet.outcomeIdx, v)

    if (res.err) {
      setErr(res.err)
      return
    }

    busy.current = true
    setTimeout(() => { busy.current = false }, 400)
    setS(next)
    setSelectedBet(null)
    setErr('')
    notify(`Ставка ${fmt(v)} успешно принята!`)
  }

  // 24/7 Roulette game simulation
  const spinRoulette = () => {
    if (spinning) return
    if (S.bal < 100) {
      notify('Недостаточно SV₽! Нажмите «+ Начислить SV₽» вверху.')
      return
    }
    setSpinning(true)
    setRouletteResult(null)

    // Deduct 100 SV₽
    mutate(s => {
      s.bal = r2(s.bal - 100)
      s.log.unshift({ t: Date.now(), x: 'Ставка в «Корыто Фортуны»', d: -100 })
    })

    setTimeout(() => {
      const multipliers = [0, 0, 0.5, 1.5, 2, 5, 10]
      const mul = multipliers[Math.floor(Math.random() * multipliers.length)]
      const win = 100 * mul

      mutate(s => {
        if (win > 0) {
          s.bal = r2(s.bal + win)
          s.log.unshift({ t: Date.now(), x: `Выигрыш в «Корыто Фортуны» (x${mul})`, d: win })
        }
      })

      setSpinning(false)
      setRouletteResult(mul === 0 ? 'Увы, корыто пусто (x0)!' : `Ура! Выпало x${mul} (+${fmt(win)})! 🎉`)
    }, 1200)
  }

  // Filtered events
  const filteredEvents = useMemo(() => {
    return EVENTS.filter(ev => {
      if (view === 'live' && !ev.isLive) return false
      if (view === 'esports' && ev.cat !== 4) return false
      if (selectedSport !== null && ev.cat !== selectedSport) return false
      if (favoritesOnly && !favorites[ev.id]) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = ev.title.toLowerCase().includes(q)
        const matchDesc = ev.desc.toLowerCase().includes(q)
        const matchLeague = ev.league.toLowerCase().includes(q)
        const matchTeams = (ev.team1?.toLowerCase().includes(q) || ev.team2?.toLowerCase().includes(q))
        if (!matchTitle && !matchDesc && !matchLeague && !matchTeams) return false
      }
      return true
    })
  }, [view, selectedSport, favoritesOnly, favorites, searchQuery])

  // Group events by league
  const groupedByLeague = useMemo(() => {
    const map = new Map<string, Ev[]>()
    filteredEvents.forEach(ev => {
      if (!map.has(ev.league)) map.set(ev.league, [])
      map.get(ev.league)!.push(ev)
    })
    return Array.from(map.entries())
  }, [filteredEvents])

  // Count active bets
  const activeBetsCount = S.bets.filter((b: any) => b.state === 'open').length

  const getSportIcon = (iconName: string) => {
    switch (iconName) {
      case 'Trophy': return <Trophy size={16} />
      case 'Gamepad2': return <Gamepad2 size={16} />
      case 'Flame': return <Flame size={16} />
      case 'Building': return <Building size={16} />
      case 'Sparkles': return <Sparkles size={16} />
      case 'Swords': return <Swords size={16} />
      case 'Activity': return <Activity size={16} />
      case 'Utensils': return <Utensils size={16} />
      default: return <Sparkles size={16} />
    }
  }

  // Bet calculation values
  const stakeVal = parseFloat(stake)
  const isStakeValid = isFinite(stakeVal) && stakeVal > 0
  const currentOdds = selectedBet?.odds || 1
  const potentialPayout = isStakeValid ? payout(stakeVal, currentOdds) : 0
  const netProfit = isStakeValid ? r2(potentialPayout - stakeVal) : 0

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 1. Header (Winline style with SVINLINE branding) */}
      <header className="wl-header">
        <div className="wl-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Logo stadium-pill */}
            <div className="wl-logo-pill" onClick={() => { setView('line'); setSelectedSport(null) }}>
              <PigLogo />
              <div className="wl-logo-text">
                SVIN<span>LINE</span>
              </div>
            </div>

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

          {/* Right Header: Balance & Action Buttons */}
          <div className="wl-header-right">
            <div className="wl-balance-chip" title="Ваш текущий виртуальный баланс">
              <span>Баланс:</span>
              <span className="wl-balance-amount">{fmt(S.bal)}</span>
            </div>

            <button
              className="wl-btn-orange"
              onClick={() => addVirtualMoney(5000)}
              title="Начислить бесплатные SV₽"
            >
              + Начислить SV₽
            </button>

            <button
              className="wl-btn-green"
              onClick={() => {
                notify('🎁 Бонус 0 ₽ активирован! Свинья довольна!')
              }}
              title="Приветственный бонус"
            >
              Бонус 0 ₽
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main 3-Column Sportsbook Workspace */}
      <div className="wl-layout">
        {/* Left Sidebar: Categories & Search */}
        <aside className="wl-sidebar">
          {/* Search box */}
          <div className="wl-search-box">
            <Search className="wl-search-icon" size={16} />
            <input
              type="text"
              className="wl-search-input"
              placeholder="Поиск событий..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#888' }}
                onClick={() => setSearchQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="wl-sidebar-quick">
            <button
              className={`wl-sidebar-quick-btn ${favoritesOnly ? 'active' : ''}`}
              onClick={() => setFavoritesOnly(prev => !prev)}
            >
              <Star size={16} color={favoritesOnly ? 'var(--org)' : '#94a3b8'} />
              <span>Избранное</span>
              {Object.values(favorites).filter(Boolean).length > 0 && (
                <span className="wl-badge-count">{Object.values(favorites).filter(Boolean).length}</span>
              )}
            </button>

            <button
              className={`wl-sidebar-quick-btn ${selectedSport === null && !favoritesOnly ? 'active' : ''}`}
              onClick={() => { setSelectedSport(null); setFavoritesOnly(false) }}
            >
              <Clock size={16} />
              <span>Все события</span>
            </button>
          </div>

          {/* Sports & Absurd categories list */}
          <div className="wl-sports-list">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase', padding: '6px 12px' }}>
              Категории ставок
            </div>
            {SPORT_CATEGORIES.map(sport => {
              const isActive = selectedSport === sport.id
              return (
                <button
                  key={sport.id}
                  className={`wl-sport-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSport(isActive ? null : sport.id)
                    setFavoritesOnly(false)
                    if (view !== 'line' && view !== 'live') setView('line')
                  }}
                >
                  <div className="wl-sport-left">
                    <span style={{ color: isActive ? 'var(--org)' : 'inherit' }}>
                      {getSportIcon(sport.icon)}
                    </span>
                    <span>{sport.name}</span>
                  </div>
                  <span className="wl-badge-count">{sport.count}</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Center Content Workspace */}
        <main className="wl-center">
          {/* A. LINE OR LIVE VIEW */}
          {(view === 'line' || view === 'live') && (
            <>
              {/* Top Promo Banners (Screenshot 3 & 1 style) */}
              <div className="wl-banners-slider">
                <div className="wl-banner-card highlight">
                  <span className="wl-banner-tag">СВИНОБЕТ • BET RACE</span>
                  <div className="wl-banner-title">
                    БОНУС <span>0 ₽</span> — ЗАТО СВИНЬЯ ДОВОЛЬНА
                  </div>
                  <div className="wl-banner-desc">
                    Широкая линия эксклюзивных событий и турниров. Рекордные коэффициенты до 99.00!
                  </div>
                  <div className="wl-banner-mascot">
                    <PigLogo />
                  </div>
                </div>

                <div className="wl-banner-card">
                  <span className="wl-banner-tag" style={{ background: '#3b82f6', color: '#fff' }}>ХРЮКЭШБЭК</span>
                  <div className="wl-banner-title" style={{ fontSize: 16 }}>
                    Возврат 0% со всех проигрышей
                  </div>
                  <div className="wl-banner-desc">
                    Честно, открыто, без мелкого шрифта. Начисляется моментально в корыто.
                  </div>
                </div>

                <div className="wl-banner-card">
                  <span className="wl-banner-tag" style={{ background: '#a855f7', color: '#fff' }}>VIP-ХРЯК</span>
                  <div className="wl-banner-title" style={{ fontSize: 16 }}>
                    Премиум статус для избранных
                  </div>
                  <div className="wl-banner-desc">
                    100% уверенности, 0% понимания правил. Доступ к закрытым лужам.
                  </div>
                </div>
              </div>

              {/* Tournament quick tags pills (Screenshot 3) */}
              <div className="wl-tournaments-bar">
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

              {/* Sport round buttons filter (Screenshot 1 & 3) */}
              <div className="wl-round-filters">
                <button
                  className={`wl-round-btn ${selectedSport === null ? 'active' : ''}`}
                  onClick={() => setSelectedSport(null)}
                >
                  <div className="wl-round-icon">✓</div>
                  <span>Все исходы</span>
                </button>
                <button
                  className={`wl-round-btn ${view === 'live' ? 'active' : ''}`}
                  onClick={() => setView(view === 'live' ? 'line' : 'live')}
                >
                  <div className="wl-round-icon" style={{ background: '#ef4444', color: '#fff' }}>●</div>
                  <span>Live матчи</span>
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
                  className={`wl-round-btn ${selectedSport === 5 ? 'active' : ''}`}
                  onClick={() => setSelectedSport(5)}
                >
                  <div className="wl-round-icon">🍔</div>
                  <span>Бургеры</span>
                </button>
                <button
                  className={`wl-round-btn ${selectedSport === 1 ? 'active' : ''}`}
                  onClick={() => setSelectedSport(1)}
                >
                  <div className="wl-round-icon">🔥</div>
                  <span>Мемы</span>
                </button>
                <button
                  className={`wl-round-btn ${selectedSport === 3 ? 'active' : ''}`}
                  onClick={() => setSelectedSport(3)}
                >
                  <div className="wl-round-icon">🎪</div>
                  <span>Абсурд</span>
                </button>
              </div>

              {/* Featured Match of the Day (Screenshot 3 style) */}
              {selectedSport === null && !searchQuery && (
                <div className="wl-match-of-day">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="wl-mod-badge">
                      <Sparkle size={13} /> МАТЧ ДНЯ • СВИН-ЛИГА РПЛ
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>
                      Прямая трансляция • 2-й тайм
                    </div>
                  </div>

                  <div className="wl-mod-content">
                    <div className="wl-mod-team">
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#ef444422', border: '2px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                        🐷
                      </div>
                      <div>
                        <div>Спартак Хряк</div>
                        <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>Хозяева поля</div>
                      </div>
                    </div>

                    <div className="wl-mod-score">
                      <div className="wl-mod-score-box">2 : 0</div>
                      <div className="wl-mod-timer">73' (Идёт игра)</div>
                    </div>

                    <div className="wl-mod-team right">
                      <div style={{ textAlign: 'right' }}>
                        <div>Рубин Кабаны</div>
                        <div style={{ fontSize: 12, color: 'var(--tx-muted)' }}>В гостях</div>
                      </div>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#22c55e22', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                        🐗
                      </div>
                    </div>
                  </div>

                  {/* Direct odds buttons on the featured match */}
                  <div className="wl-mod-odds">
                    <button
                      className={`wl-odd-box ${selectedBet?.evId === 'e5' && selectedBet?.outcomeIdx === 0 ? 'selected' : ''}`}
                      onClick={() => selectOdd(EVENTS[4], 0, 'П1 (Спартак Хряк)', 1.85)}
                    >
                      <span className="wl-odd-lbl">Победа 1</span>
                      <span className="wl-odd-val">1.85</span>
                    </button>
                    <button
                      className={`wl-odd-box ${selectedBet?.evId === 'e5' && selectedBet?.outcomeIdx === 1 ? 'selected' : ''}`}
                      onClick={() => selectOdd(EVENTS[4], 1, 'Ничья (X)', 3.30)}
                    >
                      <span className="wl-odd-lbl">Ничья X</span>
                      <span className="wl-odd-val">3.30</span>
                    </button>
                    <button
                      className={`wl-odd-box ${selectedBet?.evId === 'e5' && selectedBet?.outcomeIdx === 2 ? 'selected' : ''}`}
                      onClick={() => selectOdd(EVENTS[4], 2, 'Победа 2 (Рубин Кабаны)', 4.10)}
                    >
                      <span className="wl-odd-lbl">Победа 2</span>
                      <span className="wl-odd-val">4.10</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Main Events Table grouped by League (Screenshot 1) */}
              {groupedByLeague.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 14, border: '1px dashed var(--border)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🐷</div>
                  <h3 style={{ fontSize: 18, marginBottom: 6 }}>Ничего не найдено</h3>
                  <p style={{ color: 'var(--tx-secondary)', fontSize: 14 }}>
                    Попробуйте изменить запрос поиска или выбрать другую категорию.
                  </p>
                </div>
              ) : (
                groupedByLeague.map(([leagueName, leagueEvents]) => (
                  <div className="wl-table-container" key={leagueName}>
                    {/* League Header */}
                    <div className="wl-league-header">
                      <div className="wl-league-title">
                        <span>{leagueName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--tx-muted)' }}>
                        <span>Событий: {leagueEvents.length}</span>
                      </div>
                    </div>

                    {/* Columns labels header */}
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

                    {/* League Match Rows */}
                    {leagueEvents.map(ev => {
                      const eventStatus = S.st[ev.id]?.s || 'open'
                      const isClosed = eventStatus === 'closed'
                      const isDone = eventStatus === 'done'
                      const isCancelled = eventStatus === 'cancel'
                      const winningIdx = S.st[ev.id]?.w
                      const isExpanded = !!expandedMarkets[ev.id]

                      return (
                        <div key={ev.id} style={{ borderBottom: '1px solid #1a202c' }}>
                          <div className="wl-match-row">
                            {/* Match Title & Info */}
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
                                <button
                                  className="wl-match-extra-link"
                                  onClick={() => toggleMarket(ev.id)}
                                >
                                  {isExpanded ? 'Скрыть роспись ▲' : '+14 вариантов ➔'}
                                </button>
                              </div>
                            </div>

                            {/* Odds Matrix (7 columns: 1, X, 2, F1, F2, TM, TB) */}
                            <div className="wl-odds-matrix">
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
                                    title={`${outcome[0]}: ${outcome[1].toFixed(2)}`}
                                  >
                                    <span className="wl-odd-val">{outcome[1].toFixed(2)}</span>
                                    <span className="wl-odd-lbl">{outcome[0].split(' ')[0]}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Extra Markets & Demo Management Drawer */}
                          {isExpanded && (
                            <div className="wl-extra-markets">
                              {/* Extra Markets */}
                              {ev.extraMarkets && ev.extraMarkets.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                                  {ev.extraMarkets.map((em, mIdx) => (
                                    <div key={mIdx} style={{ background: '#161a24', padding: 10, borderRadius: 8 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--tx-secondary)' }}>
                                        {em.title}
                                      </div>
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        {em.out.map((eo, eoIdx) => (
                                          <button
                                            key={eoIdx}
                                            className="wl-odd-box"
                                            style={{ flex: 1 }}
                                            onClick={() => selectOdd(ev, 100 + mIdx * 10 + eoIdx, `${em.title} (${eo[0]})`, eo[1])}
                                          >
                                            <span className="wl-odd-lbl">{eo[0]}</span>
                                            <span className="wl-odd-val">{eo[1].toFixed(2)}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Demo match administration buttons */}
                              <div className="wl-demo-controls">
                                <span style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>Демо-расчёт матча:</span>
                                {eventStatus === 'open' && (
                                  <button
                                    className="wl-demo-btn"
                                    onClick={() => mutate(s => { s.st[ev.id] = { s: 'closed' } }, `Приём ставок на «${ev.title}» закрыт`)}
                                  >
                                    Закрыть приём
                                  </button>
                                )}
                                {ev.out.slice(0, 3).map((outcome, oIdx) => (
                                  <button
                                    key={oIdx}
                                    className="wl-demo-btn"
                                    style={{ borderColor: 'var(--green-glow)' }}
                                    onClick={() => mutate(s => settleEvent(s, ev.id, oIdx), `Матч завершён! Победил исход: ${outcome[0]}`)}
                                  >
                                    Выиграл: {outcome[0]}
                                  </button>
                                ))}
                                <button
                                  className="wl-demo-btn"
                                  style={{ color: '#ef4444' }}
                                  onClick={() => mutate(s => cancelEvent(s, ev.id), `Событие отменено, ставки возвращены на баланс`)}
                                >
                                  Отменить событие
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
          )}

          {/* B. ESPORTS STREAM VIEW (Screenshot 2) */}
          {view === 'esports' && (
            <div>
              {/* Top sub-tabs */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                {['ГЛАВНАЯ', 'LIVE', 'DOTA 2', 'CS 2', 'VALORANT', 'MOBILE LEGENDS', 'RAINBOW SIX'].map((tab, idx) => (
                  <button
                    key={idx}
                    className="wl-sidebar-quick-btn"
                    style={{ fontWeight: idx === 3 ? 800 : 600, color: idx === 3 ? 'var(--org)' : undefined }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tournament Match Title Header */}
              <div style={{ background: '#141822', padding: '14px 18px', borderRadius: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--org)', fontWeight: 800 }}>THUNDERPICK WORLD CHAMPIONSHIP • ГРАНД-ФИНАЛ</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                    FURIA Piglets vs BetBoom Svin Team
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 24, fontFamily: 'var(--font-d)', fontWeight: 800, color: 'var(--org)' }}>
                    1 : 0
                  </div>
                  <div className="wl-badge-count" style={{ background: '#22c55e22', color: '#22c55e', borderColor: '#22c55e55' }}>
                    КАРТА 2 • ПЕРЕРЫВ
                  </div>
                </div>
              </div>

              {/* Interactive Player & Stats Area */}
              <div className="wl-esports-arena">
                {/* Simulated Stream Player */}
                <div className="wl-stream-player">
                  <div className="wl-stream-hud">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 999 }}>
                      <div className="live-badge-dot" />
                      <span style={{ fontSize: 12, fontWeight: 700 }}>LIVE 1080p • 42 819 зрителей</span>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>
                      Карта: Dust 2
                    </div>
                  </div>

                  {/* Visualizer inside the stream */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 64, animation: streamPlaying ? 'pulse 2s infinite' : 'none' }}>
                      🐷🎮
                    </div>
                    <div style={{ fontFamily: 'var(--font-d)', fontWeight: 800, fontSize: 22, marginTop: 12 }}>
                      SVIN-ESPORTS ARENA
                    </div>
                    <div style={{ color: 'var(--tx-secondary)', fontSize: 13, marginTop: 4 }}>
                      {streamPlaying ? 'Прямой эфир турнира CS2 • Идёт разминка' : 'Трансляция на паузе'}
                    </div>
                  </div>

                  {/* Player controls */}
                  <div className="wl-stream-bottom-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => setStreamPlaying(p => !p)} style={{ color: '#fff' }}>
                        {streamPlaying ? <Pause size={20} /> : <Play size={20} />}
                      </button>
                      <button style={{ color: '#fff' }}>
                        <Volume2 size={20} />
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>01:24:19</span>
                    </div>
                    <div>
                      <button style={{ color: '#fff' }}>
                        <Maximize2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right stats & live chat panel */}
                <div className="wl-esports-stats-panel">
                  <div style={{ fontWeight: 800, fontSize: 15, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    Командная статистика
                  </div>

                  {/* Winrate bar */}
                  <div className="wl-stat-row">
                    <div className="wl-stat-labels">
                      <span>FURIA: 55%</span>
                      <span>Винрейт на карте</span>
                      <span>50% :BetBoom</span>
                    </div>
                    <div className="wl-stat-bar-outer">
                      <div className="wl-stat-bar-team1" style={{ width: '55%' }} />
                      <div className="wl-stat-bar-team2" style={{ width: '45%' }} />
                    </div>
                  </div>

                  {/* Pistol round winrate */}
                  <div className="wl-stat-row">
                    <div className="wl-stat-labels">
                      <span>FURIA: 58%</span>
                      <span>Пистолетные раунды</span>
                      <span>52% :BetBoom</span>
                    </div>
                    <div className="wl-stat-bar-outer">
                      <div className="wl-stat-bar-team1" style={{ width: '58%' }} />
                      <div className="wl-stat-bar-team2" style={{ width: '42%' }} />
                    </div>
                  </div>

                  {/* Map pool */}
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>Пул карт:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {[
                      ['Inferno', '54%'],
                      ['Mirage', '62%'],
                      ['Nuke', '48%'],
                      ['Dust 2', '71%']
                    ].map(([map, win], i) => (
                      <div key={i} style={{ background: '#1c2230', padding: 6, borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{map}</div>
                        <div style={{ fontSize: 10, color: 'var(--org)' }}>{win}</div>
                      </div>
                    ))}
                  </div>

                  {/* Live Chat Stream */}
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <MessageSquare size={14} /> Чат матча
                    </div>
                    <div style={{ maxHeight: 130, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      {chatMessages.map((msg, i) => (
                        <div key={i} style={{ background: '#1a1f2b', padding: '4px 8px', borderRadius: 6, color: '#e2e8f0' }}>
                          {msg}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Match bets row */}
              <div className="wl-table-container">
                <div className="wl-league-header">
                  <span className="wl-league-title">Ставки на гранд-финал FURIA vs BetBoom</span>
                </div>
                <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {EVENTS[6].out.map((outcome, idx) => (
                    <button
                      key={idx}
                      className={`wl-odd-box ${selectedBet?.evId === 'e7' && selectedBet?.outcomeIdx === idx ? 'selected' : ''}`}
                      style={{ minWidth: 140, height: 48 }}
                      onClick={() => selectOdd(EVENTS[6], idx, outcome[0], outcome[1])}
                    >
                      <span className="wl-odd-lbl">{outcome[0]}</span>
                      <span className="wl-odd-val">{outcome[1].toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* C. 24/7 GAMES (Корыто Фортуны) */}
          {view === 'games24' && (
            <div style={{ maxWidth: 680, margin: '20px auto', textAlign: 'center' }}>
              <div className="wl-banner-card highlight" style={{ padding: 32 }}>
                <span className="wl-banner-tag">ИГРЫ 24/7 • БЫСТРЫЕ ИСХОДЫ</span>
                <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 26, margin: '14px 0 6px' }}>
                  КОРЫТО ФОРТУНЫ 🐷
                </h2>
                <p style={{ color: 'var(--tx-secondary)', fontSize: 14, marginBottom: 24 }}>
                  Испытайте удачу! Ставка от 100 SV₽. Крутите корыто и получайте моментальные множители от x0 до x10!
                </p>

                {/* Animated Visualizer */}
                <div style={{ margin: '30px auto', width: 140, height: 140, borderRadius: '50%', border: '4px dashed var(--org)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, animation: spinning ? 'spin 0.6s linear infinite' : 'none' }}>
                  {spinning ? '🌀' : '🐽'}
                </div>

                {rouletteResult && (
                  <div style={{ padding: '12px 20px', borderRadius: 10, background: '#1c2230', border: '1px solid var(--org)', color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 20 }}>
                    {rouletteResult}
                  </div>
                )}

                <button
                  className="wl-btn-orange"
                  style={{ fontSize: 16, padding: '14px 36px', borderRadius: 12 }}
                  disabled={spinning}
                  onClick={spinRoulette}
                >
                  {spinning ? 'Корыто крутится...' : 'Крутить за 100 SV₽'}
                </button>
              </div>
            </div>
          )}

          {/* D. WALLET / PROFILE VIEW */}
          {view === 'wallet' && (
            <div style={{ maxWidth: 860, margin: '0 auto' }}>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
                Мой счёт и баланс
              </h2>

              <div className="wl-banner-card" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>Доступный виртуальный баланс</div>
                <div style={{ fontFamily: 'var(--font-d)', fontSize: 36, fontWeight: 800, color: 'var(--org)', margin: '8px 0 16px' }}>
                  {fmt(S.bal)}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="wl-btn-orange" onClick={() => addVirtualMoney(5000)}>
                    + 5 000 SV₽
                  </button>
                  <button className="wl-btn-orange" style={{ background: '#3b82f6' }} onClick={() => addVirtualMoney(25000)}>
                    + 25 000 SV₽
                  </button>
                  <button
                    className="wl-sidebar-quick-btn"
                    style={{ border: '1px solid var(--border)' }}
                    onClick={() => {
                      if (confirm('Сбросить весь прогресс и историю ставок к начальным 10 000 SV₽?')) {
                        setS(freshState())
                        setSelectedBet(null)
                        notify('Прогресс сброшен к 10 000 SV₽')
                      }
                    }}
                  >
                    Сбросить всё
                  </button>
                </div>
              </div>

              {/* History of bets */}
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '24px 0 12px' }}>История виртуальных ставок</h3>
              <div className="wl-table-container">
                {S.bets.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx-muted)' }}>
                    Ставок пока нет. Выберите исход в линии и нажмите «Сделать ставку»!
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#171b26', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '10px 14px' }}>Событие</th>
                          <th style={{ padding: '10px 14px' }}>Ставка</th>
                          <th style={{ padding: '10px 14px' }}>Коэф.</th>
                          <th style={{ padding: '10px 14px' }}>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {S.bets.map((b: any) => {
                          const ev = EVENTS.find(e => e.id === b.ev)
                          const statusColor = b.state === 'won' ? 'var(--green)' : b.state === 'lost' ? '#ef4444' : 'var(--org)'
                          const statusText = b.state === 'won' ? 'ВЫИГРЫШ' : b.state === 'lost' ? 'ПРОИГРЫШ' : b.state === 'refund' ? 'ВОЗВРАТ' : 'В ИГРЕ'

                          return (
                            <tr key={b.id} style={{ borderBottom: '1px solid #1c2230' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 700 }}>{ev?.title || b.ev}</div>
                                <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev?.out[b.i]?.[0] || 'Исход'}</div>
                              </td>
                              <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmt(b.stake)}</td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-d)', color: 'var(--org)' }}>{b.odds.toFixed(2)}</td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ color: statusColor, fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#191f2c' }}>
                                  {statusText}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Transactions log */}
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '24px 0 12px' }}>Журнал транзакций</h3>
              <div className="wl-table-container">
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {S.log.map((l: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1a202c' }}>
                          <td style={{ padding: '8px 14px', color: 'var(--tx-muted)', fontSize: 12 }}>
                            {new Date(l.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td style={{ padding: '8px 14px' }}>{l.x}</td>
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: l.d > 0 ? 'var(--green)' : l.d < 0 ? '#ef4444' : '#fff' }}>
                            {l.d > 0 ? `+${fmt(l.d)}` : fmt(l.d)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* E. PROMOS VIEW */}
          {view === 'promos' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
                Акции и специальные предложения
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                {PROMOS.map((p, idx) => (
                  <div key={idx} className="wl-banner-card" style={{ minHeight: 180 }}>
                    <span className="wl-banner-tag">АКЦИЯ #{idx + 1}</span>
                    <div className="wl-banner-title" style={{ fontSize: 18 }}>
                      {p[0]}
                    </div>
                    <div className="wl-banner-desc" style={{ maxWidth: '100%' }}>
                      {p[1]}
                    </div>
                    <button
                      className="wl-btn-orange"
                      style={{ marginTop: 14, width: 'fit-content' }}
                      onClick={() => notify(`Условия акции «${p[0]}» соблюдены!`)}
                    >
                      Активировать
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* F. RESULTS VIEW */}
          {view === 'results' && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
                Результаты и архив событий
              </h2>
              <div className="wl-table-container">
                {EVENTS.map(ev => {
                  const state = S.st[ev.id]
                  return (
                    <div key={ev.id} style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev.league}</div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{ev.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>{ev.desc}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-d)', fontWeight: 800, fontSize: 18, color: 'var(--org)' }}>
                          {ev.score || 'Завершено'}
                        </div>
                        <div style={{ fontSize: 11, color: state?.s === 'done' ? 'var(--green)' : 'var(--tx-muted)' }}>
                          {state?.s === 'done' ? `Победил исход: ${ev.out[state.w!]?.[0]}` : 'Итог зафиксирован'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* G. ABOUT VIEW */}
          {view === 'about' && (
            <div style={{ maxWidth: 860, margin: '0 auto' }}>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
                О компании SVINLINE
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
                {Array.from({ length: ABOUT.length / 2 }).map((_, i) => (
                  <div key={i} className="wl-banner-card">
                    <span className="wl-banner-tag">{ABOUT[i * 2]}</span>
                    <div style={{ fontSize: 14, color: 'var(--tx-secondary)', marginTop: 8, lineHeight: 1.6 }}>
                      {ABOUT[i * 2 + 1]}
                    </div>
                  </div>
                ))}
              </div>

              <div className="wl-banner-card highlight">
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Правила платформы</h3>
                <p style={{ fontSize: 13, color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
                  SVINLINE — интерактивная игровая платформа. Внутренняя расчетная единица: SV₽. Стартовый баланс: {fmt(START)}, минимальная ставка: {MINBET} SV₽. Все игровые расчеты производятся в единицах SV₽.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 3. Floating Bottom-Right Coupon Button (Signature Winline widget) */}
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
          onClick={() => notify('💬 Поддержка SVINLINE: «Свинья сейчас обедает, вернётся через 5 минут!»')}
          title="Онлайн-поддержка"
        >
          <MessageSquare size={20} />
        </button>
      </div>

      {/* 4. Floating BetSlip Drawer / Modal */}
      {slipOpen && (
        <div className="wl-betslip-drawer">
          {/* Slip Header with tabs */}
          <div className="wl-slip-header">
            <div className="wl-slip-tabs">
              <button
                className={`wl-slip-tab ${slipTab === 'coupon' ? 'active' : ''}`}
                onClick={() => setSlipTab('coupon')}
              >
                Купон {selectedBet ? '(1)' : ''}
              </button>
              <button
                className={`wl-slip-tab ${slipTab === 'ingame' ? 'active' : ''}`}
                onClick={() => setSlipTab('ingame')}
              >
                В игре ({activeBetsCount})
              </button>
            </div>
            <button onClick={() => setSlipOpen(false)} style={{ color: 'var(--tx-muted)' }}>
              <X size={18} />
            </button>
          </div>

          {/* Slip Body: Tab Coupon */}
          {slipTab === 'coupon' ? (
            <div className="wl-slip-body">
              {!selectedBet ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--tx-muted)' }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Купон пуст</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Выберите коэффициент в любом событии на линии, чтобы добавить его в купон.
                  </div>
                </div>
              ) : (
                <form onSubmit={handlePlaceBet}>
                  {/* Selected Event details */}
                  {(() => {
                    const ev = EVENTS.find(e => e.id === selectedBet.evId)
                    return (
                      <div style={{ background: '#1b212d', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev?.league}</div>
                          <button
                            type="button"
                            onClick={() => setSelectedBet(null)}
                            style={{ color: '#ef4444' }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                          {ev?.title}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid #283142', paddingTop: 8 }}>
                          <span style={{ fontSize: 13, color: 'var(--org)', fontWeight: 700 }}>
                            {selectedBet.outcomeTitle}
                          </span>
                          <span style={{ fontFamily: 'var(--font-d)', fontWeight: 800, fontSize: 16 }}>
                            {selectedBet.odds.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Stake input */}
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--tx-secondary)', fontWeight: 600 }}>
                      Сумма виртуальной ставки, SV₽:
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="wl-stake-input"
                      value={stake}
                      onChange={e => {
                        setStake(e.target.value.replace(',', '.'))
                        setErr('')
                      }}
                      placeholder="Например, 500"
                    />
                  </div>

                  {/* Quick stake buttons */}
                  <div className="wl-quick-stakes">
                    {['100', '500', '1000'].map(val => (
                      <button
                        key={val}
                        type="button"
                        className="wl-quick-btn"
                        onClick={() => { setStake(val); setErr('') }}
                      >
                        +{val}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="wl-quick-btn"
                      style={{ color: 'var(--org)' }}
                      onClick={() => { setStake(String(Math.floor(S.bal))); setErr('') }}
                    >
                      Всё
                    </button>
                  </div>

                  {/* Payout calculation */}
                  <div style={{ background: '#0e1117', padding: 10, borderRadius: 8, margin: '12px 0', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tx-secondary)' }}>
                      <span>Возможный выигрыш:</span>
                      <span style={{ fontFamily: 'var(--font-d)', fontWeight: 800, color: 'var(--org)', fontSize: 15 }}>
                        {isStakeValid ? fmt(potentialPayout) : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tx-muted)', fontSize: 11, marginTop: 4 }}>
                      <span>Чистая выплата:</span>
                      <span style={{ color: 'var(--green)' }}>
                        {isStakeValid ? `+${fmt(netProfit)}` : '—'}
                      </span>
                    </div>
                  </div>

                  {err && (
                    <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                      {err}
                    </div>
                  )}

                  {/* Submit Bet button */}
                  <button
                    type="submit"
                    className="wl-btn-orange"
                    style={{ width: '100%', padding: '12px 0', fontSize: 15, borderRadius: 10 }}
                  >
                    Сделать ставку
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Slip Body: Tab In Game */
            <div className="wl-slip-body">
              {activeBetsCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--tx-muted)' }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>⏳</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Нет активных ставок</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Здесь отображаются ваши текущие нерассчитанные ставки.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {S.bets.filter((b: any) => b.state === 'open').map((b: any) => {
                    const ev = EVENTS.find(e => e.id === b.ev)
                    return (
                      <div key={b.id} style={{ background: '#1c2230', padding: 12, borderRadius: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev?.league}</div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{ev?.title}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                          <span>{ev?.out[b.i]?.[0]} (x{b.odds.toFixed(2)})</span>
                          <span style={{ fontWeight: 700, color: 'var(--org)' }}>{fmt(b.stake)}</span>
                        </div>

                        {/* Test instant settle directly in slip */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, borderTop: '1px solid #283347', paddingTop: 8 }}>
                          <button
                            className="wl-demo-btn"
                            style={{ flex: 1, color: 'var(--green)' }}
                            onClick={() => mutate(s => settleEvent(s, b.ev, b.i), `Выигрыш по ставке ${fmt(b.stake)}!`)}
                          >
                            ✓ Засчитать выигрыш
                          </button>
                          <button
                            className="wl-demo-btn"
                            style={{ flex: 1, color: '#ef4444' }}
                            onClick={() => mutate(s => settleEvent(s, b.ev, b.i === 0 ? 1 : 0), `Ставка проиграна`)}
                          >
                            ✕ Проигрыш
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Toast feedback notification */}
      {msg && (
        <div className="wl-toast">
          <CheckCircle2 size={18} color="var(--org)" />
          <span>{msg}</span>
        </div>
      )}

      {/* 6. Discreet Footer */}
      <footer className="wl-footer">
        <div>
          © 2026 SVINLINE (СВИНЛАЙН). Все права защищены. Играйте ответственно. Внутренняя расчетная единица: SV₽. 18+
        </div>
      </footer>
    </div>
  )
}
