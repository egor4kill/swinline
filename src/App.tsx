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

const freshState = () => ({
  bal: START,
  bets: [] as any[],
  log: [{ t: Date.now(), x: 'Стартовый баланс', d: START }],
  st: {} as Record<string, { s: string; w?: number }>
})

import Plinko from './Plinko'
import MudPuddles from './MudPuddles'
import RubleChart, { type RubleResult } from './RubleChart'
import CasinoStrip, { JackpotOverlay } from './CasinoStrip'
import VipBadge from './VipBadge'
import DailyRewards from './DailyRewards'
import { useDaily } from './useDaily'
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {}
  return fallback
}

import { fmt } from './fmt'
import { PigLogo, UserAvatar, getTwitchAvatar } from './components/Avatars'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import LineView from './components/LineView'
import CrashArena from './components/games/CrashArena'
import RouletteWheel, { WHEEL_SEC_DEG } from './components/games/RouletteWheel'
import EsportsView from './components/EsportsView'
import WalletView from './components/WalletView'
import PromosView from './components/PromosView'
import ResultsView from './components/ResultsView'
import AboutView from './components/AboutView'

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
  const [gamesTab, setGamesTab] = useState<'crash' | 'roulette' | 'plinko' | 'puddles' | 'ruble'>('crash')
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

  // 5. Esports stream
  const [streamPlaying, setStreamPlaying] = useState(true)
  const [chatMessages, setChatMessages] = useState<string[]>([
    'Чат матча активен. Соблюдайте правила общения!'
  ])
  const [esportsChatInput, setEsportsChatInput] = useState('')

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

    const v = parseFloat(stake)
    if (isNaN(v) || !isFinite(v) || v < 10) {
      setErr('Минимальная сумма ставки — 10 SV₽')
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
      p_stake: v
    })
    setTimeout(() => { busy.current = false }, 350)

    if (error || !data) {
      setErr(error?.message || 'Не удалось принять ставку')
      return
    }

    const next = structuredClone(S)
    next.bal = Number(data.bal)
    next.bets.unshift({
      id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
      ev: selectedBet.evId,
      i: selectedBet.outcomeIdx,
      stake: v,
      odds: Number(data.odds) || selectedBet.odds,
      state: 'open'
    })
    next.log.unshift({ t: Date.now(), x: 'Ставка: ' + ev.title + ' (' + (data.pick || selectedBet.outcomeTitle) + ')', d: -v })
    setS(next)
    fetchSupabaseUsers()

    setSelectedBet(null)
    setErr('')
    notify(`Ставка ${fmt(v)} принята и сохранена в базе! ✅`)
  }

  // ===== Общий движок Хряк-Крэша: раунды и ставки живут в базе =====
  const fetchCrashBets = useCallback(async (roundId: number) => {
    const { data } = await supabase.from('crash_bets').select('*').eq('round_id', roundId).order('created_at', { ascending: true })
    if (!data) return
    setLiveCrashBets(data)
    const mine = data.find((b: any) => b.user_id === currentUserRef.current?.id)
    setMyCrashBet(mine ? {
      stake: Number(mine.stake),
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
  }, [pollCrashState, view, gamesTab])

  // Локальная анимация: фаза и мультипликатор считаются от времени старта раунда из базы
  useEffect(() => {
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
  }, [])

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

    const v = parseFloat(crashStake)
    if (!isFinite(v) || isNaN(v) || v < 10) {
      notify('Минимальная ставка — 10 SV₽')
      return
    }
    const autoMul = parseFloat(crashAutoCashout)
    const validAuto = isFinite(autoMul) && autoMul >= 1.05 ? r2(autoMul) : null

    const { data, error } = await supabase.rpc('crash_place_bet', { p_round: r.id, p_stake: v, p_auto: validAuto })
    if (error) {
      notify(`❌ ${error.message}`)
      return
    }
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Ставка в общем раунде Хряк-Крэш #${r.id}`, d: -v })
      if (data && data.bal !== undefined) next.bal = Number(data.bal)
      return next
    })
    fetchCrashBets(r.id)
    notify(`Ставка ${fmt(v)} на общий раунд #${r.id} принята! 🚀`)
  }

  const cancelCrashBet = async () => {
    const r = crashRoundRef.current
    if (!r || !myCrashBet || myCrashBet.cashedOutMul) return
    const refund = myCrashBet.stake
    const { data, error } = await supabase.rpc('crash_cancel_bet', { p_round: r.id })
    if (error) {
      notify(`❌ ${error.message}`)
      return
    }
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Отмена ставки в Хряк-Крэш #${r.id}`, d: refund })
      if (data && data.bal !== undefined) next.bal = Number(data.bal)
      return next
    })
    setMyCrashBet(null)
    fetchCrashBets(r.id)
    notify(`Ставка ${fmt(refund)} возвращена на баланс!`)
  }

  const cashoutCrash = async () => {
    const r = crashRoundRef.current
    if (!r || !myCrashBet || myCrashBet.cashedOutMul) return

    const { data, error } = await supabase.rpc('crash_cashout', { p_round: r.id })
    if (error) {
      notify(`❌ ${error.message}`)
      fetchCrashBets(r.id)
      return
    }
    const mul = Number(data.mul)
    const winAmount = Number(data.win)
    setMyCrashBet(prev => prev ? { ...prev, cashedOutMul: mul, winAmount } : null)
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Выигрыш в общем раунде Хряк-Крэш (x${mul.toFixed(2)})`, d: winAmount })
      next.bal = Number(data.bal)
      return next
    })
    fetchCrashBets(r.id)
    notify(`Забрано ${fmt(winAmount)} по коэффициенту ${mul.toFixed(2)}x! 🎉`)
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

    const { data, error } = await supabase.rpc('wheel_spin')
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

    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: 'Ставка в «Корыто Фортуны»', d: -100 })
      if (win > 0) {
        next.log.unshift({ t: Date.now(), x: `Выигрыш в «Корыто Фортуны» (${sector.label} • ${sector.title})`, d: win })
      }
      if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
      next.bal = bal
      return next
    })
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
      setRouletteResult(sector.mul === 0 ? `Увы! Выпало ${sector.label} (${sector.title}) 🐽` : `🎉 Ура! Выпало ${sector.label} — ${sector.title} (+${fmt(win)})!`)
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
    const { data, error } = await supabase.rpc('puddles_start', { p_stake: stake, p_mines: mines })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось начать раунд'}`); return null }
    const jp = Number(data.jackpot || 0)
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: 'Ставка в «Грязевые лужи»', d: -stake })
      if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
      next.bal = Number(data.bal)
      return next
    })
    if (jp > 0) setJackpotWin(jp)
    return String(data.round_id)
  }

  const puddlesPick = async (roundId: string, cell: number) => {
    const { data, error } = await supabase.rpc('puddles_pick', { p_round: roundId, p_cell: cell })
    if (error || !data) { notify(`❌ ${error?.message || 'Ошибка хода'}`); return null }
    if (data.auto_cashed) {
      setS(prev => {
        const next = structuredClone(prev)
        next.log.unshift({ t: Date.now(), x: `Выигрыш в «Грязевые лужи» (x${data.mul})`, d: Number(data.win) })
        next.bal = Number(data.bal)
        return next
      })
    }
    return data
  }

  const puddlesCash = async (roundId: string) => {
    const { data, error } = await supabase.rpc('puddles_cash', { p_round: roundId })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось забрать'}`); return null }
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Выигрыш в «Грязевые лужи» (x${data.mul})`, d: Number(data.win) })
      next.bal = Number(data.bal)
      return next
    })
    return data
  }

  // Восстановление незакрытого раунда после перезагрузки страницы
  const puddlesRestore = async (): Promise<{ roundId: string; stake: number; mines: number; opened: number[] } | null> => {
    const { data } = await supabase
      .from('puddles_rounds')
      .select('*')
      .eq('status', 'play')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return { roundId: String(data.id), stake: Number(data.stake), mines: Number(data.mines_count), opened: (data.opened || []) as number[] }
  }

  // Пяточок-Плинко: бросок и выплата решаются на сервере, клиент только показывает полёт
  const plinkoBet = async (stake: number, risk: string): Promise<{ slot: number; mul: number; win: number } | null> => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return null }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return null }
    const { data, error } = await supabase.rpc('plinko_drop', { p_stake: stake, p_risk: risk })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось бросить'}`); return null }
    const jp = Number(data.jackpot || 0)
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: 'Ставка в «Пяточок-Плинко»', d: -stake })
      const win = Number(data.win)
      if (win > 0) next.log.unshift({ t: Date.now(), x: `Выигрыш в «Пяточок-Плинко» (x${data.mul})`, d: win })
      if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
      next.bal = Number(data.bal)
      return next
    })
    if (jp > 0) setJackpotWin(jp)
    return { slot: Number(data.slot), mul: Number(data.mul), win: Number(data.win) }
  }

  // Курс рубля: путь курса, исход и выплата решает сервер в момент ставки
  const rublePredict = async (side: 'up' | 'down', stake: number): Promise<RubleResult | null> => {
    if (!currentUser) { setAuthModalOpen(true); notify('Для игры необходимо войти через Twitch!'); return null }
    if (currentUser.isBlocked) { notify('Ваш аккаунт заблокирован администратором!'); return null }
    const { data, error } = await supabase.rpc('ruble_predict', { p_side: side, p_stake: stake })
    if (error || !data) { notify(`❌ ${error?.message || 'Не удалось сделать ставку'}`); return null }
    const jp = Number(data.jackpot || 0)
    setS(prev => {
      const next = structuredClone(prev)
      next.log.unshift({ t: Date.now(), x: `Ставка на «${side === 'up' ? 'вверх' : 'вниз'}» в «Курс рубля»`, d: -stake })
      const payout = Number(data.payout)
      if (payout > 0) next.log.unshift({ t: Date.now(), x: `Выигрыш в «Курс рубля» (x${data.mul})`, d: payout })
      if (jp > 0) next.log.unshift({ t: Date.now(), x: '🎰 ХРЯК-ПОТ! Ты сорвал весь горшок!', d: jp })
      next.bal = Number(data.bal)
      return next
    })
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
      <div className="wl-layout">
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
              {/* Game Mode Switcher */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button
                  className={`wl-round-btn ${gamesTab === 'crash' ? 'active' : ''}`}
                  onClick={() => setGamesTab('crash')}
                >
                  <Zap size={16} color="var(--org)" />
                  <span style={{ fontWeight: 800 }}>Хряк-Крэш 24/7 (Общий)</span>
                </button>
                <button
                  className={`wl-round-btn ${gamesTab === 'roulette' ? 'active' : ''}`}
                  onClick={() => setGamesTab('roulette')}
                >
                  <Sparkles size={16} />
                  <span>Корыто Фортуны</span>
                </button>
                <button
                  className={`wl-round-btn ${gamesTab === 'plinko' ? 'active' : ''}`}
                  onClick={() => setGamesTab('plinko')}
                >
                  <span>🐷 Пяточок-Плинко</span>
                </button>
                <button
                  className={`wl-round-btn ${gamesTab === 'puddles' ? 'active' : ''}`}
                  onClick={() => setGamesTab('puddles')}
                >
                  <span>🟤 Грязевые лужи</span>
                </button>
                <button
                  className={`wl-round-btn ${gamesTab === 'ruble' ? 'active' : ''}`}
                  onClick={() => setGamesTab('ruble')}
                >
                  <span>📉 Курс рубля</span>
                </button>
              </div>

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
                />
              )}

              {/* ROULETTE (КОРЫТО ФОРТУНЫ) */}
              {gamesTab === 'plinko' && <Plinko bal={S.bal} onBet={plinkoBet} />}
              {gamesTab === 'puddles' && <MudPuddles bal={S.bal} onStart={puddlesStart} onPick={puddlesPick} onCash={puddlesCash} onRestore={puddlesRestore} />}
              {gamesTab === 'ruble' && <RubleChart bal={S.bal} onPredict={rublePredict} />}

              {gamesTab === 'roulette' && (
                <RouletteWheel
                  spinning={spinning}
                  wheelRotation={wheelRotation}
                  wonSectorIdx={wonSectorIdx}
                  rouletteResult={rouletteResult}
                  spinRoulette={spinRoulette}
                />
              )}
            </div>
          )}

          {/* C. ESPORTS STREAM VIEW */}
          {view === 'esports' && (
            <EsportsView
              streamPlaying={streamPlaying}
              setStreamPlaying={setStreamPlaying}
              chatMessages={chatMessages}
              setChatMessages={setChatMessages}
              esportsChatInput={esportsChatInput}
              setEsportsChatInput={setEsportsChatInput}
              currentUser={currentUser}
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

      {/* 4. Floating BetSlip Drawer */}
      {slipOpen && (
        <div className="wl-betslip-drawer">
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

          {slipTab === 'coupon' ? (
            <div className="wl-slip-body">
              {!selectedBet ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--tx-muted)' }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Купон пуст</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Выберите исход в линии, чтобы добавить его в купон.
                  </div>
                </div>
              ) : (
                <form onSubmit={handlePlaceBet}>
                  {(() => {
                    const ev = allEvents.find(e => e.id === selectedBet.evId)
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

                  <div>
                    <label style={{ fontSize: 12, color: 'var(--tx-secondary)', fontWeight: 600 }}>
                      Сумма ставки, SV₽:
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
                    />
                  </div>

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

                  <div style={{ background: '#0e1117', padding: 10, borderRadius: 8, margin: '12px 0', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tx-secondary)' }}>
                      <span>Возможный выигрыш:</span>
                      <span style={{ fontFamily: 'var(--font-d)', fontWeight: 800, color: 'var(--org)', fontSize: 15 }}>
                        {isStakeValid ? fmt(potentialPayout) : '—'}
                      </span>
                    </div>
                  </div>

                  {err && (
                    <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                      {err}
                    </div>
                  )}

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
            <div className="wl-slip-body">
              {activeBetsCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--tx-muted)' }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>⏳</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Нет активных ставок</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {S.bets.filter((b: any) => b.state === 'open').map((b: any) => {
                    const ev = allEvents.find(e => e.id === b.ev)
                    return (
                      <div key={b.id} style={{ background: '#1c2230', padding: 12, borderRadius: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev?.league}</div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{ev?.title}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                          <span>{ev?.out[b.i]?.[0]} (x{b.odds.toFixed(2)})</span>
                          <span style={{ fontWeight: 700, color: 'var(--org)' }}>{fmt(b.stake)}</span>
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

      {/* 5. USER PROFILE MODAL */}
      {profileModalOpen && currentUser && (
        <div className="wl-modal-overlay" onClick={() => setProfileModalOpen(false)}>
          <div className="wl-modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="wl-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <User size={20} color="var(--org)" />
                <span style={{ fontWeight: 800, fontSize: 17 }}>Личный кабинет</span>
              </div>
              <button onClick={() => setProfileModalOpen(false)} style={{ color: 'var(--tx-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="wl-modal-body">
              {/* Profile Card */}
              <div style={{
                background: 'linear-gradient(135deg, #1a1f2c, #151a26)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 18,
                marginBottom: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <UserAvatar avatar={currentUser.avatar} name={currentUser.username} size={64} crown={isAdmin} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {currentUser.username}
                    </div>
                    <VipBadge userId={currentUser.id} />
                    <div style={{ fontSize: 12, color: isAdmin ? '#f59e0b' : 'var(--tx-secondary)', fontWeight: 700 }}>
                      {currentUser.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 4 }}>
                      В SWINLINE с {new Date(currentUser.createdAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {isAdmin && (
                    <span className="wl-admin-badge">
                      <ShieldCheck size={14} /> ADMIN
                    </span>
                  )}
                  <span style={{
                    background: '#1c2232',
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '4px 12px',
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--org)'
                  }}>
                    {currentUser.role === 'admin' ? 'Админ' : S.bal >= 50000 ? 'VIP' : 'Игрок'}
                  </span>
                </div>
              </div>

              {/* Balance / In-play / Attempts strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18, textAlign: 'center' }}>
                <div style={{ background: '#161a25', border: '1px solid rgba(255, 85, 0, 0.25)', padding: '12px 8px', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Баланс</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--org)' }}>{fmt(S.bal)}</div>
                </div>
                <div style={{ background: '#161a25', padding: '12px 8px', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>В игре</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>
                    {fmt(myStats ? myStats.bets.filter((b: any) => b.status === 'pending').reduce((a: number, b: any) => a + Number(b.stake || 0), 0) : 0)}
                  </div>
                </div>
                <div style={{ background: '#161a25', padding: '12px 8px', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Игровых попыток</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{myStats ? myStats.attempts : '—'}</div>
                </div>
              </div>

              {/* Bet stats (server) */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8 }}>
                  СТАТИСТИКА СТАВОК (из базы):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div style={{ background: '#161a25', padding: 10, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Ставок</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{myStats ? myStats.bets.length : '—'}</div>
                  </div>
                  <div style={{ background: '#161a25', padding: 10, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Винрейт</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>
                      {(() => {
                        const settled = myStats ? myStats.bets.filter((b: any) => b.status === 'won' || b.status === 'lost') : []
                        const won = settled.filter((b: any) => b.status === 'won').length
                        return settled.length ? `${Math.round((won / settled.length) * 100)}%` : '—'
                      })()}
                    </div>
                  </div>
                  <div style={{ background: '#161a25', padding: 10, borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Профит</div>
                    {(() => {
                      const settled = myStats ? myStats.bets.filter((b: any) => b.status === 'won' || b.status === 'lost') : []
                      const net = settled.reduce((a: number, b: any) => a + Number(b.payout || 0) - Number(b.stake || 0), 0)
                      return (
                        <div style={{ fontSize: 16, fontWeight: 800, color: settled.length ? (net >= 0 ? 'var(--green)' : '#ef4444') : '#fff' }}>
                          {settled.length ? `${net >= 0 ? '+' : ''}${fmt(net)}` : '—'}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Recent bets (server) */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8 }}>
                  ПОСЛЕДНИЕ СТАВКИ:
                </div>
                {!myStats ? (
                  <div style={{ background: '#161a25', borderRadius: 10, padding: '18px 0', textAlign: 'center', fontSize: 12, color: 'var(--tx-muted)' }}>
                    Загружаем из базы…
                  </div>
                ) : myStats.bets.length === 0 ? (
                  <div style={{ background: '#161a25', borderRadius: 10, padding: '18px 0', textAlign: 'center', fontSize: 12, color: 'var(--tx-muted)' }}>
                    Ставок пока нет. Загляни в линию или в игры 24/7!
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto' }}>
                    {myStats.bets.slice(0, 8).map((b: any) => {
                      const isWon = b.status === 'won'
                      const isLost = b.status === 'lost'
                      const isRefund = b.status === 'refund'
                      const color = isWon ? 'var(--green)' : isLost ? '#ef4444' : isRefund ? '#94a3b8' : '#f59e0b'
                      const label = isWon ? `+${fmt(Number(b.payout || 0))}` : isLost ? `−${fmt(Number(b.stake || 0))}` : isRefund ? 'возврат' : 'в игре'
                      return (
                        <div key={b.id} style={{ background: '#161a25', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {b.match_title || b.event_id}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>
                              {b.pick_name || b.pick} × {Number(b.odds).toFixed(2)} • {fmt(Number(b.stake))}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 800, color, flexShrink: 0 }}>{label}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Achievements */}
              {currentUser.achievements.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Award size={14} color="var(--org)" />
                    ДОСТИЖЕНИЯ:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {currentUser.achievements.map((ach, i) => (
                      <span
                        key={i}
                        style={{ background: '#1c2232', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}
                      >
                        🏆 {ach}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="wl-sidebar-quick-btn"
                style={{ border: '1px solid #ef444455', color: '#ef4444', width: '100%', justifyContent: 'center' }}
                onClick={handleLogout}
              >
                Выйти из профиля ↪
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button onClick={() => setAdminModalOpen(false)} style={{ color: 'var(--tx-muted)' }}>
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

      {/* ADMIN: INSPECTING USER'S BETS MODAL */}
      {inspectingUser && (
        <div className="wl-modal-overlay" onClick={() => setInspectingUser(null)}>
          <div className="wl-modal-card" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="wl-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserAvatar avatar={inspectingUser.avatar} name={inspectingUser.username} size={28} crown={inspectingUser.role === 'admin'} />
                <span style={{ fontWeight: 800, fontSize: 16 }}>
                  Купоны игрока {inspectingUser.username}
                </span>
              </div>
              <button onClick={() => setInspectingUser(null)} style={{ color: 'var(--tx-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="wl-modal-body">
              <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontSize: 13, background: '#181d28', padding: 10, borderRadius: 8 }}>
                <span>Баланс: <b style={{ color: 'var(--org)' }}>{fmt(inspectingUser.bal)}</b></span>
                <span>Статус: <b style={{ color: inspectingUser.isBlocked ? '#ef4444' : 'var(--green)' }}>{inspectingUser.isBlocked ? 'Заблокирован' : 'Активен'}</b></span>
              </div>

              {inspectingUser.bets && inspectingUser.bets.length > 0 ? (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <table className="wl-admin-table">
                    <thead>
                      <tr>
                        <th>Событие</th>
                        <th>Ставка</th>
                        <th>Коэф.</th>
                        <th>Итог</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectingUser.bets.map((b: any) => {
                        const ev = allEvents.find(e => e.id === b.ev || e.id === b.event_id)
                        const title = b.match_title || ev?.title || b.ev || 'Матч'
                        const pick = b.pick_name || b.pick || ''
                        const oddsVal = typeof b.odds === 'number' ? b.odds.toFixed(2) : String(b.odds || '-')
                        const isWon = b.status === 'won' || b.state === 'won'
                        const isLost = b.status === 'lost' || b.state === 'lost'
                        const isRefund = b.status === 'refund' || b.state === 'refund'
                        const statusLabel = isWon ? 'Выигрыш' : isLost ? 'Проигрыш' : isRefund ? 'Возврат' : 'В игре'
                        return (
                          <tr key={b.id}>
                            <td>
                              <div><b>{title}</b></div>
                              {pick && <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Выбор: {pick}</div>}
                            </td>
                            <td style={{ fontWeight: 700 }}>{fmt(Number(b.stake || 0))}</td>
                            <td>{oddsVal}</td>
                            <td>
                              <span style={{ color: isWon ? 'var(--green)' : isLost ? '#ef4444' : isRefund ? '#94a3b8' : '#f59e0b', fontWeight: 700 }}>
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx-muted)' }}>
                  У этого игрока пока нет совершённых ставок.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* 6.2 EDIT SCORE & LIVE STATUS MODAL */}
      {editEventModal && (
        <div className="wl-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setEditEventModal(null)}>
          <div className="wl-modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="wl-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit3 size={18} color="var(--org)" />
                <span style={{ fontWeight: 800 }}>Редактирование счёта матча</span>
              </div>
              <button onClick={() => setEditEventModal(null)} style={{ color: 'var(--tx-muted)' }}><X size={18} /></button>
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

      {/* 6.3 STANDALONE CREATE MATCH MODAL */}
      {createMatchModalOpen && (
        <div className="wl-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setCreateMatchModalOpen(false)}>
          <div className="wl-modal-card" style={{ maxWidth: 650 }} onClick={e => e.stopPropagation()}>
            <div className="wl-modal-header" style={{ background: '#241a0d', borderBottomColor: '#f59e0b44' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PlusCircle size={20} color="var(--org)" />
                <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--org)' }}>Создать новое событие в линию</span>
              </div>
              <button onClick={() => setCreateMatchModalOpen(false)} style={{ color: 'var(--tx-muted)' }}><X size={18} /></button>
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
