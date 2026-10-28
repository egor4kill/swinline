import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react'
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
  Pickaxe,
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
} from './data'
import { payout, r2 } from './logic'
import { mult as crashMult, flightSeconds } from './crashLogic'
import { supabase, ADMIN_USERNAME } from './supabase'
import { SECTORS as ROULETTE_SECTORS } from './wheelLogic'
import ceoPhoto from './assets/ceo.jpg'

const KEY_STATE = 'svinline.v3.state'
const KEY_EVENTS = 'svinline.v3.custom_events'
const KEY_ACCOUNTS = 'svinline.v3.accounts'
const KEY_CURRENT_USER = 'svinline.v3.current_user_id'

const unitOf = (currency: 'sv' | 'ar') => (currency === 'ar' ? 'АР' : 'SV₽')
const fmtCur = (value: number, currency: 'sv' | 'ar') =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + unitOf(currency)

const freshState = () => ({
  bal: START,
  bets: [] as any[],
  log: [{ t: Date.now(), x: 'Стартовый баланс', d: START }],
  st: {} as Record<string, { s: string; w?: number }>
})

import type { RubleResult } from './RubleChart'
import CasinoStrip, { JackpotOverlay } from './CasinoStrip'
import VipBadge from './VipBadge'
import DailyRewards from './DailyRewards'
import { useDaily } from './useDaily'

// Игры — отдельными чанками: линия на телефоне не тянет код всего казино
const Plinko = lazy(() => import('./Plinko'))
const MudPuddles = lazy(() => import('./MudPuddles'))
const RubleChart = lazy(() => import('./RubleChart'))
const Blackjack = lazy(() => import('./Blackjack'))
const MineView = lazy(() => import('./MineView'))
const PickGame = lazy(() => import('./PickGame'))
const BonanzaGame = lazy(() => import('./BonanzaGame'))
import GameCards from './components/GameCards'
const CrashArena = lazy(() => import('./components/games/CrashArena'))
const RouletteWheel = lazy(() => import('./components/games/RouletteWheel'))
const WHEEL_SEC_DEG = 360 / ROULETTE_SECTORS.length
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {}
  return fallback
}

import { fmt } from './fmt'
import { useDocumentVisible } from './useDocumentVisible'
import { useHashNav } from './useHashNav'
import { PigLogo, UserAvatar, getTwitchAvatar } from './components/Avatars'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import LineView from './components/LineView'
import EsportsView from './components/EsportsView'
import WalletView from './components/WalletView'
import PromosView from './components/PromosView'
import ResultsView from './components/ResultsView'
import AboutView from './components/AboutView'
import CouponBar from './components/CouponBar'
import BetSlip from './components/BetSlip'
import MobileNav from './components/MobileNav'
import ProfileModal from './modals/ProfileModal'
import AdminModal from './modals/AdminModal'
import AuthModal from './modals/AuthModal'
import InspectUserModal from './modals/InspectUserModal'
import DeleteEventModal from './modals/DeleteEventModal'
import EditScoreModal from './modals/EditScoreModal'
import CreateMatchModal from './modals/CreateMatchModal'

const purgeEmptyAccounts = (list: UserAccount[]): UserAccount[] => {
  const seenUsernames = new Set<string>()
  return (list || []).filter(a => {
    if (!a || !a.id || !a.username) return false
    const u = a.username.trim()
    if (!u) return false
    if (u.toLowerCase() === 'admin' && a.id === 'adm1') return false
    if (u === 'Кабанчик_2026' || a.id === 'u1') return false
    if (u.toLowerCase() === 'игрок' || u.startsWith('Игрок_') || u.startsWith('Player_')) return false
    const key = u.toLowerCase()
    if (seenUsernames.has(key)) return false
    seenUsernames.add(key)
    return true
  })
}

export default function App() {
  // 1. Account & Auth & Admin States
  const [accounts, setAccounts] = useState<UserAccount[]>(() => {
    const raw = loadJSON(KEY_ACCOUNTS, DEFAULT_ACCOUNTS)
    return purgeEmptyAccounts(raw).map((a: any) => {
      const isOwner = a.username?.toLowerCase() === ADMIN_USERNAME.toLowerCase()
      const role = (isOwner ? 'admin' : (a.role === 'admin' ? 'user' : (a.role || 'user'))) as 'admin' | 'user'
      const title = isOwner ? 'Владелец платформы (Admin)' : (role === 'admin' ? 'Игрок (Twitch)' : (a.title || 'Игрок (Twitch)'))
      return {
        ...a,
        role,
        title,
        avatar: getTwitchAvatar(a.username, a.avatar)
      }
    })
  })
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    const id = loadJSON(KEY_CURRENT_USER, null)
    if (id === 'adm1') return null
    return id
  })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  // Личный кабинет: ставки и игровые попытки читаются из базы (RLS отдаёт только свои)
  const [myStats, setMyStats] = useState<{ bets: any[]; attempts: number } | null>(null)
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [adminTab, setAdminTab] = useState<'users' | 'create' | 'matches' | 'audit' | 'bank'>('users')
  const [inspectingUser, setInspectingUser] = useState<UserAccount | null>(null)
  const activeUserLoadedRef = useRef<string | null>(null)
  const lastDepositRef = useRef<number>(0)

  // Find active user (or null if guest)
  const currentUser = useMemo(() => {
    if (!currentUserId) return null
    return accounts.find(a => a.id === currentUserId) || null
  }, [accounts, currentUserId])
  // Свежая ссылка для колбэков Realtime/БД, которые не пересоздаются каждый рендер
  const currentUserRef = useRef<UserAccount | null>(currentUser)
  currentUserRef.current = currentUser

  const isAdmin = currentUser?.role === 'admin'
  const daily = useDaily(currentUser?.id)
  // Свёрнутая вкладка не должна тратить батарею и трафик на опрос игр
  const pageVisible = useDocumentVisible()

  // 2. Events managed by Admin (starting clean / without old mock events)
  const [customEvents, setCustomEvents] = useState<Ev[]>(() => {
    const raw = loadJSON<Ev[]>(KEY_EVENTS, [])
    return (raw || []).filter(e => !/^e\d+$/.test(e.id))
  })

  // Общая линия из Supabase (таблица events; включается разделом 7 SQL-скрипта).
  // Пока таблицы нет — молча работаем в локальном режиме, как раньше.
  const [dbEvents, setDbEvents] = useState<{ ev: Ev; status: string; winner: number | null }[]>([])
  const seenDbEventIdsRef = useRef<Set<string>>(new Set())

  const fetchDbEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false })
      if (error) {
        // PGRST205 = таблицы ещё нет (SQL-скрипт не выполнен) — это не ошибка, просто локальный режим
        if (error.code !== 'PGRST205') console.warn('Failed to fetch events from Supabase:', error.message)
        return
      }
      const rows = (data || []).map((r: any) => ({
        ev: { ...(r.data as Ev), id: r.id },
        status: (r.status as string) || 'open',
        winner: typeof r.winner === 'number' ? r.winner : null
      }))
      const nextIds = new Set(rows.map(r => r.ev.id))
      // Событие исчезло из базы (удалено админом): отмечаем свои ставки возвратом.
      // Деньги начисляет сервер (admin_settle_bets при удалении) — баланс приедет через Realtime.
      seenDbEventIdsRef.current.forEach(id => {
        if (nextIds.has(id)) return
        const prev = sRef.current
        if (!prev || !(prev.bets || []).some((b: any) => b.ev === id && b.state === 'open')) return
        const next = structuredClone(prev)
        next.st = next.st || {}
        next.st[id] = { s: 'cancel' }
        ;(next.bets || []).forEach((b: any) => {
          if (b.ev !== id || b.state !== 'open') return
          b.state = 'refund'
          next.log.unshift({ t: Date.now(), x: 'Возврат (событие удалено), начислено сервером', d: b.stake })
        })
        setS(next)
      })
      seenDbEventIdsRef.current = nextIds
      setDbEvents(rows)
    } catch (e) {
      console.warn('Failed to fetch events from Supabase:', e)
    }
  }, [])

  // Линия = события из общей базы + локальные события админа, которых ещё нет в базе
  const allEvents = useMemo(() => {
    const seen = new Set(dbEvents.map(d => d.ev.id))
    return [...dbEvents.map(d => d.ev), ...customEvents.filter(e => !seen.has(e.id))]
  }, [dbEvents, customEvents])

  const dbEventIds = useMemo(() => new Set(dbEvents.map(d => d.ev.id)), [dbEvents])

  // Modals for safe management & editing
  const [deleteEventModal, setDeleteEventModal] = useState<Ev | null>(null)
  const [editEventModal, setEditEventModal] = useState<Ev | null>(null)
  const [editScore, setEditScore] = useState('0 : 0')
  const [editLiveTime, setEditLiveTime] = useState('Скоро')
  const [editIsLive, setEditIsLive] = useState(false)
  const [createMatchModalOpen, setCreateMatchModalOpen] = useState(false)

  // 3. Navigation & Views
  const [view, setView] = useState('line') // line | live | esports | games24 | wallet | promos | results | about
  const [gamesTab, setGamesTab] = useState<'crash' | 'roulette' | 'plinko' | 'puddles' | 'ruble' | 'blackjack' | 'mine' | 'pick' | 'bonanza' | 'olympus'>('crash')
  // Глубокие ссылки: #/games/crash, #/wallet … + кнопка «назад»
  useHashNav(view, setView, gamesTab, setGamesTab)
  const [playCurrency, setPlayCurrency] = useState<'sv' | 'ar'>('sv')
  const [arBalance, setArBalance] = useState(0)
  const [jackpotWin, setJackpotWin] = useState<number | null>(null)
  const [selectedSport, setSelectedSport] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({})

  // 4. Betting & State
  const [S, setS] = useState<any>(() => {
    const raw = loadJSON(KEY_STATE, freshState())
    if (raw && raw.bets) {
      raw.bets = raw.bets.filter((b: any) => !/^e\d+$/.test(b.ev))
    }
    return raw
  })
  // Свежая ссылка на состояние для колбэков Realtime и БД
  const sRef = useRef<any>(null)
  sRef.current = S
  const [selectedBet, setSelectedBet] = useState<{ evId: string; outcomeIdx: number; outcomeTitle: string; odds: number } | null>(null)
  const [stake, setStake] = useState('500')
  const [slipOpen, setSlipOpen] = useState(false)
  const [slipTab, setSlipTab] = useState<'coupon' | 'ingame'>('coupon')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const busy = useRef(false)

  // 6. Games 24/7 Roulette State
  const [spinning, setSpinning] = useState(false)
  const [wheelRotation, setWheelRotation] = useState(0)
  const [wonSectorIdx, setWonSectorIdx] = useState<number | null>(null)
  const [rouletteResult, setRouletteResult] = useState<string | null>(null)

  // 7. Crash Game State — общие раунды из базы: точка краша спрятана на сервере,
  //    все игроки летят в одной ракете (crash_state + Realtime)
  const [crashRound, setCrashRound] = useState<{ id: number; startAt: number; bettingSeconds: number; crashed: boolean; crashPoint: number | null } | null>(null)
  const [crashPhase, setCrashPhase] = useState<'betting' | 'flying' | 'crashed'>('betting')
  const [crashMultiplier, setCrashMultiplier] = useState(1.00)
  const [crashCountdown, setCrashCountdown] = useState(6.0)
  const [crashHistory, setCrashHistory] = useState<number[]>([])
  const [crashStake, setCrashStake] = useState('200')
  const [crashAutoCashout, setCrashAutoCashout] = useState('')
  const [myCrashBet, setMyCrashBet] = useState<{
    stake: number
    currency: 'sv' | 'ar'
    autoCashout?: number
    cashedOutMul?: number
    winAmount?: number
  } | null>(null)
  const [liveCrashBets, setLiveCrashBets] = useState<any[]>([])
  const crashRoundRef = useRef<{ id: number; startAt: number; bettingSeconds: number; crashed: boolean; crashPoint: number | null } | null>(null)
  crashRoundRef.current = crashRound
  const serverOffsetRef = useRef(0) // разница часов сервера и браузера
  const serverNow = () => Date.now() + serverOffsetRef.current

  // 8. Admin Form State for New Match
  const [newMatchTitle, setNewMatchTitle] = useState('')
  const [newMatchLeague, setNewMatchLeague] = useState('Свин-Лига РПЛ | Турнир')
  const [newMatchCat, setNewMatchCat] = useState(0)
  const [newMatchTeam1, setNewMatchTeam1] = useState('')
  const [newMatchTeam2, setNewMatchTeam2] = useState('')
  const [newMatchOdds1, setNewMatchOdds1] = useState('1.95')
  const [newMatchOddsX, setNewMatchOddsX] = useState('3.20')
  const [newMatchOdds2, setNewMatchOdds2] = useState('2.35')
  const [newMatchIsLive, setNewMatchIsLive] = useState(false)
  const [newMatchScore, setNewMatchScore] = useState('0 : 0')
  const [newMatchTime, setNewMatchTime] = useState('Скоро')
  const [newMatchDesc, setNewMatchDesc] = useState('')

  // Sync to local storage
  useEffect(() => {
    try { localStorage.setItem(KEY_STATE, JSON.stringify(S)) } catch {}
  }, [S])

  useEffect(() => {
    try { localStorage.setItem(KEY_EVENTS, JSON.stringify(customEvents)) } catch {}
  }, [customEvents])

  useEffect(() => {
    try { localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(accounts)) } catch {}
  }, [accounts])

  useEffect(() => {
    try { localStorage.setItem(KEY_CURRENT_USER, JSON.stringify(currentUserId)) } catch {}
  }, [currentUserId])

  // User balance isolation & remote database balance synchronization:
  const lastSyncBalRef = useRef<number | null>(null)
  // Пользователь, уже заходивший в этом сеансе: отличаем возврат того же аккаунта от смены аккаунта
  const lastSessionUserRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentUserId) {
      activeUserLoadedRef.current = null
      lastSyncBalRef.current = null
      return
    }
    const acc = accounts.find(a => a.id === currentUserId)
    if (!acc) return

    // 1. Первый вход в этом сеансе (в т.ч. перезагрузка страницы): подтягиваем баланс из базы, историю не трогаем
    if (activeUserLoadedRef.current !== currentUserId) {
      const isAccountSwitch = lastSessionUserRef.current !== null && lastSessionUserRef.current !== currentUserId
      activeUserLoadedRef.current = currentUserId
      lastSessionUserRef.current = currentUserId
      lastSyncBalRef.current = acc.bal
      if (isAccountSwitch) {
        // 1b. Смена аккаунта в этом же браузере: чистим ставки и историю предыдущего пользователя
        const bal = typeof acc.bal === 'number' ? acc.bal : START
        setS({ bal, bets: [], log: [{ t: Date.now(), x: 'Вход в аккаунт', d: bal }], st: {} })
      } else if (typeof acc.bal === 'number' && acc.bal !== S.bal) {
        setS((prev: any) => ({ ...prev, bal: acc.bal }))
      }
      return
    }

    // 2. If remote database updated balance (e.g. admin top-up via Supabase):
    if (lastSyncBalRef.current !== null && acc.bal !== lastSyncBalRef.current && acc.bal !== S.bal) {
      lastSyncBalRef.current = acc.bal
      setS((prev: any) => ({ ...prev, bal: acc.bal }))
    }
  }, [currentUserId, accounts, S.bal])

  // Sync local S.bal changes to current user in accounts and Supabase
  useEffect(() => {
    if (!currentUserId) return
    setAccounts(prev => prev.map(a => a.id === currentUserId && a.bal !== S.bal ? { ...a, bal: S.bal } : a))
    lastSyncBalRef.current = S.bal
  }, [S.bal, currentUserId])

  // Статусы событий из общей базы применяются у всех игроков: отмечаем исходы локально,
  // деньги начисляет сервер (admin_settle_bets), баланс приедет через Realtime по profiles
  const appliedEventStatusRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    dbEvents.forEach(d => {
      const key = `${d.ev.id}|${d.status}|${d.winner ?? ''}`
      if (appliedEventStatusRef.current.has(key)) return
      const local = sRef.current?.st?.[d.ev.id]
      if (local && local.s === d.status && (d.status !== 'done' || local.w === d.winner)) return
      appliedEventStatusRef.current.add(key)
      const prev = sRef.current || freshState()
      const next = structuredClone(prev)
      next.st = next.st || {}
      if (d.status === 'done' && d.winner !== null) {
        markOutcome(next, d.ev.id, 'done', d.winner)
      } else if (d.status === 'cancel') {
        markOutcome(next, d.ev.id, 'cancel')
      } else {
        next.st[d.ev.id] = { s: d.status === 'closed' ? 'closed' : 'open' }
      }
      setS(next)
    })
  }, [dbEvents, allEvents])

  // Supabase Auth listener (detects GitHub/Twitch logins and admin ownership)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        syncSupabaseUser(session.user)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setCurrentUserId(null)
      } else if (session?.user) {
        syncSupabaseUser(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchSupabaseUsers = useCallback(async () => {
    try {
      const [profilesRes, betsRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('bets').select('*').order('created_at', { ascending: false })
      ])

      if (profilesRes.data && profilesRes.data.length > 0) {
        const betsByUser: Record<string, any[]> = {}
        betsRes.data?.forEach(b => {
          if (!betsByUser[b.user_id]) betsByUser[b.user_id] = []
          betsByUser[b.user_id].push(b)
        })

        setAccounts(prev => {
          const remoteAccounts: UserAccount[] = profilesRes.data.map(p => {
            const isOwner = (p.username || '').toLowerCase() === ADMIN_USERNAME.toLowerCase()
            const existing = prev.find(a => a.id === p.id || a.username.toLowerCase() === (p.username || '').toLowerCase())
            const userBets = betsByUser[p.id] || existing?.bets || []
            return {
              id: p.id,
              username: p.username,
              role: (isOwner ? 'admin' : (p.role || 'user')) as 'admin' | 'user',
              avatar: getTwitchAvatar(p.username, p.avatar),
              title: isOwner ? 'Владелец платформы (Admin)' : 'Игрок (Twitch)',
              bal: Number(p.bal ?? 10000),
              bets: userBets,
              log: existing ? existing.log : [{ t: new Date(p.created_at || Date.now()).getTime(), x: 'Вход через Twitch', d: Number(p.bal ?? 10000) }],
              createdAt: new Date(p.created_at || Date.now()).getTime(),
              isBlocked: Boolean(p.is_blocked),
              stats: existing ? existing.stats : { totalBets: userBets.length, wonBets: 0, lostBets: 0, totalProfit: 0 },
              achievements: isOwner ? ['Владелец Платформы', 'Создатель Линии'] : ['Игрок Twitch']
            }
          })

          const combined = [...remoteAccounts]
          prev.forEach(p => {
            if (!combined.some(c => c.username.toLowerCase() === p.username.toLowerCase())) {
              combined.push(p)
            }
          })

          return purgeEmptyAccounts(combined)
        })
        return
      }
    } catch (e) {
      console.warn('Failed to fetch profiles from Supabase:', e)
    }
  }, [])

  // Админ видит всех игроков: серверный список admin_list_players
  // (RLS отдаёт обычному клиенту только его собственный профиль)
  const fetchAdminPlayers = useCallback(async () => {
    if (currentUserRef.current?.role !== 'admin') return
    const { data, error } = await supabase.rpc('admin_list_players')
    if (error || !Array.isArray(data)) return
    setAccounts(prev => {
      const byId = new Map(prev.map(a => [a.id, a]))
      for (const p of data) {
        const isOwner = (p.username || '').toLowerCase() === ADMIN_USERNAME.toLowerCase()
        const existing = byId.get(p.id)
        byId.set(p.id, {
          id: p.id,
          username: p.username,
          role: (isOwner ? 'admin' : 'user') as 'admin' | 'user',
          avatar: getTwitchAvatar(p.username, existing?.avatar || p.avatar),
          title: existing?.title || (isOwner ? 'Владелец платформы (Admin)' : 'Игрок (Twitch)'),
          bal: Number(p.bal ?? 0),
          bets: (p.recent_bets || []).map((b: any) => ({ ...b, ev: b.event_id })),
          log: existing?.log || [],
          createdAt: new Date(p.created_at || Date.now()).getTime(),
          isBlocked: Boolean(p.is_blocked),
          stats: existing?.stats || { totalBets: Number(p.bets_count || 0), wonBets: 0, lostBets: 0, totalProfit: 0 },
          achievements: existing?.achievements || []
        })
      }
      return purgeEmptyAccounts([...byId.values()])
    })
  }, [])

  useEffect(() => {
    fetchSupabaseUsers()
    fetchAdminPlayers()
    fetchDbEvents()
  }, [fetchSupabaseUsers, fetchAdminPlayers, fetchDbEvents])

  // Supabase Realtime synchronization across all players and admin
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchSupabaseUsers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => {
        fetchSupabaseUsers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchDbEvents()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_rounds' }, () => {
        pollCrashState()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crash_bets' }, () => {
        const r = crashRoundRef.current
        if (r) fetchCrashBets(r.id)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSupabaseUsers, fetchDbEvents])

  useEffect(() => {
    if (adminModalOpen) {
      fetchSupabaseUsers()
      fetchAdminPlayers()
      fetchDbEvents()
    }
  }, [adminModalOpen, fetchSupabaseUsers, fetchAdminPlayers, fetchDbEvents])

  // Личный кабинет: серверная статистика игрока (RLS отдаёт только свои строки)
  useEffect(() => {
    if (!profileModalOpen || !currentUser) return
    let alive = true
    setMyStats(null)
    const uid = currentUser.id
    ;(async () => {
      const [betsRes, attRes] = await Promise.all([
        supabase.from('bets').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(50),
        supabase.from('game_attempts').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      ])
      if (!alive) return
      setMyStats({ bets: (betsRes.data || []) as any[], attempts: attRes.count || 0 })
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileModalOpen, currentUserId])

  const syncSupabaseUser = (u: any, customName?: string, customAvatar?: string) => {
    const twitchUser = (u.user_metadata?.preferred_username || u.user_metadata?.name || u.user_metadata?.user_name || '').trim()
    const ghUser = (u.user_metadata?.user_name || u.user_metadata?.preferred_username || '').trim()

    let name = customName || twitchUser || ghUser || u.user_metadata?.full_name || u.user_metadata?.name || ''
    if (!name && u.email) {
      name = u.email.split('@')[0]
    }
    name = (name || '').trim()

    if (!name) {
      notify('Не удалось определить никнейм из профиля Twitch')
      return
    }

    // OWNER CHECK: If username is egor4kill (via Twitch or GitHub), grant full ADMIN status!
    const isOwner = name.toLowerCase() === ADMIN_USERNAME.toLowerCase()
    const twitchAvatar = u.user_metadata?.avatar_url || u.user_metadata?.picture || u.user_metadata?.avatar || ''
    const avatar = getTwitchAvatar(name, customAvatar || twitchAvatar)
    const accountId = u.id

    setAccounts(prev => {
      const clean = purgeEmptyAccounts(prev)
      const existing = clean.find(a => a.id === accountId || a.username.toLowerCase() === name.toLowerCase())
      if (existing) {
        return clean.map(a => (a.id === accountId || a.username.toLowerCase() === name.toLowerCase()) ? {
          ...a,
          id: accountId,
          username: name,
          role: isOwner ? 'admin' : 'user',
          title: isOwner ? 'Владелец платформы (Admin)' : 'Игрок (Twitch)',
          avatar: getTwitchAvatar(name, customAvatar || twitchAvatar || a.avatar)
        } : a)
      }

      const newAcc: UserAccount = {
        id: accountId,
        username: name,
        role: isOwner ? 'admin' : 'user',
        avatar,
        title: isOwner ? 'Владелец платформы (Admin)' : 'Игрок (Twitch)',
        bal: 10000,
        bets: [],
        log: [{ t: Date.now(), x: 'Вход через Twitch • Стартовый баланс', d: 10000 }],
        createdAt: Date.now(),
        isBlocked: false,
        stats: { totalBets: 0, wonBets: 0, lostBets: 0, totalProfit: 0 },
        achievements: isOwner ? ['Владелец Платформы', 'Создатель Линии'] : ['Игрок Twitch']
      }
      return [...clean, newAcc]
    })

    setCurrentUserId(accountId)
    setAuthModalOpen(false)
    notify(isOwner ? `Добро пожаловать, Владелец ${name}! Вы вошли через Twitch со статусом ADMIN 👑` : `Вход выполнен через Twitch: ${name}! Стартовый баланс 10 000 SV₽ 🟣`)

    // Sync into Supabase profiles table
    supabase.from('profiles').upsert({
      id: accountId,
      username: name,
      avatar,
      role: isOwner ? 'admin' : 'user',
      bal: isOwner ? 35000 : 10000,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {
      fetchSupabaseUsers()
    }, err => console.error('Failed to sync profile to Supabase:', err))
  }

  const handleOAuthLogin = async (provider: 'github' | 'twitch' | 'discord') => {
    try {
      localStorage.setItem('svinline_last_auth_provider', provider)
      // Sign out current session first so it doesn't inherit or re-use old GitHub admin session
      await supabase.auth.signOut()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      })
      if (error) notify(`Ошибка авторизации: ${error.message}`)
    } catch (e: any) {
      notify(`Ошибка входа через ${provider}: ${e.message}`)
    }
  }

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2800)
    return () => clearTimeout(t)
  }, [msg])


  const notify = (m: string) => setMsg(m)

  // Локальное изменение состояния (косметика: ставки, лог). Баланс меняет только сервер —
  // все игровые операции идут через RPC и возвращают новый баланс.
  const mutate = (fn: (s: any) => void, message?: string) => {
    const next = structuredClone(S)
    fn(next)
    setS(next)
    if (message) notify(message)
  }

  // Отмечает исход события локально (статусы ставок + лог), НЕ трогая баланс:
  // деньги всем игрокам начисляет сервер (admin_settle_bets), баланс приедет через Realtime
  const markOutcome = (s: any, evId: string, st: 'done' | 'cancel', winner?: number) => {
    const ev = allEvents.find(e => e.id === evId)
    s.st = s.st || {}
    s.st[evId] = st === 'done' ? { s: 'done', w: winner } : { s: 'cancel' }
    s.bets.forEach((b: any) => {
      if (b.ev !== evId || b.state !== 'open') return
      if (st === 'done' && b.i === winner) {
        b.state = 'won'
        s.log.unshift({ t: Date.now(), x: 'Выигрыш: ' + (ev ? ev.title : evId) + ' (начислено сервером)', d: payout(b.stake, b.odds) })
      } else if (st === 'done') {
        b.state = 'lost'
        s.log.unshift({ t: Date.now(), x: 'Проигрыш: ' + (ev ? ev.title : evId), d: 0 })
      } else {
        b.state = 'refund'
        s.log.unshift({ t: Date.now(), x: 'Возврат (событие отменено): ' + (ev ? ev.title : evId) + ' (начислено сервером)', d: b.stake })
      }
    })
  }

  // Бесплатное начисление: для вошедших — через сервер (кулдаун и лимит проверяет БД),
  // для гостей — локальный демо-баланс (тратить его всё равно нельзя)
  const addVirtualMoney = async (amount: number = 5000) => {
    if (S.bal >= 100000) {
      notify('Баланс уже превышает 100 000 SV₽! Дополнительное начисление не требуется.')
      return
    }
    if (!currentUser) {
      mutate(s => {
        s.bal = r2(s.bal + amount)
        s.log.unshift({ t: Date.now(), x: `Пополнение ${fmt(amount)}`, d: amount })
      }, `+${fmt(amount)} зачислено на баланс! 🎉`)
      return
    }
    const { data, error } = await supabase.rpc('self_add_free', { p_amount: amount })
    if (error || !data) {
      notify(`❌ ${error?.message || 'Не удалось начислить'}`)
      return
    }
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Пополнение ${fmt(amount)}`, d: amount })
      next.bal = Number(data.bal)
      return next
    })
    notify(`+${fmt(amount)} зачислено на баланс! 🎉`)
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

  const handlePlaceBet = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentUser) {
      setAuthModalOpen(true)
      notify('Для совершения ставки необходимо войти в аккаунт!')
      return
    }
    if (currentUser.isBlocked) {
      notify('Ваш аккаунт заблокирован администратором!')
      return
    }
    if (busy.current || !selectedBet) return

    const cur = playCurrency
    const rawStake = parseFloat(stake)
    const v = cur === 'ar' ? Math.floor(rawStake) : rawStake
    const minStake = cur === 'ar' ? 1 : 10
    if (isNaN(v) || !isFinite(v) || v < minStake) {
      setErr(`Минимальная сумма ставки — ${minStake} ${unitOf(cur)}`)
      return
    }

    const ev = allEvents.find(event => event.id === selectedBet.evId)
    if (!ev) {
      setErr('Событие не найдено или снято с линии')
      return
    }
    if ((S.st?.[selectedBet.evId] || { s: 'open' }).s !== 'open') {
      setErr('Матч уже завершён, приём ставок закрыт!')
      return
    }

    busy.current = true
    // Ставку принимает сервер: проверит баланс, спишет и запишет в bets
    const { data, error } = await supabase.rpc('place_sports_bet', {
      p_event: selectedBet.evId,
      p_outcome: selectedBet.outcomeIdx,
      p_stake: v,
      p_currency: cur
    })
    setTimeout(() => { busy.current = false }, 350)

    if (error || !data) {
      setErr(error?.message || 'Не удалось принять ставку')
      return
    }

    const bet = {
      id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
      ev: selectedBet.evId,
      i: selectedBet.outcomeIdx,
      stake: v,
      odds: Number(data.odds) || selectedBet.odds,
      state: 'open',
      currency: cur
    }
    if (cur === 'ar') {
      setArBalance(Number(data.bal))
      setS(prev => {
        const next = structuredClone(prev)
        next.bets.unshift(bet)
        return next
      })
    } else {
      const next = structuredClone(S)
      next.bal = Number(data.bal)
      next.bets.unshift(bet)
      next.log.unshift({ t: Date.now(), x: 'Ставка: ' + ev.title + ' (' + (data.pick || selectedBet.outcomeTitle) + ')', d: -v })
      setS(next)
    }
    fetchSupabaseUsers()

    setSelectedBet(null)
    setErr('')
    notify(`Ставка ${fmtCur(v, cur)} принята и сохранена в базе! ✅`)
  }

  // ===== Общий движок Хряк-Крэша: раунды и ставки живут в базе =====
  const refreshAr = useCallback(async () => {
    if (!currentUser) { setArBalance(0); return }
    const { data, error } = await supabase.rpc('mc_status')
    if (!error && data) setArBalance(Number(data.ore || 0))
  }, [currentUser?.id])

  useEffect(() => { refreshAr() }, [refreshAr])
  useEffect(() => { if (playCurrency === 'ar') refreshAr() }, [playCurrency, refreshAr, view])
  useEffect(() => {
    if (!currentUser || playCurrency !== 'ar' || !pageVisible) return
    const id = setInterval(refreshAr, 30000)
    return () => clearInterval(id)
  }, [currentUser?.id, playCurrency, refreshAr, pageVisible])

  const fetchCrashBets = useCallback(async (roundId: number) => {
    const { data } = await supabase.from('crash_bets').select('*').eq('round_id', roundId).order('created_at', { ascending: true })
    if (!data) return
    setLiveCrashBets(data)
    const mine = data.find((b: any) => b.user_id === currentUserRef.current?.id)
    setMyCrashBet(mine ? {
      stake: Number(mine.stake),
      currency: (mine.currency === 'ar' ? 'ar' : 'sv') as 'sv' | 'ar',
      autoCashout: mine.auto_cashout != null ? Number(mine.auto_cashout) : undefined,
      cashedOutMul: mine.cashed_out_mul != null ? Number(mine.cashed_out_mul) : undefined,
      winAmount: mine.win_amount != null ? Number(mine.win_amount) : undefined
    } : null)
  }, [])

  const fetchCrashHistory = useCallback(async () => {
    const { data } = await supabase.from('crash_rounds').select('crash_point').not('crash_point', 'is', null).order('id', { ascending: false }).limit(10)
    if (data) setCrashHistory(data.map((r: any) => Number(r.crash_point)))
  }, [])

  const pollCrashState = useCallback(async () => {
    const { data, error } = await supabase.rpc('crash_state')
    if (error || !data) return
    serverOffsetRef.current = new Date(data.now).getTime() - Date.now()
    const next = {
      id: Number(data.id),
      startAt: new Date(data.start_at).getTime(),
      bettingSeconds: Number(data.betting_seconds),
      crashed: Boolean(data.crashed),
      crashPoint: data.crash_point === null || data.crash_point === undefined ? null : Number(data.crash_point)
    }
    const prev = crashRoundRef.current
    if (!prev || prev.id !== next.id) {
      fetchCrashBets(next.id)
      fetchCrashHistory()
    }
    crashRoundRef.current = next
    setCrashRound(next)
  }, [fetchCrashBets, fetchCrashHistory])

  // Опрос состояния: во время полёта решается момент краша, в остальное время можно реже
  useEffect(() => {
    if (!pageVisible) return
    pollCrashState()
    const id = setInterval(() => {
      if (view !== 'games24' || gamesTab !== 'crash') return
      const r = crashRoundRef.current
      if (r && r.crashed && r.crashPoint !== null) {
        const end = r.startAt + (r.bettingSeconds + flightSeconds(r.crashPoint) + 3.2) * 1000
        if (serverNow() < end - 1200) return // конец раунда уже известен — не спамим запросами
      }
      pollCrashState()
    }, 400)
    return () => clearInterval(id)
  }, [pollCrashState, view, gamesTab, pageVisible])

  // Локальная анимация: фаза и мультипликатор считаются от времени старта раунда из базы
  useEffect(() => {
    if (!pageVisible) return
    const id = setInterval(() => {
      const r = crashRoundRef.current
      if (!r) return
      const now = serverNow()
      const bettingEnd = r.startAt + r.bettingSeconds * 1000
      if (now < bettingEnd) {
        setCrashPhase('betting')
        setCrashCountdown(Math.max(0, (bettingEnd - now) / 1000))
        setCrashMultiplier(1.00)
      } else if (r.crashed && r.crashPoint !== null) {
        setCrashPhase('crashed')
        setCrashMultiplier(r.crashPoint)
      } else {
        const t = (now - bettingEnd) / 1000
        setCrashPhase('flying')
        setCrashMultiplier(r2(crashMult(t)))
      }
    }, 50)
    return () => clearInterval(id)
  }, [pageVisible])

  const placeCrashBet = async () => {
    if (!currentUser) {
      setAuthModalOpen(true)
      notify('Для игры необходимо войти через Twitch!')
      return
    }
    if (currentUser.isBlocked) {
      notify('Ваш аккаунт заблокирован администратором!')
      return
    }
    const r = crashRoundRef.current
    if (!r) return
    if (crashPhase !== 'betting') {
      notify('Приём ставок на текущий раунд завершён. Дождитесь следующего!')
      return
    }
    if (myCrashBet) {
      notify('Вы уже сделали ставку на этот раунд!')
      return
    }

    const cur = playCurrency
    const raw = parseFloat(crashStake)
    const v = cur === 'ar' ? Math.floor(raw) : raw
    const minStake = cur === 'ar' ? 1 : 10
    if (!isFinite(v) || isNaN(v) || v < minStake) {
      notify(`Минимальная ставка — ${minStake} ${unitOf(cur)}`)
      return
    }
    const autoMul = parseFloat(crashAutoCashout)
    const validAuto = isFinite(autoMul) && autoMul >= 1.05 ? r2(autoMul) : null

    const { data, error } = await supabase.rpc('crash_place_bet', {
      p_round: r.id, p_stake: v, p_auto: validAuto, p_currency: cur
    })
    if (error || !data) {
      notify(`❌ ${error?.message || 'Не удалось сделать ставку'}`)
      return
    }
    if (cur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: `Ставка в раунде Хряк-Крэш #${r.id}`, d: -v })
        next.bal = Number(data.bal)
        return next
      })
    }
    fetchCrashBets(r.id)
    notify(`Ставка ${fmtCur(v, cur)} на раунд #${r.id} принята! 🚀`)
  }

  const cancelCrashBet = async () => {
    const r = crashRoundRef.current
    if (!r || !myCrashBet || myCrashBet.cashedOutMul) return
    const cur = myCrashBet.currency
    const refund = myCrashBet.stake
    const { data, error } = await supabase.rpc('crash_cancel_bet', { p_round: r.id })
    if (error || !data) {
      notify(`❌ ${error?.message || 'Не удалось отменить ставку'}`)
      return
    }
    if (cur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: `Отмена ставки в Хряк-Крэш #${r.id}`, d: refund })
        next.bal = Number(data.bal)
        return next
      })
    }
    setMyCrashBet(null)
    fetchCrashBets(r.id)
    notify(`Ставка ${fmtCur(refund, cur)} возвращена на баланс!`)
  }

  const cashoutCrash = async () => {
    const r = crashRoundRef.current
    if (!r || !myCrashBet || myCrashBet.cashedOutMul) return

    const { data, error } = await supabase.rpc('crash_cashout', { p_round: r.id })
    if (error || !data) {
      notify(`❌ ${error?.message || 'Не удалось забрать'}`)
      fetchCrashBets(r.id)
      return
    }
    const cur = (data.currency === 'ar' ? 'ar' : myCrashBet.currency) as 'sv' | 'ar'
    const mul = Number(data.mul)
    const winAmount = Number(data.win)
    setMyCrashBet(prev => prev ? { ...prev, currency: cur, cashedOutMul: mul, winAmount } : null)
    if (cur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: `Выигрыш в раунде Хряк-Крэш (x${mul.toFixed(2)})`, d: winAmount })
        next.bal = Number(data.bal)
        return next
      })
    }
    fetchCrashBets(r.id)
    notify(`Забрано ${fmtCur(winAmount, cur)} по коэффициенту ${mul.toFixed(2)}x! 🎉`)
  }

  // Roulette Spin Logic - Physics-based Fortune Wheel (результат решает сервер)
  const spinRoulette = async () => {
    if (!currentUser) {
      setAuthModalOpen(true)
      notify('Для игры необходимо войти через Twitch!')
      return
    }
    if (currentUser.isBlocked) {
      notify('Ваш аккаунт заблокирован администратором!')
      return
    }
    if (spinning) return

    const cur = playCurrency
    const { data, error } = await supabase.rpc('wheel_spin', { p_currency: cur })
    if (error || !data) {
      notify(`❌ ${error?.message || 'Не удалось крутить'}`)
      return
    }

    setSpinning(true)
    setRouletteResult(null)
    setWonSectorIdx(null)

    const winningIdx = Number(data.sector)
    const sector = ROULETTE_SECTORS[winningIdx]
    const win = Number(data.win)
    const bal = Number(data.bal)
    const jp = Number(data.jackpot || 0)
    const stake = Number(data.stake || (cur === 'ar' ? 10 : 100))

    if (cur === 'ar') {
      setArBalance(bal)
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: 'Ставка в «Корыто Фортуны»', d: -stake })
        if (win > 0) {
          next.log.unshift({ t: Date.now(), x: `Выигрыш в «Корыто Фортуны» (${sector.label} • ${sector.title})`, d: win })
        }
        if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
        next.bal = bal
        return next
      })
    }
    if (jp > 0) setJackpotWin(jp)

    // Calculate rotation to land winningIdx at 270 deg (top pointer)
    const sectorCenter = (winningIdx + 0.5) * WHEEL_SEC_DEG
    let targetAngle = 270 - sectorCenter
    if (targetAngle < 0) targetAngle += 360

    const currentBase = Math.floor(wheelRotation / 360) * 360
    const finalRotation = currentBase + 1800 + targetAngle + (wheelRotation % 360 > targetAngle ? 360 : 0)

    setWheelRotation(finalRotation)

    setTimeout(() => {
      setSpinning(false)
      setWonSectorIdx(winningIdx)
      setRouletteResult(sector.mul === 0 ? `Увы! Выпало ${sector.label} (${sector.title}) 🐽` : `🎉 Ура! Выпало ${sector.label} — ${sector.title} (+${fmtCur(win, cur)})!`)
    }, 4200)
  }

  // Ежедневная награда: серия и начисление живут на сервере (claim_daily)
  const claimDaily = async () => {
    if (!currentUser) { setAuthModalOpen(true); notify('Войди через Twitch, чтобы получать награды'); return }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return }
    const res = await daily.claim()
    if (!res) return
    if ('error' in res) { notify(`❌ ${res.error}`); return }
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Ежедневная награда, день серии ${res.day}`, d: res.reward })
      next.bal = res.bal
      return next
    })
    notify(`🎁 +${fmt(res.reward)} (серия ${res.day} дн.)`)
  }

  // Кэшбэк: раз в сутки, процент вчерашних проигрышей по VIP-уровню
  const claimCashback = async () => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return }
    const { data, error } = await supabase.rpc('claim_cashback')
    if (error || !data) { notify(`❌ ${error?.message || 'Кэшбэк недоступен'}`); return }
    const win = Number(data.win)
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Кэшбэк ${data.pct}% • VIP «${data.levelName}»`, d: win })
      next.bal = Number(data.bal)
      return next
    })
    notify(`💰 Кэшбэк забран: +${win} SV₽ (${data.pct}% от вчерашних проигрышей)`)
  }

  // Грязевые лужи: раунд, раскладка луж и выплаты — на сервере
  const puddlesStart = async (stake: number, mines: number): Promise<string | null> => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return null }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return null }
    const cur = playCurrency
    const s = cur === 'ar' ? Math.floor(stake) : stake
    const { data, error } = await supabase.rpc('puddles_start', { p_stake: s, p_mines: mines, p_currency: cur })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось начать раунд'}`); return null }
    const jp = Number(data.jackpot || 0)
    const realCur = (data.currency === 'ar' ? 'ar' : cur) as 'sv' | 'ar'
    if (realCur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: 'Ставка в «Грязевые лужи»', d: -s })
        if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
        next.bal = Number(data.bal)
        return next
      })
    }
    if (jp > 0) setJackpotWin(jp)
    return String(data.round_id)
  }

  const puddlesPick = async (roundId: string, cell: number) => {
    const { data, error } = await supabase.rpc('puddles_pick', { p_round: roundId, p_cell: cell })
    if (error || !data) { notify(`❌ ${error?.message || 'Ошибка хода'}`); return null }
    if (data.auto_cashed) {
      const cur = (data.currency === 'ar' ? 'ar' : playCurrency) as 'sv' | 'ar'
      if (cur === 'ar') {
        setArBalance(Number(data.bal))
      } else {
        setS(prev => {
          const next = structuredClone(prev)
          next.log.unshift({ t: Date.now(), x: `Выигрыш в «Грязевые лужи» (x${data.mul})`, d: Number(data.win) })
          next.bal = Number(data.bal)
          return next
        })
      }
    }
    return data
  }

  const puddlesCash = async (roundId: string) => {
    const { data, error } = await supabase.rpc('puddles_cash', { p_round: roundId })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось забрать'}`); return null }
    const cur = (data.currency === 'ar' ? 'ar' : playCurrency) as 'sv' | 'ar'
    if (cur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: `Выигрыш в «Грязевые лужи» (x${data.mul})`, d: Number(data.win) })
        next.bal = Number(data.bal)
        return next
      })
    }
    return data
  }

  // Восстановление незакрытого раунда после перезагрузки страницы
  const puddlesRestore = async (): Promise<{ roundId: string; stake: number; mines: number; opened: number[]; currency: 'sv' | 'ar' } | null> => {
    const { data } = await supabase
      .from('puddles_rounds')
      .select('*')
      .eq('status', 'play')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return {
      roundId: String(data.id),
      stake: Number(data.stake),
      mines: Number(data.mines_count),
      opened: (data.opened || []) as number[],
      currency: (data.currency === 'ar' ? 'ar' : 'sv') as 'sv' | 'ar'
    }
  }

  // Пяточок-Плинко: бросок и выплата решаются на сервере, клиент только показывает полёт
  const plinkoBet = async (stake: number, risk: string): Promise<{ slot: number; mul: number; win: number } | null> => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return null }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return null }
    const cur = playCurrency
    const s = cur === 'ar' ? Math.floor(stake) : stake
    const { data, error } = await supabase.rpc('plinko_drop', { p_stake: s, p_risk: risk, p_currency: cur })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось бросить'}`); return null }
    const jp = Number(data.jackpot || 0)
    if (cur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: 'Ставка в «Пяточок-Плинко»', d: -s })
        const win = Number(data.win)
        if (win > 0) next.log.unshift({ t: Date.now(), x: `Выигрыш в «Пяточок-Плинко» (x${data.mul})`, d: win })
        if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
        next.bal = Number(data.bal)
        return next
      })
    }
    if (jp > 0) setJackpotWin(jp)
    return { slot: Number(data.slot), mul: Number(data.mul), win: Number(data.win) }
  }

  // Хрюк-блэкджек: синхронизация баланса/лога после серверных ходов крупье
  const bjBal = (bal: number, log: { x: string; d: number } | null, currency: 'sv' | 'ar' = 'sv') => {
    if (currency === 'ar') {
      setArBalance(bal)
      return
    }
    setS(prev => {
      const next = structuredClone(prev)
      if (log) next.log.unshift({ t: Date.now(), x: log.x, d: log.d })
      next.bal = bal
      return next
    })
  }

  // «Бонанза»: исход (каскады + фриспины) считает сервер одним RPC, клиент проигрывает раскадровку
  const bonanzaSpin = async (stake: number): Promise<any> => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return null }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return null }
    const cur = playCurrency
    const s = cur === 'ar' ? Math.floor(stake) : stake
    const { data, error } = await supabase.rpc('bonanza_spin', { p_stake: s, p_currency: cur })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось крутить'}`); return null }
    const jp = Number(data.jackpot || 0)
    const win = Number(data.win || 0)
    const realCur = (data.currency === 'ar' ? 'ar' : cur) as 'sv' | 'ar'
    if (realCur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: 'Ставка в «Бонанзе»', d: -s })
        if (win > 0) next.log.unshift({ t: Date.now(), x: `Выигрыш в «Бонанзе» (x${(win / s).toFixed(2)})`, d: win })
        if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
        next.bal = Number(data.bal)
        return next
      })
    }
    if (jp > 0) setJackpotWin(jp)
    return data
  }

  // «Кирка»: ставка/ход/вывод решает сервер, клиент рисует башню и падение кирки
  const pickStart = async (stake: number): Promise<string | null> => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return null }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return null }
    const cur = playCurrency
    const s = cur === 'ar' ? Math.floor(stake) : stake
    const { data, error } = await supabase.rpc('pick_start', { p_stake: s, p_currency: cur })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось начать спуск'}`); return null }
    const jp = Number(data.jackpot || 0)
    const realCur = (data.currency === 'ar' ? 'ar' : cur) as 'sv' | 'ar'
    if (realCur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: 'Ставка в «Кирке»', d: -s })
        if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
        next.bal = Number(data.bal)
        return next
      })
    }
    if (jp > 0) setJackpotWin(jp)
    return String(data.round_id)
  }

  const pickPick = async (roundId: string, col: number) => {
    const { data, error } = await supabase.rpc('pick_pick', { p_round: roundId, p_col: col })
    if (error || !data) { notify(`❌ ${error?.message || 'Ошибка удара'}`); return null }
    return data
  }

  const pickCash = async (roundId: string) => {
    const { data, error } = await supabase.rpc('pick_cash', { p_round: roundId })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось забрать'}`); return null }
    return data
  }

  const pickRestore = async (): Promise<{ roundId: string; stake: number; row: number; currency: 'sv' | 'ar' } | null> => {
    if (!currentUser) return null
    const { data, error } = await supabase.rpc('pick_restore')
    if (error || !data || !data.round_id) return null
    return {
      roundId: String(data.round_id),
      stake: Number(data.stake),
      row: Number(data.row),
      currency: (data.currency === 'ar' ? 'ar' : 'sv') as 'sv' | 'ar'
    }
  }

  // Курс рубля: путь курса, исход и выплата решает сервер в момент ставки
  const rublePredict = async (side: 'up' | 'down', stake: number): Promise<RubleResult | null> => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return null }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return null }
    const cur = playCurrency
    const s = cur === 'ar' ? Math.floor(stake) : stake
    const { data, error } = await supabase.rpc('ruble_predict', { p_side: side, p_stake: s, p_currency: cur })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось сделать ставку'}`); return null }
    const jp = Number(data.jackpot || 0)
    if (cur === 'ar') {
      setArBalance(Number(data.bal))
    } else {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: `Ставка на «${side === 'up' ? 'вверх' : 'вниз'}» в «Курс рубля»`, d: -s })
        const payout = Number(data.payout)
        if (payout > 0) next.log.unshift({ t: Date.now(), x: `Выигрыш в «Курс рубля» (x${data.mul})`, d: payout })
        if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
        next.bal = Number(data.bal)
        return next
      })
    }
    if (jp > 0) setJackpotWin(jp)
    return {
      start: Number(data.start), final: Number(data.final), resolveMs: Number(data.resolve_ms),
      dir: data.dir as RubleResult['dir'], win: Boolean(data.win),
      mul: Number(data.mul), payout: Number(data.payout),
    }
  }

  // Quick Templates for 1-click match creation
  const applyTemplate = (type: 'football' | 'cs2' | 'mma' | 'burger') => {
    if (type === 'football') {
      setNewMatchTitle('Спартак Хряк vs Зенит Боровы')
      setNewMatchCat(0)
      setNewMatchLeague('Свин-Лига РПЛ')
      setNewMatchTeam1('Спартак Хряк')
      setNewMatchTeam2('Зенит Боровы')
      setNewMatchOdds1('2.15')
      setNewMatchOddsX('3.30')
      setNewMatchOdds2('2.85')
      setNewMatchIsLive(false)
      setNewMatchScore('0 : 0')
      setNewMatchTime('Сегодня 20:00')
      setNewMatchDesc('Центральный матч тура грязевой Свин-Лиги.')
    } else if (type === 'cs2') {
      setNewMatchTitle('NAVI Pigs vs Team Spirit Hogs')
      setNewMatchCat(4)
      setNewMatchLeague('ThunderPig CS2 Major | Финал')
      setNewMatchTeam1('NAVI Pigs')
      setNewMatchTeam2('Team Spirit Hogs')
      setNewMatchOdds1('1.72')
      setNewMatchOddsX('5.50')
      setNewMatchOdds2('2.15')
      setNewMatchIsLive(true)
      setNewMatchScore('11 : 9')
      setNewMatchTime('Карта 2 • Mirage')
      setNewMatchDesc('Гранд-финал мажора в прямом эфире!')
    } else if (type === 'mma') {
      setNewMatchTitle('Махачев Секач vs Царукян Боров')
      setNewMatchCat(6)
      setNewMatchLeague('Хрюк-UFC 310 | Главный бой')
      setNewMatchTeam1('Махачев Секач')
      setNewMatchTeam2('Царукян Боров')
      setNewMatchOdds1('1.55')
      setNewMatchOddsX('12.00')
      setNewMatchOdds2('2.55')
      setNewMatchIsLive(false)
      setNewMatchScore('0 : 0')
      setNewMatchTime('Суббота 23:30')
      setNewMatchDesc('Титульный поединок за пояс в соломе.')
    } else if (type === 'burger') {
      setNewMatchTitle('Хряк-Чемпион vs Гигантский Бургер 2кг')
      setNewMatchCat(5)
      setNewMatchLeague('Burger Cup | Скоростное поедание')
      setNewMatchTeam1('Хряк-Чемпион')
      setNewMatchTeam2('Бургер-Монстр')
      setNewMatchOdds1('1.85')
      setNewMatchOddsX('3.50')
      setNewMatchOdds2('1.95')
      setNewMatchIsLive(true)
      setNewMatchScore('1 : 0')
      setNewMatchTime('Финал 30 сек')
      setNewMatchDesc('Прямой эфир со столовой SWINLINE!')
    }
    notify('Шаблон применён! Можете отредактировать параметры или сразу опубликовать 🚀')
  }

  // Admin: Create New Match
  const handleCreateMatch = (e: FormEvent) => {
    e.preventDefault()
    if (!newMatchTitle.trim()) {
      notify('Введите название матча!')
      return
    }
    const o1 = parseFloat(newMatchOdds1) || 1.95
    const ox = parseFloat(newMatchOddsX) || 3.20
    const o2 = parseFloat(newMatchOdds2) || 2.35

    const newEv: Ev = {
      id: 'custom_' + Date.now(),
      cat: newMatchCat,
      league: newMatchLeague.trim() || 'Свин-Лига РПЛ',
      title: newMatchTitle.trim(),
      team1: newMatchTeam1.trim() || 'Команда 1',
      team2: newMatchTeam2.trim() || 'Команда 2',
      score: newMatchScore.trim() || '0 : 0',
      isLive: newMatchIsLive,
      liveTime: newMatchIsLive ? (newMatchTime.trim() || '1-й тайм 1\'') : (newMatchTime.trim() || 'Скоро'),
      desc: newMatchDesc.trim() || 'Матч добавлен администратором SWINLINE.',
      out: [
        ['П1', o1],
        ['Ничья X', ox],
        ['П2', o2],
        ['Фора 1 (-1)', r2(o1 * 0.9)],
        ['Фора 2 (+1)', r2(o2 * 0.9)],
        ['Тотал М 2.5', 1.85],
        ['Тотал Б 2.5', 1.95]
      ]
    }

    setCustomEvents(prev => [newEv, ...prev])
    // Публикуем в общую базу, чтобы событие увидели все игроки (нужен раздел 7 SQL-скрипта).
    // Если базы нет — событие останется локальным, как раньше, и мы честно об этом скажем.
    supabase.from('events').insert({ id: newEv.id, data: newEv, status: 'open', owner_id: currentUser?.id ?? null }).then(res => {
      if (res.error) notify(`⚠️ Событие видно только вам: общая база недоступна (${res.error.message})`)
      else fetchDbEvents()
    }, () => notify('⚠️ Событие видно только вам: сеть недоступна'))
    setNewMatchTitle('')
    setNewMatchTeam1('')
    setNewMatchTeam2('')
    setNewMatchDesc('')
    setCreateMatchModalOpen(false)
    setAdminModalOpen(false)
    notify(`Матч «${newEv.title}» успешно опубликован в линию! 🚀`)
  }

  // Safe Deletion with Confirmation
  const handleDeleteEventConfirmed = () => {
    if (!deleteEventModal) return
    const evId = deleteEventModal.id
    const evTitle = deleteEventModal.title

    // If any open bets exist on this event, cancel & refund them first
    mutate(s => {
      markOutcome(s, evId, 'cancel')
    })

    // Remove event from customEvents
    setCustomEvents(prev => prev.filter(e => e.id !== evId))

    // Удаляем и из общей базы (у всех игроков событие исчезнет, их открытые ставки вернутся)
    if (dbEventIds.has(evId)) {
      // Сначала помечаем открытые ставки в базе возвратом, затем удаляем событие
      supabase.rpc('admin_settle_bets', { p_event: evId, p_winner: null }).then(res => {
        if (res.error) console.error('admin_settle_bets (delete) failed:', res.error.message)
      })
      supabase.from('events').delete().eq('id', evId).then(res => {
        if (res.error) notify(`⚠️ Удалено только локально: ${res.error.message}`)
        else fetchDbEvents()
      }, () => notify('⚠️ Удалено только локально: сеть недоступна'))
    }

    if (selectedBet?.evId === evId) {
      setSelectedBet(null)
    }

    setDeleteEventModal(null)
    notify(`Событие «${evTitle}» полностью удалено из линии 🗑️`)
  }

  // Cancel Event (refund all placed bets)
  const handleCancelEventAction = (ev: Ev) => {
    mutate(s => {
      markOutcome(s, ev.id, 'cancel')
    }, `Матч «${ev.title}» отменен, ставки возвращены игрокам ↩️`)
    // Отмена распространяется на всех игроков через общую базу
    if (dbEventIds.has(ev.id)) {
      supabase.from('events').update({ status: 'cancel', updated_at: new Date().toISOString() }).eq('id', ev.id).then(res => {
        if (res.error) notify(`⚠️ Отмена применилась только у вас: ${res.error.message}`)
        else fetchDbEvents()
      })
      // Ставки в базе помечаем возвратом и возвращаем балансы (сервер)
      supabase.rpc('admin_settle_bets', { p_event: ev.id, p_winner: null }).then(res => {
        if (res.error) notify(`⚠️ Возвраты в базе не проведены: ${res.error.message}`)
      })
    }
  }

  // Settle Event (payout winners)
  const handleSettleEventAction = (ev: Ev, outcomeIdx: number) => {
    const outcomeName = ev.out[outcomeIdx]?.[0] || 'Исход'
    mutate(s => {
      markOutcome(s, ev.id, 'done', outcomeIdx)
    }, `Матч «${ev.title}» рассчитан! Победил: ${outcomeName} 🏆`)
    // Расчёт распространяется на всех игроков через общую базу
    if (dbEventIds.has(ev.id)) {
      supabase.from('events').update({ status: 'done', winner: outcomeIdx, updated_at: new Date().toISOString() }).eq('id', ev.id).then(res => {
        if (res.error) notify(`⚠️ Расчёт применился только у вас: ${res.error.message}`)
        else fetchDbEvents()
      })
      // Ставки всех игроков в базе рассчитываются, балансы начисляет сервер
      supabase.rpc('admin_settle_bets', { p_event: ev.id, p_winner: outcomeIdx }).then(res => {
        if (res.error) notify(`⚠️ Выплаты в базе не проведены: ${res.error.message}`)
      })
    }
  }

  // Toggle Betting Open/Closed
  const handleToggleEventClosedAction = (ev: Ev) => {
    const current = S.st[ev.id]?.s || 'open'
    const nextStatus = current === 'closed' ? 'open' : 'closed'
    mutate(s => {
      if (!s.st[ev.id]) s.st[ev.id] = {}
      s.st[ev.id].s = nextStatus
    }, nextStatus === 'closed' ? `Приём ставок на «${ev.title}» закрыт 🔒` : `Приём ставок на «${ev.title}» открыт 🟢`)
    if (dbEventIds.has(ev.id)) {
      supabase.from('events').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', ev.id).then(res => {
        if (res.error) notify(`⚠️ Изменение применилось только у вас: ${res.error.message}`)
      })
    }
  }

  // Save Event Score / Live Status
  const handleEditEventSave = () => {
    if (!editEventModal) return
    setCustomEvents(prev => prev.map(e => e.id === editEventModal.id ? {
      ...e,
      score: editScore,
      liveTime: editLiveTime,
      isLive: editIsLive
    } : e))
    // Обновляем и общую базу, если событие там
    if (dbEventIds.has(editEventModal.id)) {
      const updated: Ev = { ...editEventModal, score: editScore, liveTime: editLiveTime, isLive: editIsLive }
      supabase.from('events').update({ data: updated, updated_at: new Date().toISOString() }).eq('id', editEventModal.id).then(res => {
        if (res.error) notify(`⚠️ Изменения видны только вам: ${res.error.message}`)
        else fetchDbEvents()
      })
    }
    setEditEventModal(null)
    notify(`Матч «${editEventModal.title}» обновлен: счёт ${editScore}! ✏️`)
  }

  // Clear all events safely
  const handleClearAllEvents = () => {
    if (confirm('ВНИМАНИЕ: Вы действительно хотите удалить ВСЕ события из линии? Все открытые ставки будут автоматически возвращены.')) {
      mutate(s => {
        allEvents.forEach(e => markOutcome(s, e.id, 'cancel'))
      })
      setCustomEvents([])
      // Чистим и общую базу — событие исчезнет у всех игроков
      dbEvents.forEach(d => {
        supabase.from('events').delete().eq('id', d.ev.id).then(res => {
          if (res.error) console.error('Failed to delete event from Supabase:', res.error.message)
        })
      })
      setSelectedBet(null)
      notify('Все события удалены из линии. Линия чиста! 🧹')
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch {}
    localStorage.removeItem('svinline_last_auth_provider')
    localStorage.removeItem(KEY_CURRENT_USER)
    activeUserLoadedRef.current = null
    setCurrentUserId(null)
    setS(freshState())
    setProfileModalOpen(false)
    notify('Вы вышли из профиля. Режим гостя.')
  }

  // Сброс баланса и истории (кнопка «Сбросить всё» в «Мой счет»)
  const handleResetAll = () => {
    if (confirm('Сбросить весь баланс и историю ставок?')) {
      if (currentUser) {
        supabase.rpc('self_reset_balance').then(({ data, error }) => {
          if (!error && data) setS({ ...freshState(), bal: Number(data.bal) })
          else notify('❌ Не удалось сбросить баланс')
        })
      } else {
        setS(freshState())
      }
      setSelectedBet(null)
      notify('Прогресс сброшен к 10 000 SV₽')
    }
  }

  // Admin Surveillance & Actions
  // Действия идут через серверные RPC-функции Supabase (admin_* в SQL-скрипте):
  // внутри проверяется, что вызывающий — владелец платформы. Ошибки показываем честно.
  const handleAdminTopUp = async (targetId: string, amount: number) => {
    const target = accounts.find(a => a.id === targetId)
    if (!target) return
    const { data: newBal, error } = await supabase.rpc('admin_top_up', { p_target: targetId, p_amount: amount })
    if (error || newBal === null || newBal === undefined) {
      notify(`❌ Начисление не удалось: ${error?.message || 'неизвестная ошибка'}`)
      return
    }
    setAccounts(prev => prev.map(a => a.id === targetId ? {
      ...a,
      bal: Number(newBal),
      log: [{ t: Date.now(), x: `Пополнение от Администратора (+${fmt(amount)})`, d: amount }, ...a.log]
    } : a))
    if (currentUserId === targetId) {
      setS(prev => ({ ...prev, bal: Number(newBal) }))
    }
    notify(`Пользователю начислено +${fmt(amount)} (баланс: ${fmt(Number(newBal))})`)
  }

  const handleAdminReset = async (targetId: string) => {
    const target = accounts.find(a => a.id === targetId)
    if (!target) return
    const { data: newBal, error } = await supabase.rpc('admin_reset_balance', { p_target: targetId })
    if (error || newBal === null || newBal === undefined) {
      notify(`❌ Обнуление не удалось: ${error?.message || 'неизвестная ошибка'}`)
      return
    }
    setAccounts(prev => prev.map(a => a.id === targetId ? {
      ...a,
      bal: 0,
      log: [{ t: Date.now(), x: 'Сброс баланса Администратором', d: -target.bal }, ...a.log]
    } : a))
    if (currentUserId === targetId) {
      setS(prev => ({ ...prev, bal: 0 }))
    }
    notify(`Баланс пользователя обнулён`)
  }

  const handleAdminToggleBlock = async (targetId: string) => {
    const target = accounts.find(a => a.id === targetId)
    if (!target) return
    const nextBlocked = !target.isBlocked
    const { data: found, error } = await supabase.rpc('admin_set_blocked', { p_target: targetId, p_blocked: nextBlocked })
    if (error) {
      notify(`❌ Блокировка не удалась: ${error.message}`)
      return
    }
    if (!found) {
      notify('❌ Игрок не найден в базе')
      return
    }
    setAccounts(prev => prev.map(a => a.id === targetId ? { ...a, isBlocked: nextBlocked } : a))
    notify(`Пользователь ${target.username} ${nextBlocked ? 'заблокирован ⛔' : 'разблокирован ✅'}`)
  }

  const handleAdminDeleteUser = async (targetId: string) => {
    const target = accounts.find(a => a.id === targetId)
    if (target?.role === 'admin') {
      notify('Нельзя удалить аккаунт администратора!')
      return
    }
    if (!confirm(`Удалить игрока «${target?.username || targetId}»? Это удалит его профиль, ставки и аккаунт авторизации.`)) return
    const { data: deleted, error } = await supabase.rpc('admin_delete_user', { p_target: targetId })
    if (error) {
      notify(`❌ Удаление не удалось: ${error.message}`)
      return
    }
    setAccounts(prev => prev.filter(a => a.id !== targetId))
    if (currentUserId === targetId) {
      setCurrentUserId(null)
    }
    notify(`Игрок ${target?.username} полностью удалён из базы!`)
  }

  const handleAdminPurgeEmpty = async () => {
    await fetchSupabaseUsers()
    await fetchAdminPlayers()
    notify('Синхронизировано с базой данных Supabase!')
  }

  // Filtered events
  const filteredEvents = useMemo(() => {
    return allEvents.filter(ev => {
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
  }, [allEvents, view, selectedSport, favoritesOnly, favorites, searchQuery])

  // Group events by league
  const groupedByLeague = useMemo(() => {
    const map = new Map<string, Ev[]>()
    filteredEvents.forEach(ev => {
      if (!map.has(ev.league)) map.set(ev.league, [])
      map.get(ev.league)!.push(ev)
    })
    return Array.from(map.entries())
  }, [filteredEvents])

  const activeBetsCount = S.bets.filter((b: any) => b.state === 'open').length

  const stakeVal = parseFloat(stake)
  const isStakeValid = isFinite(stakeVal) && stakeVal > 0
  const currentOdds = selectedBet?.odds || 1
  const potentialPayout = isStakeValid ? payout(stakeVal, currentOdds) : 0
  const netProfit = isStakeValid ? r2(potentialPayout - stakeVal) : 0

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 1. Header (Winline style with SWINLINE branding) */}
      <Header
        view={view}
        setView={setView}
        setSelectedSport={setSelectedSport}
        balance={S.bal}
        currentUser={currentUser}
        isAdmin={isAdmin}
        daily={daily}
        onOpenAdminCenter={() => { setAdminTab('users'); setAdminModalOpen(true) }}
        onOpenProfile={() => setProfileModalOpen(true)}
        onAddMoney={() => addVirtualMoney(5000)}
        onLogout={handleLogout}
        onOAuthLogin={handleOAuthLogin}
      />

      {/* 2. Main 3-Column Layout */}
      <div className={`wl-layout wl-view-${view}`}>
        {/* Left Sidebar */}
        <Sidebar
          view={view}
          setView={setView}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          favorites={favorites}
          selectedSport={selectedSport}
          setSelectedSport={setSelectedSport}
          isAdmin={isAdmin}
          onOpenAdmin={() => setAdminModalOpen(true)}
          allEvents={allEvents}
        />

        {/* Center Main Content */}
        <main className="wl-center">
          {/* A. LINE / LIVE VIEW */}
          {(view === 'line' || view === 'live') && (
            <LineView
              view={view}
              setView={setView}
              selectedSport={selectedSport}
              setSelectedSport={setSelectedSport}
              allEvents={allEvents}
              groupedByLeague={groupedByLeague}
              S={S}
              expandedMarkets={expandedMarkets}
              favorites={favorites}
              selectedBet={selectedBet}
              isAdmin={isAdmin}
              notify={notify}
              setSearchQuery={setSearchQuery}
              setCreateMatchModalOpen={setCreateMatchModalOpen}
              applyTemplate={applyTemplate}
              toggleFavorite={toggleFavorite}
              toggleMarket={toggleMarket}
              selectOdd={selectOdd}
              handleToggleEventClosedAction={handleToggleEventClosedAction}
              handleSettleEventAction={handleSettleEventAction}
              handleCancelEventAction={handleCancelEventAction}
              setDeleteEventModal={setDeleteEventModal}
              setEditEventModal={setEditEventModal}
              setEditScore={setEditScore}
              setEditLiveTime={setEditLiveTime}
              setEditIsLive={setEditIsLive}
            />
          )}

          {/* B. GAMES 24/7 (CRASH & ROULETTE) */}
          {view === 'games24' && (
            <div style={{ maxWidth: 1060, margin: '0 auto' }}>
              <CasinoStrip />
              <JackpotOverlay amount={jackpotWin} onClose={() => setJackpotWin(null)} />
              {gamesTab !== 'mine' && (
                <>
                  <div className="wl-currency-switch">
                    <span className="wl-currency-label">Играть на:</span>
                    <button
                      className={`wl-round-btn ${playCurrency === 'sv' ? 'active' : ''}`}
                      onClick={() => setPlayCurrency('sv')}
                    >
                      SV₽ · {S.bal.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                    </button>
                    <button
                      className={`wl-round-btn ${playCurrency === 'ar' ? 'active' : ''}`}
                      onClick={() => {
                        if (!currentUser) {
                          setAuthModalOpen(true)
                          notify('Войди через Twitch, чтобы играть на АР')
                          return
                        }
                        setPlayCurrency('ar')
                        refreshAr()
                      }}
                      disabled={!currentUser}
                      title={currentUser ? 'Играть на алмазной валюте' : 'Войди через Twitch, чтобы играть на АР'}
                    >
                      АР · {arBalance.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                    </button>
                  </div>
                  {playCurrency === 'ar' && (
                    <div className="wl-currency-note">
                      1 АР = 1 алмазная руда. Занос и вывод — в разделе «Minecraft».
                    </div>
                  )}
                </>
              )}
              {/* Game Cards — витрина в стиле казино-лобби */}
              <GameCards gamesTab={gamesTab} setGamesTab={setGamesTab} />

              <Suspense fallback={<div className="wl-game-loading">Загрузка игры…</div>}>
              {/* CRASH GAME ARENA */}
              {gamesTab === 'crash' && (
                <CrashArena
                  crashMultiplier={crashMultiplier}
                  crashPhase={crashPhase}
                  crashCountdown={crashCountdown}
                  crashRound={crashRound}
                  crashHistory={crashHistory}
                  myCrashBet={myCrashBet}
                  liveCrashBets={liveCrashBets}
                  crashStake={crashStake}
                  setCrashStake={setCrashStake}
                  crashAutoCashout={crashAutoCashout}
                  setCrashAutoCashout={setCrashAutoCashout}
                  placeCrashBet={placeCrashBet}
                  cancelCrashBet={cancelCrashBet}
                  cashoutCrash={cashoutCrash}
                  currentUser={currentUser}
                  unit={unitOf(playCurrency)}
                />
              )}

              {/* ROULETTE (КОРЫТО ФОРТУНЫ) */}
              {gamesTab === 'plinko' && <Plinko bal={playCurrency === 'ar' ? arBalance : S.bal} unit={unitOf(playCurrency)} onBet={plinkoBet} />}
              {gamesTab === 'puddles' && <MudPuddles bal={playCurrency === 'ar' ? arBalance : S.bal} unit={unitOf(playCurrency)} onStart={puddlesStart} onPick={puddlesPick} onCash={puddlesCash} onRestore={puddlesRestore} />}
              {gamesTab === 'ruble' && <RubleChart bal={playCurrency === 'ar' ? arBalance : S.bal} unit={unitOf(playCurrency)} onPredict={rublePredict} />}
              {gamesTab === 'blackjack' && <Blackjack bal={playCurrency === 'ar' ? arBalance : S.bal} currency={playCurrency} unit={unitOf(playCurrency)} onBal={bjBal} notify={notify} onNeedAuth={() => setAuthModalOpen(true)} />}
              {gamesTab === 'pick' && (
                <PickGame
                  bal={playCurrency === 'ar' ? arBalance : S.bal}
                  unit={unitOf(playCurrency)}
                  currency={playCurrency}
                  onStart={pickStart}
                  onPick={pickPick}
                  onCash={pickCash}
                  onRestore={pickRestore}
                  onBal={bjBal}
                />
              )}
              {gamesTab === 'bonanza' && (
                <BonanzaGame
                  currentUser={currentUser}
                  bal={playCurrency === 'ar' ? arBalance : S.bal}
                  unit={unitOf(playCurrency)}
                  currency={playCurrency}
                  onSpin={bonanzaSpin}
                  notify={notify}
                />
              )}
              {gamesTab === 'olympus' && (
                <div className="ol-embed">
                  <div className="ol-embed-bar">
                    <span className="ol-embed-title">ОЛИМП · оригинальный проект</span>
                    <div className="ol-embed-actions">
                      <a className="ol-embed-link" href="./olympus/index.html?v=2" target="_blank" rel="noreferrer">Открыть отдельно</a>
                      <button type="button" className="ol-embed-close" aria-label="Закрыть Олимп" onClick={() => setGamesTab('crash')}>✕</button>
                    </div>
                  </div>
                  <iframe
                    className="ol-embed-frame"
                    src="./olympus/index.html?v=2"
                    title="Олимп — оригинальный слот"
                    allow="autoplay; fullscreen; encrypted-media"
                  />
                </div>
              )}
              {gamesTab === 'mine' && (
                <MineView
                  mode="game"
                  currentUser={currentUser}
                  notify={notify}
                  onNeedAuth={() => setAuthModalOpen(true)}
                  onOpenLink={() => setView('minecraft')}
                  playCurrency={playCurrency}
                  setPlayCurrency={setPlayCurrency}
                  svBalance={S.bal}
                  onBal={(cur, bal) => {
                    if (cur === 'ar') {
                      setArBalance(bal)
                    } else {
                      setS(prev => {
                        const next = structuredClone(prev)
                        next.bal = bal
                        return next
                      })
                    }
                  }}
                />
              )}

              {gamesTab === 'roulette' && (
                <RouletteWheel
                  spinning={spinning}
                  wheelRotation={wheelRotation}
                  wonSectorIdx={wonSectorIdx}
                  rouletteResult={rouletteResult}
                  spinRoulette={spinRoulette}
                  unit={unitOf(playCurrency)}
                  stake={playCurrency === 'ar' ? 10 : 100}
                />
              )}
              </Suspense>
            </div>
          )}

          {/* C. ESPORTS: Twitch-каналы + ставки на Кибер-Хряк */}
          {view === 'esports' && (
            <EsportsView
              currentUser={currentUser}
              isAdmin={isAdmin}
              allEvents={allEvents}
              S={S}
              selectedBet={selectedBet}
              selectOdd={selectOdd}
              onOpenCreateMatch={() => {
                setNewMatchCat(4)
                setCreateMatchModalOpen(true)
              }}
              notify={notify}
            />
          )}

          {/* D. WALLET / PROFILE VIEW */}
          {view === 'wallet' && (
            <WalletView
              daily={daily}
              claimDaily={claimDaily}
              balance={S.bal}
              S={S}
              allEvents={allEvents}
              currentUser={currentUser}
              addVirtualMoney={addVirtualMoney}
              claimCashback={claimCashback}
              onResetAll={handleResetAll}
            />
          )}

          {/* E. PROMOS VIEW */}
          {view === 'promos' && (
            <PromosView notify={notify} />
          )}

          {/* H. MINECRAFT — привязка аккаунта и вывод АР */}
          {view === 'minecraft' && (
            <Suspense fallback={<div className="wl-game-loading">Загрузка…</div>}>
              <MineView
                mode="link"
                currentUser={currentUser}
                notify={notify}
                onNeedAuth={() => setAuthModalOpen(true)}
                onPlay={() => { setView('games24'); setGamesTab('mine') }}
                onBal={(cur, bal) => { if (cur === 'ar') setArBalance(bal) }}
              />
            </Suspense>
          )}

          {/* F. RESULTS VIEW */}
          {view === 'results' && (
            <ResultsView allEvents={allEvents} S={S} />
          )}

          {/* G. ABOUT VIEW */}
          {view === 'about' && (
            <AboutView />
          )}
        </main>
      </div>

      <CouponBar {...{ activeBetsCount, notify, selectedBet, setSlipOpen, slipOpen }} />
      <MobileNav
        view={view}
        setView={setView}
        setSelectedSport={setSelectedSport}
        slipOpen={slipOpen}
        onToggleSlip={() => setSlipOpen(prev => !prev)}
        couponCount={selectedBet ? 1 : 0}
        activeBetsCount={activeBetsCount}
        currentUser={currentUser}
        isAdmin={isAdmin}
        balance={S.bal}
        onOpenProfile={() => setProfileModalOpen(true)}
        onOpenAdmin={() => { setAdminTab('users'); setAdminModalOpen(true) }}
        onOAuthLogin={handleOAuthLogin}
        onLogout={handleLogout}
        onSupport={() => {
          notify('💬 Поддержка: @egor4kill')
          window.open('https://t.me/egor4kill', '_blank')
        }}
      />
      <BetSlip {...{ S, activeBetsCount, allEvents, err, handlePlaceBet, isStakeValid, potentialPayout, selectedBet, setErr, setSelectedBet, setSlipOpen, setSlipTab, setStake, slipOpen, slipTab, stake, playCurrency, setPlayCurrency, arBalance, currentUser, onNeedAuth: () => setAuthModalOpen(true) }} />
      <ProfileModal {...{ S, currentUser, handleLogout, isAdmin, myStats, profileModalOpen, setProfileModalOpen }} />
      <AdminModal {...{ CATS, S, accounts, addVirtualMoney, adminModalOpen, adminTab, allEvents, applyTemplate, currentUser, fetchSupabaseUsers, freshState, handleAdminDeleteUser, handleAdminPurgeEmpty, handleAdminReset, handleAdminToggleBlock, handleAdminTopUp, handleCancelEventAction, handleClearAllEvents, handleCreateMatch, handleSettleEventAction, handleToggleEventClosedAction, isAdmin, newMatchCat, newMatchIsLive, newMatchLeague, newMatchOdds1, newMatchOdds2, newMatchOddsX, newMatchScore, newMatchTeam1, newMatchTeam2, newMatchTime, newMatchTitle, notify, setAdminModalOpen, setAdminTab, setCreateMatchModalOpen, setDeleteEventModal, setEditEventModal, setEditIsLive, setEditLiveTime, setEditScore, setInspectingUser, setNewMatchCat, setNewMatchIsLive, setNewMatchLeague, setNewMatchOdds1, setNewMatchOdds2, setNewMatchOddsX, setNewMatchScore, setNewMatchTeam1, setNewMatchTeam2, setNewMatchTime, setNewMatchTitle, setS, setSelectedBet }} />
      <AuthModal {...{ authModalOpen, handleOAuthLogin, setAuthModalOpen }} />
      <InspectUserModal {...{ allEvents, inspectingUser, setInspectingUser }} />
      <DeleteEventModal {...{ deleteEventModal, handleDeleteEventConfirmed, setDeleteEventModal }} />
      <EditScoreModal {...{ editEventModal, editIsLive, editLiveTime, editScore, handleEditEventSave, setEditEventModal, setEditIsLive, setEditLiveTime, setEditScore }} />
      <CreateMatchModal {...{ CATS, applyTemplate, createMatchModalOpen, handleCreateMatch, newMatchCat, newMatchDesc, newMatchIsLive, newMatchLeague, newMatchOdds1, newMatchOdds2, newMatchOddsX, newMatchScore, newMatchTeam1, newMatchTeam2, newMatchTime, newMatchTitle, setCreateMatchModalOpen, setNewMatchCat, setNewMatchDesc, setNewMatchIsLive, setNewMatchLeague, setNewMatchOdds1, setNewMatchOdds2, setNewMatchOddsX, setNewMatchScore, setNewMatchTeam1, setNewMatchTeam2, setNewMatchTime, setNewMatchTitle }} />
      {/* 7. Toast feedback notification */}
      {msg && (
        <div className="wl-toast">
          <CheckCircle2 size={18} color="var(--org)" />
          <span>{msg}</span>
        </div>
      )}

      {/* 8. Discreet Footer */}
      <footer className="wl-footer">
        <div>
          © 2026 SWINLINE (СВИНЛАЙН). Все права защищены. Играйте ответственно. Внутренняя расчетная единица: SV₽. 18+
        </div>
      </footer>
    </div>
  )
}
