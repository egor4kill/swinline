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
  AlertTriangle
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
import { payout, r2, placeBet, settleEvent, cancelEvent } from './logic'
import { supabase, USERS_REGISTRY_URL, ADMIN_USERNAME } from './supabase'
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

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {}
  return fallback
}

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' SV₽'

const PigLogo = () => (
  <svg width="28" height="28" viewBox="0 0 100 100" role="img" aria-label="Свин-маскот SVINLINE">
    <use href="#pig" />
  </svg>
)

const getTwitchAvatar = (username?: string, currentAvatar?: string | null): string => {
  if (currentAvatar && (currentAvatar.startsWith('http://') || currentAvatar.startsWith('https://'))) {
    return currentAvatar
  }
  const u = (username || '').toLowerCase().trim()
  if (u === 'egor4kill') {
    return 'https://static-cdn.jtvnw.net/jtv_user_pictures/310827f8-113e-442f-9435-bf8637ec3b6a-profile_image-300x300.png'
  }
  if (u === 'lowrensy') {
    return 'https://static-cdn.jtvnw.net/jtv_user_pictures/6d72a4ce-1517-408b-8d79-2490b31fa178-profile_image-300x300.png'
  }
  if (currentAvatar && currentAvatar !== '👑' && currentAvatar !== '🐗' && currentAvatar !== '🟣') {
    return currentAvatar
  }
  return '🟣'
}

const UserAvatar = ({
  avatar,
  name,
  size = 28,
  className = ''
}: {
  avatar?: string | null
  name?: string
  size?: number
  crown?: boolean
  className?: string
}) => {
  const [hasError, setHasError] = useState(false)
  const resolved = getTwitchAvatar(name, avatar)
  const isImage = !hasError && Boolean(resolved && (resolved.startsWith('http://') || resolved.startsWith('https://') || resolved.startsWith('/') || resolved.startsWith('data:')))

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: '#1a1f2c',
        border: '1px solid rgba(255,255,255,0.18)',
        overflow: 'hidden'
      }}
    >
      {isImage ? (
        <img
          src={resolved}
          alt={name || 'Avatar'}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block'
          }}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.55, fontWeight: 700, userSelect: 'none', color: '#fff' }}>
          {resolved && resolved.length <= 2 && resolved !== '🟣' ? resolved : (name ? name[0].toUpperCase() : '👤')}
        </span>
      )}
    </div>
  )
}


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
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [regUser, setRegUser] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regAvatar, setRegAvatar] = useState('🐗')
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [adminTab, setAdminTab] = useState<'users' | 'create' | 'matches' | 'audit' | 'bank'>('users')
  const [inspectingUser, setInspectingUser] = useState<UserAccount | null>(null)

  // Find active user (or null if guest)
  const currentUser = useMemo(() => {
    if (!currentUserId) return null
    return accounts.find(a => a.id === currentUserId) || null
  }, [accounts, currentUserId])

  const isAdmin = currentUser?.role === 'admin'

  // 2. Custom Events added by Admin
  const [customEvents, setCustomEvents] = useState<Ev[]>(() => loadJSON(KEY_EVENTS, []))

  // Merge default events with admin custom events
  const allEvents = useMemo(() => {
    return [...customEvents, ...EVENTS]
  }, [customEvents])

  // 3. Navigation & Views
  const [view, setView] = useState('line') // line | live | esports | games24 | wallet | promos | results | about
  const [gamesTab, setGamesTab] = useState<'crash' | 'roulette'>('crash')
  const [selectedSport, setSelectedSport] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const [expandedMarkets, setExpandedMarkets] = useState<Record<string, boolean>>({})

  // 4. Betting & State
  const [S, setS] = useState<any>(() => loadJSON(KEY_STATE, freshState()))
  const [selectedBet, setSelectedBet] = useState<{ evId: string; outcomeIdx: number; outcomeTitle: string; odds: number } | null>(null)
  const [stake, setStake] = useState('500')
  const [slipOpen, setSlipOpen] = useState(false)
  const [slipTab, setSlipTab] = useState<'coupon' | 'ingame'>('coupon')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const busy = useRef(false)

  // 5. Esports stream simulation
  const [streamPlaying, setStreamPlaying] = useState(true)
  const [chatMessages, setChatMessages] = useState<string[]>([
    '🔥 SvinPro: ХРЯК С Deagle ПРОСТО МОНСТР!!',
    '🐷 BaconKing: Ставил 5000 SV₽ на FURIA, не подведите!',
    '🎮 CyberKaban: Эко-раунд от BetBoom, сейчас будет камбэк',
    '⭐ LuckyPig: Коэффициент 1.42 железобетон',
    '⚡ Porky_99: Где трансляция? А, вот пошла!'
  ])

  // 6. Games 24/7 Roulette State
  const [spinning, setSpinning] = useState(false)
  const [rouletteResult, setRouletteResult] = useState<string | null>(null)

  // 7. Games 24/7 Crash Game State
  const [crashStake, setCrashStake] = useState('200')
  const [crashState, setCrashState] = useState<'idle' | 'running' | 'crashed' | 'won'>('idle')
  const [crashMultiplier, setCrashMultiplier] = useState(1.00)
  const [crashHistory, setCrashHistory] = useState<number[]>([1.45, 2.80, 1.15, 6.20, 1.05, 3.42, 1.95])
  const crashTimerRef = useRef<any>(null)
  const crashTargetRef = useRef<number>(2.00)

  // 8. Admin Form State for New Match
  const [newMatchTitle, setNewMatchTitle] = useState('')
  const [newMatchLeague, setNewMatchLeague] = useState('Свин-Лига РПЛ | Турнир')
  const [newMatchCat, setNewMatchCat] = useState(0)
  const [newMatchTeam1, setNewMatchTeam1] = useState('')
  const [newMatchTeam2, setNewMatchTeam2] = useState('')
  const [newMatchOdds1, setNewMatchOdds1] = useState('1.90')
  const [newMatchOddsX, setNewMatchOddsX] = useState('3.20')
  const [newMatchOdds2, setNewMatchOdds2] = useState('2.40')
  const [newMatchIsLive, setNewMatchIsLive] = useState(false)

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

  // Sync account balance with S.bal
  useEffect(() => {
    setAccounts(prev => prev.map(a => a.id === currentUserId ? { ...a, bal: S.bal } : a))
  }, [S.bal, currentUserId])

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
      console.warn('Failed to fetch from profiles table, trying storage:', e)
    }

    // Fallback to public storage registry
    try {
      const res = await fetch(`${USERS_REGISTRY_URL}?v=${Date.now()}`)
      if (res.ok) {
        const remoteUsers = await res.json()
        if (Array.isArray(remoteUsers) && remoteUsers.length > 0) {
          setAccounts(prev => {
            const combined: UserAccount[] = remoteUsers.map(u => {
              const isOwner = (u.username || '').toLowerCase() === ADMIN_USERNAME.toLowerCase()
              const existing = prev.find(a => a.id === u.id || a.username.toLowerCase() === (u.username || '').toLowerCase())
              return {
                id: u.id,
                username: u.username,
                email: u.email,
                role: (isOwner ? 'admin' : 'user') as 'admin' | 'user',
                avatar: getTwitchAvatar(u.username, u.avatar),
                title: isOwner ? 'Владелец платформы (Admin)' : 'Игрок (Twitch)',
                bal: existing ? existing.bal : (u.bal ?? 10000),
                bets: existing ? existing.bets : (u.bets ?? []),
                log: existing ? existing.log : (u.log ?? [{ t: u.createdAt || Date.now(), x: 'Вход через Twitch', d: 10000 }]),
                createdAt: u.createdAt || Date.now(),
                isBlocked: existing ? existing.isBlocked : false,
                stats: existing ? existing.stats : (u.stats ?? { totalBets: 0, wonBets: 0, lostBets: 0, totalProfit: 0 }),
                achievements: isOwner ? ['Владелец Платформы', 'Создатель Линии'] : (u.achievements ?? ['Игрок Twitch'])
              }
            })

            prev.forEach(p => {
              if (!combined.some(c => c.username.toLowerCase() === p.username.toLowerCase())) {
                combined.push(p)
              }
            })

            return purgeEmptyAccounts(combined)
          })
        }
      }
    } catch (e) {
      console.warn('Failed to fetch remote users registry fallback:', e)
    }
  }, [])

  useEffect(() => {
    fetchSupabaseUsers()
  }, [fetchSupabaseUsers])

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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSupabaseUsers])

  useEffect(() => {
    if (adminModalOpen) {
      fetchSupabaseUsers()
    }
  }, [adminModalOpen, fetchSupabaseUsers])

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

  // Esports live chat interval
  useEffect(() => {
    if (view !== 'esports') return
    const fakeChats = [
      'Хряки давят на B-пленте!',
      'КТО ВЫИГРАЕТ 2-Ю КАРТУ???',
      'SVINLINE ДЕЛАЕТ РАЗНИЦУ',
      'Кабан 1 в 3 затащил!',
      'Коэффициент уже 1.85, успевайте',
      'Свинья на AWP лучший снайпер турнира'
    ]
    const interval = setInterval(() => {
      const randomMsg = fakeChats[Math.floor(Math.random() * fakeChats.length)]
      const user = ['PorkMaster', 'OinkBoy', 'BaconGod', 'HamsterPro', 'PiggyBoss'][Math.floor(Math.random() * 5)]
      setChatMessages(prev => [...prev.slice(-12), `${user}: ${randomMsg}`])
    }, 4200)
    return () => clearInterval(interval)
  }, [view])

  const notify = (m: string) => setMsg(m)

  const mutate = (fn: (s: any) => void, message?: string) => {
    const next = structuredClone(S)
    const oldBal = S.bal
    fn(next)
    setS(next)
    if (message) notify(message)

    if (currentUser && next.bal !== oldBal) {
      supabase.from('profiles').update({
        bal: next.bal,
        updated_at: new Date().toISOString()
      }).eq('id', currentUser.id).then(null, err => console.error('Failed to update bal in Supabase:', err))
    }
  }

  const addVirtualMoney = (amount: number = 5000) => {
    mutate(s => {
      s.bal = r2(s.bal + amount)
      s.log.unshift({ t: Date.now(), x: `Пополнение ${fmt(amount)}`, d: amount })
    }, `+${fmt(amount)} зачислено на баланс!`)
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
    const next = structuredClone(S)
    const res = placeBet(next, selectedBet.evId, selectedBet.outcomeIdx, v)

    if (res.err) {
      setErr(res.err)
      return
    }

    busy.current = true
    setTimeout(() => { busy.current = false }, 350)
    setS(next)

    // Sync real bet and balance into Supabase database
    const ev = allEvents.find(event => event.id === selectedBet.evId)
    const outcomeTitle = selectedBet.outcomeTitle || 'Исход'
    const oddsVal = selectedBet.odds || 1.85

    supabase.from('bets').insert({
      user_id: currentUser.id,
      username: currentUser.username,
      event_id: selectedBet.evId,
      match_title: ev?.title || selectedBet.evId,
      pick: outcomeTitle,
      pick_name: outcomeTitle,
      odds: oddsVal,
      stake: v,
      status: 'pending'
    }).then(() => {
      fetchSupabaseUsers()
    }, err => console.error('Failed to sync bet to Supabase:', err))

    supabase.from('profiles').update({
      bal: next.bal,
      updated_at: new Date().toISOString()
    }).eq('id', currentUser.id).then(null, err => console.error('Failed to update bal in Supabase:', err))

    setSelectedBet(null)
    setErr('')
    notify(`Ставка ${fmt(v)} принята и сохранена в базе! ✅`)
  }

  // Crash Game Logic
  const startCrashGame = () => {
    if (!currentUser) {
      setAuthModalOpen(true)
      notify('Для игры необходимо войти в аккаунт!')
      return
    }
    if (currentUser.isBlocked) {
      notify('Ваш аккаунт заблокирован администратором!')
      return
    }
    const v = parseFloat(crashStake)
    if (!isFinite(v) || v <= 0) {
      notify('Укажите корректную сумму ставки')
      return
    }
    if (v > S.bal) {
      notify('Недостаточно SV₽ на балансе')
      return
    }

    // Deduct stake
    mutate(s => {
      s.bal = r2(s.bal - v)
      s.log.unshift({ t: Date.now(), x: `Ставка в Хряк-Крэш 24/7`, d: -v })
    })

    // Determine crash point using fair random formula (1.05x to 15.00x)
    const r = Math.random()
    let crashAt = 1.00 + (1 / (1 - r * 0.94) - 1)
    if (crashAt > 20) crashAt = 20
    crashTargetRef.current = r2(Math.max(1.05, crashAt))

    setCrashMultiplier(1.00)
    setCrashState('running')

    let current = 1.00
    if (crashTimerRef.current) clearInterval(crashTimerRef.current)

    crashTimerRef.current = setInterval(() => {
      current = r2(current + 0.03 + (current * 0.025))
      if (current >= crashTargetRef.current) {
        clearInterval(crashTimerRef.current)
        setCrashMultiplier(crashTargetRef.current)
        setCrashState('crashed')
        setCrashHistory(prev => [crashTargetRef.current, ...prev.slice(0, 10)])
      } else {
        setCrashMultiplier(current)
      }
    }, 70)
  }

  const cashoutCrash = () => {
    if (crashState !== 'running') return
    if (crashTimerRef.current) clearInterval(crashTimerRef.current)

    const winAmount = r2(parseFloat(crashStake) * crashMultiplier)
    setCrashState('won')
    setCrashHistory(prev => [crashMultiplier, ...prev.slice(0, 10)])

    mutate(s => {
      s.bal = r2(s.bal + winAmount)
      s.log.unshift({ t: Date.now(), x: `Выигрыш в Хряк-Крэш (x${crashMultiplier.toFixed(2)})`, d: winAmount })
    }, `Забрано ${fmt(winAmount)} по коэффициенту ${crashMultiplier.toFixed(2)}x! 🎉`)
  }

  // Roulette Spin Logic
  const spinRoulette = () => {
    if (!currentUser) {
      setAuthModalOpen(true)
      notify('Для игры необходимо войти в аккаунт!')
      return
    }
    if (currentUser.isBlocked) {
      notify('Ваш аккаунт заблокирован администратором!')
      return
    }
    if (spinning) return
    if (S.bal < 100) {
      notify('Недостаточно SV₽! Нажмите «+ Начислить SV₽».')
      return
    }
    setSpinning(true)
    setRouletteResult(null)

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
    }, 1100)
  }

  // Admin: Create New Match
  const handleCreateMatch = (e: FormEvent) => {
    e.preventDefault()
    if (!newMatchTitle.trim()) {
      notify('Введите название матча')
      return
    }
    const o1 = parseFloat(newMatchOdds1) || 1.90
    const ox = parseFloat(newMatchOddsX) || 3.10
    const o2 = parseFloat(newMatchOdds2) || 2.40

    const newEv: Ev = {
      id: 'custom_' + Date.now(),
      cat: newMatchCat,
      league: newMatchLeague || 'Свин-Лига РПЛ | Турнир',
      title: newMatchTitle,
      team1: newMatchTeam1 || 'Команда 1',
      team2: newMatchTeam2 || 'Команда 2',
      score: '0 : 0',
      isLive: newMatchIsLive,
      liveTime: newMatchIsLive ? '1-й тайм 1\'' : 'Скоро',
      desc: 'Матч добавлен главным администратором линии SVINLINE.',
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
    setNewMatchTitle('')
    setNewMatchTeam1('')
    setNewMatchTeam2('')
    setAdminModalOpen(false)
    notify(`Матч «${newEv.title}» успешно опубликован в линию!`)
  }

  // Auth Handlers
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    const input = loginUser.trim()
    const pass = loginPass.trim()
    if (!input || !pass) {
      notify('Введите логин или email и пароль!')
      return
    }

    // 1. Try Supabase Email Login if input is email or matches stored account email
    const emailToTry = input.includes('@') ? input : accounts.find(a => a.username.toLowerCase() === input.toLowerCase())?.email || ''
    if (emailToTry) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailToTry,
          password: pass
        })
        if (!error && data.user) {
          syncSupabaseUser(data.user)
          setAuthModalOpen(false)
          setLoginUser('')
          setLoginPass('')
          return
        }
      } catch {}
    }

    // 2. Fallback to existing registered player accounts
    const target = accounts.find(a => (a.username.toLowerCase() === input.toLowerCase() || (a as any).email === input))
    if (!target) {
      notify('Пользователь не найден!')
      return
    }
    if (target.password && target.password !== pass) {
      notify('Неверный пароль!')
      return
    }
    if (target.isBlocked) {
      notify('Ваш аккаунт заблокирован администратором!')
      return
    }
    setCurrentUserId(target.id)
    setAuthModalOpen(false)
    setLoginUser('')
    setLoginPass('')
    notify(`Добро пожаловать, ${target.username}! 👋`)
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    const u = regUser.trim()
    const email = regEmail.trim()
    const pass = regPass.trim()
    if (!u || !pass) {
      notify('Введите никнейм и пароль!')
      return
    }
    if (pass.length < 4) {
      notify('Пароль должен содержать минимум 4 символа!')
      return
    }
    if (accounts.some(a => a.username.toLowerCase() === u.toLowerCase())) {
      notify('Пользователь с таким никнеймом уже существует!')
      return
    }

    // Real cloud registration via Supabase if email provided
    if (email) {
      if (!email.includes('@')) {
        notify('Введите корректный email адрес!')
        return
      }
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            data: { username: u, name: u, avatar: regAvatar }
          }
        })
        if (error) {
          notify(`Ошибка регистрации в Supabase: ${error.message}`)
          return
        }
        if (data.user) {
          syncSupabaseUser(data.user, u, regAvatar)
          setAuthModalOpen(false)
          setRegUser('')
          setRegEmail('')
          setRegPass('')
          notify(`Аккаунт ${u} успешно создан! Стартовый баланс: 10 000 SV₽! 🎉`)
          return
        }
      } catch (err: any) {
        notify(`Ошибка: ${err.message}`)
        return
      }
    }

    // Standard player account (strictly role: 'user', never admin)
    const newAccount: UserAccount = {
      id: 'u_' + Date.now(),
      username: u,
      email: email || undefined,
      password: pass,
      role: 'user', // NEVER admin. Admin is exclusively for GitHub owner.
      avatar: regAvatar,
      title: 'Игрок SVINLINE',
      bal: 10000,
      bets: [],
      log: [{ t: Date.now(), x: 'Регистрация и стартовый баланс', d: 10000 }],
      createdAt: Date.now(),
      isBlocked: false,
      stats: { totalBets: 0, wonBets: 0, lostBets: 0, totalProfit: 0 },
      achievements: ['Новый игрок']
    }
    setAccounts(prev => [...prev, newAccount])
    setCurrentUserId(newAccount.id)
    setAuthModalOpen(false)
    setRegUser('')
    setRegEmail('')
    setRegPass('')
    notify(`Аккаунт ${u} успешно зарегистрирован! Начислено 10 000 SV₽! 🎉`)
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch {}
    localStorage.removeItem('svinline_last_auth_provider')
    localStorage.removeItem(KEY_CURRENT_USER)
    setCurrentUserId(null)
    setProfileModalOpen(false)
    notify('Вы вышли из профиля. Режим гостя.')
  }

  // Admin Surveillance & Actions
  const handleAdminTopUp = (targetId: string, amount: number) => {
    let newBal = 0
    setAccounts(prev => prev.map(a => {
      if (a.id === targetId) {
        newBal = r2(a.bal + amount)
        const nextLog = [{ t: Date.now(), x: `Пополнение от Администратора (+${fmt(amount)})`, d: amount }, ...a.log]
        return { ...a, bal: newBal, log: nextLog }
      }
      return a
    }))
    if (currentUserId === targetId) {
      mutate(s => { s.bal = r2(s.bal + amount) })
    }
    supabase.from('profiles').update({ bal: newBal, updated_at: new Date().toISOString() }).eq('id', targetId).then(null, err => console.error(err))
    notify(`Пользователю начислено +${fmt(amount)}`)
  }

  const handleAdminReset = (targetId: string) => {
    setAccounts(prev => prev.map(a => {
      if (a.id === targetId) {
        return { ...a, bal: 0, log: [{ t: Date.now(), x: 'Сброс баланса Администратором', d: -a.bal }, ...a.log] }
      }
      return a
    }))
    if (currentUserId === targetId) {
      mutate(s => { s.bal = 0 })
    }
    supabase.from('profiles').update({ bal: 0, updated_at: new Date().toISOString() }).eq('id', targetId).then(null, err => console.error(err))
    notify(`Баланс пользователя обнулён`)
  }

  const handleAdminToggleBlock = (targetId: string) => {
    let nextBlocked = false
    setAccounts(prev => prev.map(a => {
      if (a.id === targetId) {
        nextBlocked = !a.isBlocked
        notify(`Пользователь ${a.username} ${nextBlocked ? 'заблокирован ⛔' : 'разблокирован ✅'}`)
        return { ...a, isBlocked: nextBlocked }
      }
      return a
    }))
    supabase.from('profiles').update({ is_blocked: nextBlocked, updated_at: new Date().toISOString() }).eq('id', targetId).then(null, err => console.error(err))
  }

  const handleAdminDeleteUser = (targetId: string) => {
    const target = accounts.find(a => a.id === targetId)
    if (target?.role === 'admin') {
      notify('Нельзя удалить аккаунт администратора!')
      return
    }
    if (confirm(`Удалить игрока «${target?.username || targetId}»?`)) {
      setAccounts(prev => prev.filter(a => a.id !== targetId))
      if (currentUserId === targetId) {
        setCurrentUserId(null)
      }
      supabase.from('profiles').delete().eq('id', targetId).then(null, err => console.error(err))
      notify(`Игрок ${target?.username} удален!`)
    }
  }

  const handleAdminPurgeEmpty = async () => {
    await fetchSupabaseUsers()
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
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

          {/* Right Header: User Account, Admin Badge, Balance & Actions */}
          <div className="wl-header-right">
            {currentUser ? (
              <>
                {/* Admin Badge if admin */}
                {isAdmin && (
                  <button
                    className="wl-admin-badge"
                    onClick={() => { setAdminTab('users'); setAdminModalOpen(true) }}
                    title="Открыть панель администратора"
                  >
                    <ShieldCheck size={14} />
                    <span>АДМИН-ЦЕНТР</span>
                  </button>
                )}

                {/* User Profile Chip */}
                <div
                  className="wl-user-chip"
                  onClick={() => setProfileModalOpen(true)}
                  title="Личный кабинет"
                >
                  <UserAvatar avatar={currentUser.avatar} name={currentUser.username} size={30} crown={isAdmin} />
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{currentUser.username}</span>
                    <span style={{ fontSize: 10, color: isAdmin ? '#f59e0b' : 'var(--tx-muted)' }}>
                      {currentUser.title}
                    </span>
                  </div>
                </div>

                {/* Balance chip */}
                <div className="wl-balance-chip" title="Текущий баланс">
                  <span className="wl-balance-amount">{fmt(S.bal)}</span>
                </div>

                <button
                  className="wl-btn-orange"
                  onClick={() => addVirtualMoney(5000)}
                  title="Начислить бесплатные SV₽"
                >
                  + Начислить
                </button>

                <button
                  className="wl-sidebar-quick-btn"
                  style={{ border: '1px solid var(--border)', padding: '6px 10px', fontSize: 12 }}
                  onClick={handleLogout}
                  title="Выйти из аккаунта"
                >
                  Выйти ↪
                </button>
              </>
            ) : (
              <button
                className="wl-btn-orange"
                style={{
                  background: 'linear-gradient(135deg, #9146ff, #772ce8)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 700,
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontSize: 14,
                  boxShadow: '0 2px 12px rgba(145, 70, 255, 0.4)'
                }}
                onClick={() => handleOAuthLogin('twitch')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                </svg>
                <span>Войти через Twitch</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main 3-Column Layout */}
      <div className="wl-layout">
        {/* Left Sidebar */}
        <aside className="wl-sidebar">
          <div className="wl-search-box">
            <Search className="wl-search-icon" size={16} />
            <input
              type="text"
              className="wl-search-input"
              placeholder="Поиск событий..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value)
                if (view !== 'line' && view !== 'live' && e.target.value) {
                  setView('line')
                }
              }}
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

          <div className="wl-sidebar-quick">
            <button
              className={`wl-sidebar-quick-btn ${favoritesOnly ? 'active' : ''}`}
              onClick={() => {
                setFavoritesOnly(prev => !prev)
                if (view !== 'line' && view !== 'live') setView('line')
              }}
            >
              <Star size={16} color={favoritesOnly ? 'var(--org)' : '#94a3b8'} />
              <span>Избранное</span>
              {Object.values(favorites).filter(Boolean).length > 0 && (
                <span className="wl-badge-count">{Object.values(favorites).filter(Boolean).length}</span>
              )}
            </button>

            <button
              className={`wl-sidebar-quick-btn ${selectedSport === null && !favoritesOnly ? 'active' : ''}`}
              onClick={() => {
                setSelectedSport(null)
                setFavoritesOnly(false)
                if (view !== 'line' && view !== 'live') setView('line')
              }}
            >
              <Clock size={16} />
              <span>Все события</span>
            </button>

            {isAdmin && (
              <button
                className="wl-sidebar-quick-btn"
                style={{ color: '#f59e0b', background: '#f59e0b11', borderColor: '#f59e0b33' }}
                onClick={() => setAdminModalOpen(true)}
              >
                <PlusCircle size={16} />
                <span>+ Добавить матч</span>
              </button>
            )}
          </div>

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

        {/* Center Main Content */}
        <main className="wl-center">
          {/* A. LINE / LIVE VIEW */}
          {(view === 'line' || view === 'live') && (
            <>
              {/* Banners */}
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

              {/* Tournament Pills */}
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

              {/* Round Filters */}
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
              </div>

              {/* Matches grouped by League */}
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

                      return (
                        <div key={ev.id} style={{ borderBottom: '1px solid #1a202c' }}>
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
                                <button
                                  className="wl-match-extra-link"
                                  onClick={() => toggleMarket(ev.id)}
                                >
                                  {isExpanded ? 'Скрыть роспись ▲' : '+14 вариантов ➔'}
                                </button>
                              </div>
                            </div>

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
                                  >
                                    <span className="wl-odd-val">{outcome[1].toFixed(2)}</span>
                                    <span className="wl-odd-lbl">{outcome[0].split(' ')[0]}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="wl-extra-markets">
                              <div className="wl-demo-controls">
                                <span style={{ color: 'var(--tx-muted)', fontWeight: 600 }}>Быстрый демо-расчёт:</span>
                                {eventStatus === 'open' && (
                                  <button
                                    className="wl-demo-btn"
                                    onClick={() => mutate(s => { s.st[ev.id] = { s: 'closed' } }, `Приём ставок закрыт`)}
                                  >
                                    Закрыть приём
                                  </button>
                                )}
                                {ev.out.slice(0, 3).map((outcome, oIdx) => (
                                  <button
                                    key={oIdx}
                                    className="wl-demo-btn"
                                    style={{ borderColor: 'var(--green)' }}
                                    onClick={() => mutate(s => settleEvent(s, ev.id, oIdx), `Матч рассчитан: победа ${outcome[0]}!`)}
                                  >
                                    Выиграл: {outcome[0]}
                                  </button>
                                ))}
                                <button
                                  className="wl-demo-btn"
                                  style={{ color: '#ef4444' }}
                                  onClick={() => mutate(s => cancelEvent(s, ev.id), `Событие отменено, ставки возвращены`)}
                                >
                                  Отменить матч
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

          {/* B. GAMES 24/7 (CRASH & ROULETTE) */}
          {view === 'games24' && (
            <div style={{ maxWidth: 880, margin: '0 auto' }}>
              {/* Game Mode Switcher */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button
                  className={`wl-round-btn ${gamesTab === 'crash' ? 'active' : ''}`}
                  onClick={() => setGamesTab('crash')}
                >
                  <Zap size={16} color="var(--org)" />
                  <span style={{ fontWeight: 800 }}>Хряк-Крэш 24/7</span>
                </button>
                <button
                  className={`wl-round-btn ${gamesTab === 'roulette' ? 'active' : ''}`}
                  onClick={() => setGamesTab('roulette')}
                >
                  <Sparkles size={16} />
                  <span>Корыто Фортуны</span>
                </button>
              </div>

              {/* CRASH GAME ARENA */}
              {gamesTab === 'crash' && (
                <div className="wl-crash-arena">
                  {/* History of crash points */}
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 700, marginBottom: 6 }}>
                      ПОСЛЕДНИЕ РАУНДЫ:
                    </div>
                    <div className="wl-crash-history-pills">
                      {crashHistory.map((h, i) => (
                        <span
                          key={i}
                          className="wl-crash-history-pill"
                          style={{
                            color: h >= 2.0 ? 'var(--green)' : h < 1.2 ? '#ef4444' : 'var(--org)',
                            borderColor: h >= 2.0 ? 'var(--green-glow)' : undefined
                          }}
                        >
                          {h.toFixed(2)}x
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Multiplier Central Display */}
                  <div className="wl-crash-display">
                    <div
                      className="wl-crash-multiplier"
                      style={{
                        color: crashState === 'crashed' ? '#ef4444' : crashState === 'won' ? 'var(--green)' : 'var(--tx-primary)'
                      }}
                    >
                      {crashMultiplier.toFixed(2)}x
                    </div>

                    <div className="wl-crash-status">
                      {crashState === 'idle' && <span style={{ color: 'var(--tx-muted)' }}>Сделайте ставку и начните раунд</span>}
                      {crashState === 'running' && <span style={{ color: 'var(--org)' }}>🚀 ХРЯК В ПОЛЁТЕ! УСПЕЙТЕ ЗАБРАТЬ!</span>}
                      {crashState === 'crashed' && <span style={{ color: '#ef4444' }}>💥 КРЭШ! СВИН УПАЛ В ЛУЖУ</span>}
                      {crashState === 'won' && <span style={{ color: 'var(--green)' }}>🎉 ВЫИГРЫШ ЗАБРАН!</span>}
                    </div>

                    {/* Animated Pig Icon */}
                    <div
                      className="wl-crash-pig"
                      style={{
                        bottom: crashState === 'running' ? Math.min(160, 20 + crashMultiplier * 20) : 20,
                        right: crashState === 'running' ? Math.min(260, 40 + crashMultiplier * 28) : 40,
                        transform: crashState === 'crashed' ? 'rotate(90deg) scale(0.8)' : 'none'
                      }}
                    >
                      {crashState === 'crashed' ? '💥' : crashState === 'won' ? '💰' : '🐷🚀'}
                    </div>
                  </div>

                  {/* Crash Control Bar */}
                  <div style={{ background: '#161a24', padding: 16, borderRadius: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 700 }}>СТАВКА SV₽:</label>
                      <input
                        type="text"
                        className="wl-stake-input"
                        value={crashStake}
                        disabled={crashState === 'running'}
                        onChange={e => setCrashStake(e.target.value.replace(',', '.'))}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {['100', '200', '500', '1000'].map(val => (
                        <button
                          key={val}
                          className="wl-quick-btn"
                          style={{ padding: '8px 14px' }}
                          disabled={crashState === 'running'}
                          onClick={() => setCrashStake(val)}
                        >
                          +{val}
                        </button>
                      ))}
                    </div>

                    <div style={{ width: '100%', maxWidth: 280 }}>
                      {crashState !== 'running' ? (
                        <button
                          className="wl-btn-orange"
                          style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 10 }}
                          onClick={startCrashGame}
                        >
                          СТАРТ РАУНДА 🚀
                        </button>
                      ) : (
                        <button
                          className="wl-btn-green"
                          style={{ width: '100%', height: 48, fontSize: 16, borderRadius: 10 }}
                          onClick={cashoutCrash}
                        >
                          ЗАБРАТЬ {fmt(r2(parseFloat(crashStake) * crashMultiplier))}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ROULETTE */}
              {gamesTab === 'roulette' && (
                <div className="wl-banner-card highlight" style={{ padding: 32, textAlign: 'center' }}>
                  <span className="wl-banner-tag">ИГРЫ 24/7 • БЫСТРЫЕ ИСХОДЫ</span>
                  <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 26, margin: '14px 0 6px' }}>
                    КОРЫТО ФОРТУНЫ 🐷
                  </h2>
                  <p style={{ color: 'var(--tx-secondary)', fontSize: 14, marginBottom: 24 }}>
                    Испытайте удачу! Ставка от 100 SV₽. Крутите корыто и получайте моментальные множители от x0 до x10!
                  </p>

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
              )}
            </div>
          )}

          {/* C. ESPORTS STREAM VIEW */}
          {view === 'esports' && (
            <div>
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

              <div className="wl-esports-arena">
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

                <div className="wl-esports-stats-panel">
                  <div style={{ fontWeight: 800, fontSize: 15, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    Командная статистика
                  </div>

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
            </div>
          )}

          {/* D. WALLET / PROFILE VIEW */}
          {view === 'wallet' && (
            <div style={{ maxWidth: 860, margin: '0 auto' }}>
              <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
                Мой счёт и баланс
              </h2>

              <div className="wl-banner-card" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>Доступный виртуальный баланс:</div>
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
                      if (confirm('Сбросить весь баланс и историю ставок?')) {
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

              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '24px 0 12px' }}>История ставок</h3>
              <div className="wl-table-container">
                {S.bets.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx-muted)' }}>
                    Ставок пока нет. Загляните в линию и выберите исход!
                  </div>
                ) : (
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
                        const ev = allEvents.find(e => e.id === b.ev)
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
                )}
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
                      onClick={() => notify(`Условия акции «${p[0]}» выполнены!`)}
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
                {allEvents.map(ev => {
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

              {/* CEO Showcase Card */}
              <div
                className="wl-banner-card highlight"
                style={{
                  display: 'flex',
                  gap: 22,
                  alignItems: 'center',
                  marginBottom: 20,
                  padding: '20px 24px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #151a26, #1c2333)',
                  border: '1px solid rgba(255, 85, 0, 0.35)',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)'
                }}
              >
                <img
                  src={ceoPhoto}
                  alt="Генеральный директор SVINLINE"
                  style={{
                    width: 120,
                    height: 150,
                    objectFit: 'cover',
                    borderRadius: 12,
                    border: '2px solid var(--org)',
                    boxShadow: '0 4px 20px var(--org-glow)',
                    flexShrink: 0
                  }}
                />
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255, 85, 0, 0.15)', color: 'var(--org)', border: '1px solid rgba(255, 85, 0, 0.3)', padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
                    <ShieldCheck size={14} /> Руководство компании
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6, fontFamily: 'var(--font-d)' }}>
                    Генеральный директор SVINLINE
                  </h3>
                  <div style={{ fontSize: 14, color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
                    Основатель и генеральный директор букмекерской платформы SVINLINE. Лично курирует честность выплат, надёжность алгоритмов линии, организацию турниров и стратегическое развитие платформы нового поколения.
                  </div>
                </div>
              </div>

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
          onClick={() => notify('💬 Поддержка: «Свинья сейчас обедает, вернётся через 5 минут!»')}
          title="Онлайн-поддержка"
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
      {profileModalOpen && (
        <div className="wl-modal-overlay" onClick={() => setProfileModalOpen(false)}>
          <div className="wl-modal-card" onClick={e => e.stopPropagation()}>
            <div className="wl-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <User size={20} color="var(--org)" />
                <span style={{ fontWeight: 800, fontSize: 17 }}>Личный кабинет игрока</span>
              </div>
              <button onClick={() => setProfileModalOpen(false)} style={{ color: 'var(--tx-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="wl-modal-body">
              {/* Profile Card */}
              <div style={{ background: '#1a1f2c', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <UserAvatar avatar={currentUser.avatar} name={currentUser.username} size={60} crown={isAdmin} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{currentUser.username}</div>
                    <div style={{ fontSize: 12, color: isAdmin ? '#f59e0b' : 'var(--tx-secondary)', fontWeight: 700 }}>
                      {currentUser.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--org)', fontWeight: 700, marginTop: 4 }}>
                      Баланс: {fmt(S.bal)}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <span className="wl-admin-badge">
                    <ShieldCheck size={14} /> ADMIN
                  </span>
                )}
              </div>

              {/* Avatar Picker & Logout */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8 }}>
                  СМЕНИТЬ АВАТАР:
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 22, marginBottom: 16 }}>
                  {['🐗', '🐷', '🐽', '👑', '🍔', '🚀', '⚡', '🕶️'].map(av => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => {
                        setAccounts(prev => prev.map(a => a.id === currentUserId ? { ...a, avatar: av } : a))
                        notify('Аватар обновлён!')
                      }}
                      style={{
                        padding: 6,
                        borderRadius: 8,
                        background: currentUser.avatar === av ? 'var(--org)' : '#1a1f2c',
                        border: '1px solid var(--border)'
                      }}
                    >
                      {av}
                    </button>
                  ))}
                </div>

                <button
                  className="wl-sidebar-quick-btn"
                  style={{ border: '1px solid #ef444455', color: '#ef4444', width: '100%', justifyContent: 'center' }}
                  onClick={handleLogout}
                >
                  Выйти из профиля ↪
                </button>
              </div>

              {/* Achievements */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Award size={14} color="var(--org)" />
                  ДОСТИЖЕНИЯ И АЧИВКИ:
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

              {/* Stats */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-secondary)', marginBottom: 8 }}>
                  СТАТИСТИКА ИГРОКА:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div style={{ background: '#161a25', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Ставок</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{currentUser.stats.totalBets + S.bets.length}</div>
                  </div>
                  <div style={{ background: '#161a25', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Винрейт</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>67%</div>
                  </div>
                  <div style={{ background: '#161a25', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Любимый спорт</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Свин-Лига</div>
                  </div>
                  <div style={{ background: '#161a25', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Статус</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--org)' }}>VIP</div>
                  </div>
                </div>
              </div>
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
                  ПАНЕЛЬ АДМИНИСТРАТОРА ЛИНИИ SVINLINE
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
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                    <div className="wl-form-group">
                      <label className="wl-form-label">Название матча / вывеска:</label>
                      <input
                        type="text"
                        className="wl-form-input"
                        placeholder="Например: Спартак Хряк vs Динамо Кабан"
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

                  <div className="wl-form-group">
                    <label className="wl-form-label">Турнир / Лига:</label>
                    <input
                      type="text"
                      className="wl-form-input"
                      placeholder="Лига"
                      value={newMatchLeague}
                      onChange={e => setNewMatchLeague(e.target.value)}
                    />
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
                      Опубликовать как активный <b>Live-матч</b> (с красным индикатором)
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="wl-btn-orange"
                    style={{ width: '100%', height: 46, fontSize: 15, borderRadius: 10, marginTop: 10 }}
                  >
                    + Опубликовать событие в линию SVINLINE
                  </button>
                </form>
              )}

              {/* TAB 2: LIVE MATCH CONTROLLER */}
              {adminTab === 'matches' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 420, overflowY: 'auto' }}>
                  {allEvents.map(ev => {
                    const st = S.st[ev.id]?.s || 'open'
                    return (
                      <div key={ev.id} style={{ background: '#171b26', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev.league}</span>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</div>
                          </div>
                          <span className={`st ${st === 'open' ? 'o' : st === 'closed' ? 'c' : st === 'done' ? 'f' : 'x'}`}>
                            {st === 'open' ? 'Открыто' : st === 'closed' ? 'Закрыто' : st === 'done' ? 'Завершено' : 'Отменено'}
                          </span>
                        </div>

                        {/* Admin Action Buttons */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          {st === 'open' && (
                            <button
                              className="wl-demo-btn"
                              onClick={() => mutate(s => { s.st[ev.id] = { s: 'closed' } }, `Приём ставок на «${ev.title}» закрыт`)}
                            >
                              Закрыть приём
                            </button>
                          )}

                          {/* Settle winners */}
                          {ev.out.slice(0, 3).map((out, idx) => (
                            <button
                              key={idx}
                              className="wl-demo-btn"
                              style={{ borderColor: 'var(--green-glow)' }}
                              onClick={() => mutate(s => settleEvent(s, ev.id, idx), `Матч завершен! Победил: ${out[0]}. Ставки рассчитаны!`)}
                            >
                              Победил {out[0]}
                            </button>
                          ))}

                          <button
                            className="wl-demo-btn"
                            style={{ color: '#ef4444' }}
                            onClick={() => mutate(s => cancelEvent(s, ev.id), `Матч отменён, произведён возврат ставок`)}
                          >
                            Отменить матч
                          </button>
                        </div>
                      </div>
                    )
                  })}
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
                        setS(freshState())
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
                Вход в SVINLINE
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

            {/* Fallback accordion for login */}
            <details style={{ marginTop: 14, textAlign: 'left', fontSize: 12, color: 'var(--tx-muted)' }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none', padding: '6px 0', color: 'var(--tx-muted)' }}>
                Резервный вход (по логину / email)
              </summary>
              <form onSubmit={handleLogin} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text"
                  className="wl-form-input"
                  style={{ height: 38, fontSize: 13 }}
                  value={loginUser}
                  placeholder="Логин или email"
                  onChange={e => setLoginUser(e.target.value)}
                  required
                />
                <input
                  type="password"
                  className="wl-form-input"
                  style={{ height: 38, fontSize: 13 }}
                  value={loginPass}
                  placeholder="Пароль"
                  onChange={e => setLoginPass(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="wl-btn-orange"
                  style={{ height: 36, fontSize: 13, borderRadius: 6 }}
                >
                  Войти
                </button>
              </form>
            </details>
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
                        const statusLabel = isWon ? 'Выигрыш' : isLost ? 'Проигрыш' : 'В игре'
                        return (
                          <tr key={b.id}>
                            <td>
                              <div><b>{title}</b></div>
                              {pick && <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Выбор: {pick}</div>}
                            </td>
                            <td style={{ fontWeight: 700 }}>{fmt(Number(b.stake || 0))}</td>
                            <td>{oddsVal}</td>
                            <td>
                              <span style={{ color: isWon ? 'var(--green)' : isLost ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
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
          © 2026 SVINLINE (СВИНЛАЙН). Все права защищены. Играйте ответственно. Внутренняя расчетная единица: SV₽. 18+
        </div>
      </footer>
    </div>
  )
}
