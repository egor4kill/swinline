import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pickaxe,
  Gem,
  Coins,
  Link2,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Loader2,
  Unlink,
  Skull,
  TrendingUp
} from 'lucide-react'
import { supabase } from './supabase'
import { useDocumentVisible } from './useDocumentVisible'
import type { UserAccount } from './data'

const FALLBACK_MIN_WITHDRAW = 1
const FALLBACK_MAX_DEPTH = 30
const FALLBACK_BUST = 0.18

type PendingWithdrawal = {
  id: string
  amount: number
  created_at: string
}

type Currency = 'sv' | 'ar'

type DigRound = {
  id: string
  stake: number
  depth: number
  mult: number
  status: string
  payout: number
  currency: Currency
}

type MineStatus = {
  authed: boolean
  linked: boolean
  mcName: string | null
  ore: number
  svBal: number
  svEnabled: boolean
  deposited: number
  withdrawn: number
  minWithdraw: number
  bustChance: number
  maxDepth: number
  pending: PendingWithdrawal[]
  round: DigRound | null
}

type Result =
  | { kind: 'bust'; depth: number; mult: number }
  | { kind: 'cash'; payout: number; depth: number; mult: number; currency: Currency }
  | null

type MineMode = 'game' | 'link'

type Props = {
  currentUser: UserAccount | null
  notify: (message: string) => void
  onNeedAuth: () => void
  mode?: MineMode
  onOpenLink?: () => void
  onPlay?: () => void
  playCurrency?: Currency
  setPlayCurrency?: (c: Currency) => void
  svBalance?: number
  onBal?: (currency: Currency, bal: number) => void
}

const arFmt = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

function normalizeStatus(raw: any): MineStatus {
  const round = raw?.round
  return {
    authed: Boolean(raw?.authed),
    linked: Boolean(raw?.linked),
    mcName: raw?.mc_name || null,
    ore: Number(raw?.ore ?? 0),
    svBal: Number(raw?.sv_bal ?? 0),
    svEnabled: Boolean(raw?.sv_enabled),
    deposited: Number(raw?.deposited ?? 0),
    withdrawn: Number(raw?.withdrawn ?? 0),
    minWithdraw: Number(raw?.min_withdraw ?? FALLBACK_MIN_WITHDRAW),
    bustChance: Number(raw?.bust_chance ?? FALLBACK_BUST),
    maxDepth: Number(raw?.max_depth ?? FALLBACK_MAX_DEPTH),
    pending: Array.isArray(raw?.pending) ? raw.pending.map((p: any) => ({
      id: String(p.id),
      amount: Number(p.amount),
      created_at: String(p.created_at)
    })) : [],
    round: round ? {
      id: String(round.id),
      stake: Number(round.stake),
      depth: Number(round.depth),
      mult: Number(round.mult),
      status: String(round.status),
      payout: Number(round.payout ?? 0),
      currency: round.currency === 'sv' ? 'sv' : 'ar'
    } : null
  }
}

function OnlyForAuth({ onNeedAuth, mode }: { onNeedAuth: () => void; mode: MineMode }) {
  return (
    <div className="mc-view mc-view-narrow">
      <section className="mc-card mc-gate">
        <div className="mc-gate-icon"><Pickaxe size={30} /></div>
        <h1>{mode === 'game' ? 'Шахта ждёт' : 'Minecraft'}</h1>
        <p>
          {mode === 'game'
            ? 'Войди через Twitch, чтобы играть в Шахту на SV₽ или АР.'
            : 'Войди через Twitch, чтобы привязать Minecraft-аккаунт, заносить руду и выводить АР.'}
        </p>
        <button className="wl-btn-orange mc-gate-btn" onClick={onNeedAuth}>
          Войти через Twitch
        </button>
      </section>
    </div>
  )
}

function NotReady({ mode }: { mode: MineMode }) {
  return (
    <div className="mc-view mc-view-narrow">
      <section className="mc-card mc-gate">
        <div className="mc-gate-icon"><AlertTriangle size={28} /></div>
        <h1>{mode === 'game' ? 'Шахта скоро откроется' : 'Привязка скоро откроется'}</h1>
        <p>
          {mode === 'game'
            ? 'Мы уже прокладываем ствол. Скоро здесь появится спуск в алмазную жилу и игра на SV₽ или АР.'
            : 'Как только серверная часть будет подключена, здесь появится привязка Minecraft-аккаунта и вывод АР.'}
        </p>
      </section>
    </div>
  )
}

export default function MineView({
  currentUser,
  notify,
  onNeedAuth,
  mode = 'game',
  onOpenLink,
  onPlay,
  playCurrency = 'ar',
  setPlayCurrency,
  svBalance = 0,
  onBal
}: Props) {
  const isGame = mode === 'game'
  const pageVisible = useDocumentVisible()
  const [status, setStatus] = useState<MineStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [notReady, setNotReady] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<Result>(null)

  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  const [stake, setStake] = useState('1')
  const [withdrawAmount, setWithdrawAmount] = useState('1')

  const userId = currentUser?.id || null
  const notifyRef = useRef(notify)
  const authRef = useRef(onNeedAuth)

  useEffect(() => {
    notifyRef.current = notify
    authRef.current = onNeedAuth
  }, [notify, onNeedAuth])

  const load = useCallback(async (quiet = false) => {
    if (!userId) return
    if (!quiet) setLoading(true)
    const { data, error } = await supabase.rpc('mc_status')
    if (!quiet) setLoading(false)

    if (error) {
      const anyError = error as any
      if (anyError?.code === 'PGRST202' || /could not find the function|does not exist|schema cache/i.test(error.message)) {
        setNotReady(true)
        return
      }
      if (/permission denied|войти|JWT|session/i.test(error.message)) {
        setStatus(null)
        setNotReady(false)
        setAuthRequired(true)
        authRef.current()
        return
      }
      notifyRef.current(`❌ ${error.message}`)
      return
    }

    setNotReady(false)
    setAuthRequired(false)
    setStatus(normalizeStatus(data))
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setStatus(null)
      return
    }
    load(false)
  }, [userId, load])

  useEffect(() => {
    if (!pageVisible) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [pageVisible])

  // Пока код живой — проверяем, не привязался ли игрок в игре.
  useEffect(() => {
    if (!code || !userId || !pageVisible) return
    const timer = setInterval(() => load(true), 3000)
    return () => clearInterval(timer)
  }, [code, userId, load, pageVisible])

  useEffect(() => {
    if (status?.linked && code) setCode(null)
  }, [status?.linked, code])

  // После перезагрузки активный спуск мог быть в другой валюте — синхронизируем переключатель
  useEffect(() => {
    const cur = status?.round?.currency
    if (cur && cur !== playCurrency) setPlayCurrency?.(cur)
  }, [status?.round?.currency, playCurrency, setPlayCurrency])

  const secondsLeft = code ? Math.max(0, Math.floor((code.expiresAt - now) / 1000)) : 0

  const fail = (error: { message?: string } | null, fallback: string) => {
    const text = error?.message || fallback
    setMessage(text)
    if (/войти|permission denied|JWT|session/i.test(text)) onNeedAuth()
    else notify(`❌ ${text}`)
  }

  const createCode = async () => {
    if (busy) return
    setBusy('code')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_create_link_code')
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось получить код')
    setCode({
      code: String(data.code),
      expiresAt: new Date(data.expires_at).getTime()
    })
  }

  const unlink = async () => {
    if (busy) return
    setBusy('unlink')
    const { error } = await supabase.rpc('mc_unlink')
    setBusy(null)
    if (error) return fail(error, 'Не удалось отвязать аккаунт')
    setConfirmUnlink(false)
    setCode(null)
    notify('Minecraft-аккаунт отвязан')
    load(true)
  }

  const effectiveCurrency: Currency = status?.svEnabled ? playCurrency : 'ar'

  const startDig = async () => {
    if (busy || !status) return
    const cur = effectiveCurrency
    const minBet = cur === 'ar' ? 1 : 10
    const unit = cur === 'ar' ? 'АР' : 'SV₽'
    const curBalance = cur === 'ar' ? status.ore : (status.svBal ?? svBalance)
    const amount = Math.floor(Number(stake))
    if (!Number.isFinite(amount) || amount < minBet) {
      setMessage(`Ставка — целое число ${unit}, минимум ${minBet}.`)
      return
    }
    if (amount > curBalance) {
      setMessage(`На сайте только ${arFmt(curBalance)} ${unit}.`)
      return
    }
    setBusy('start')
    setMessage('')
    setResult(null)
    const params: { p_stake: number; p_currency?: Currency } = { p_stake: amount }
    if (status.svEnabled) params.p_currency = cur
    const { data, error } = await supabase.rpc('mc_dig_start', params)
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось начать спуск')
    setStatus(prev => prev ? {
      ...prev,
      ore: Number(data.ore ?? prev.ore),
      svBal: Number(data.sv_bal ?? prev.svBal),
      round: normalizeStatus({ round: data.round }).round
    } : prev)
    if (data.ore != null) onBal?.('ar', Number(data.ore))
    if (data.sv_bal != null) onBal?.('sv', Number(data.sv_bal))
  }

  const dig = async () => {
    if (busy || !status?.round) return
    setBusy('dig')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_dig_step', { p_round: status.round.id })
    setBusy(null)
    if (error || !data) return fail(error, 'Жила не поддалась')
    if (data.busted) {
      setStatus(prev => prev ? {
        ...prev,
        ore: Number(data.ore ?? prev.ore),
        svBal: Number(data.sv_bal ?? prev.svBal),
        round: null
      } : prev)
      if (data.ore != null) onBal?.('ar', Number(data.ore))
      if (data.sv_bal != null) onBal?.('sv', Number(data.sv_bal))
      setResult({ kind: 'bust', depth: Number(data.depth), mult: Number(data.mult) })
      return
    }
    setStatus(prev => prev && prev.round ? {
      ...prev,
      ore: Number(data.ore ?? prev.ore),
      svBal: Number(data.sv_bal ?? prev.svBal),
      round: { ...prev.round, depth: Number(data.depth), mult: Number(data.mult) }
    } : prev)
    if (data.ore != null) onBal?.('ar', Number(data.ore))
    if (data.sv_bal != null) onBal?.('sv', Number(data.sv_bal))
  }

  const cashout = async () => {
    if (busy || !status?.round) return
    const cur = status.round.currency
    const unit = cur === 'ar' ? 'АР' : 'SV₽'
    setBusy('cash')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_dig_cashout', { p_round: status.round.id })
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось забрать выигрыш')
    const payout = Number(data.payout)
    setStatus(prev => prev ? {
      ...prev,
      ore: Number(data.ore ?? prev.ore),
      svBal: Number(data.sv_bal ?? prev.svBal),
      round: null
    } : prev)
    if (data.ore != null) onBal?.('ar', Number(data.ore))
    if (data.sv_bal != null) onBal?.('sv', Number(data.sv_bal))
    setResult({
      kind: 'cash',
      payout,
      depth: Number(data.depth),
      mult: Number(data.mult),
      currency: cur
    })
    notify(`⛏ Забрал ${arFmt(payout)} ${unit} на глубине ${data.depth}.`)
  }

  const withdraw = async () => {
    if (busy || !status) return
    const amount = Math.floor(Number(withdrawAmount))
    if (!Number.isFinite(amount) || amount < status.minWithdraw) {
      setMessage(`Минимум для вывода — ${status.minWithdraw} АР.`)
      return
    }
    if (amount > status.ore) {
      setMessage(`На сайте только ${arFmt(status.ore)} АР.`)
      return
    }
    setBusy('withdraw')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_withdraw_ore', { p_amount: amount })
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось создать вывод')
    setStatus(prev => prev ? { ...prev, ore: Number(data.ore) } : prev)
    if (data.ore != null) onBal?.('ar', Number(data.ore))
    notify(`Заявка на ${arFmt(amount)} АР создана. Забери её в игре: /sw withdraw.`)
    load(true)
  }

  const share = useMemo(() => {
    if (!status) return null
    return {
      bustPercent: (status.bustChance * 100).toFixed(0)
    }
  }, [status])

  if (!currentUser) return <OnlyForAuth onNeedAuth={onNeedAuth} mode={mode} />
  if (authRequired) return <OnlyForAuth onNeedAuth={onNeedAuth} mode={mode} />
  if (notReady) return <NotReady mode={mode} />

  if (!status) {
    return (
      <div className="mc-view mc-view-narrow">
        <section className="mc-card mc-gate">
          <Loader2 size={26} className="mc-spin" />
          <p className="mc-muted">Спускаемся к жиле...</p>
        </section>
      </div>
    )
  }

  if (!status.authed) return <OnlyForAuth onNeedAuth={onNeedAuth} mode={mode} />

  const round = status.round
  const potential = round ? Math.round(round.stake * round.mult * 100) / 100 : 0
  const depthPercent = round ? Math.min(100, (round.depth / Math.max(1, status.maxDepth)) * 100) : 0
  const svBal = status.svEnabled ? (status.svBal ?? svBalance) : svBalance
  const activeCurrency: Currency = round ? round.currency : (status.svEnabled ? playCurrency : 'ar')
  const displayCurrency: Currency = isGame ? activeCurrency : 'ar'
  const displayBalance = displayCurrency === 'ar' ? status.ore : svBal
  const displayUnit = displayCurrency === 'ar' ? 'АР' : 'SV₽'

  return (
    <div className={`mc-view ${isGame ? 'mc-view-game' : 'mc-view-link'}`}>
      <header className="mc-head">
        <div className="mc-head-copy">
          <div className="mc-title-row">
            <span className="mc-title-glyph">{isGame ? <Pickaxe size={22} /> : <Link2 size={22} />}</span>
            <h1>{isGame ? 'Шахта' : 'Minecraft'}</h1>
          </div>
          <p className="mc-sub">
            {isGame
              ? (status.svEnabled
                ? <>Спускайся в жилу и забирай <b>SV₽</b> или <b>АР</b>. Каждый шаг повышает множитель, но порода может осыпаться. Валюту выбираешь перед спуском.</>
                : <>Спускайся в жилу и забирай <b>АР</b> на любой глубине: каждый шаг повышает множитель, но порода может осыпаться.</>)
              : <>Привязка Minecraft-аккаунта, занос и вывод <b>АР</b>. 1 алмазная руда = 1 АР. Код привязки выдаётся здесь и вводится в игре.</>}
          </p>
          {!isGame && onPlay && (
            <button type="button" className="wl-btn-orange mc-play-btn" onClick={onPlay}>
              <Pickaxe size={16} /> Играть в «Шахту»
            </button>
          )}
        </div>
        <div className="mc-ore-hero">
          <span className="mc-ore-label">{isGame ? `Баланс ${displayUnit}` : 'Баланс шахты'}</span>
          <div className="mc-ore-value">
            {displayCurrency === 'ar' ? <Gem size={20} /> : <Coins size={20} />} {arFmt(displayBalance)} <span className="mc-unit">{displayUnit}</span>
          </div>
          <span className="mc-ore-equivalent">
            {isGame
              ? (displayCurrency === 'ar' ? 'Ставка от 1 АР' : 'Ставка от 10 SV₽')
              : '1 АР = 1 алмазная руда'}
          </span>
        </div>
      </header>

      {isGame && status.svEnabled && (
        <div className="wl-currency-switch mc-currency-switch">
          <span className="wl-currency-label">Играть на:</span>
          <button
            type="button"
            className={`wl-round-btn ${activeCurrency === 'sv' ? 'active' : ''}`}
            disabled={Boolean(round)}
            onClick={() => setPlayCurrency?.('sv')}
          >
            SV₽ · {arFmt(svBal)}
          </button>
          <button
            type="button"
            className={`wl-round-btn ${activeCurrency === 'ar' ? 'active' : ''}`}
            disabled={Boolean(round)}
            onClick={() => setPlayCurrency?.('ar')}
          >
            АР · {arFmt(status.ore)}
          </button>
          {round && <span className="mc-currency-note">Текущий спуск — в {round.currency === 'ar' ? 'АР' : 'SV₽'}</span>}
        </div>
      )}

      {message && (
        <div className="mc-inline-msg">
          <AlertTriangle size={15} /> {message}
        </div>
      )}

      <div className={`mc-grid ${isGame ? 'mc-grid-solo' : 'mc-grid-link'}`}>
        {isGame && (
        <section className="mc-card mc-game">
          <div className="mc-game-head">
            <div>
              <h2>Спуск в жилу</h2>
              <p>
                Каждый шаг глубже — и множитель выше. Но порода может осыпаться.
                Забери выигрыш в любой момент.
              </p>
            </div>
          </div>

          {result && (
            <div className={`mc-result ${result.kind}`}>
              {result.kind === 'bust' ? <Skull size={18} /> : <TrendingUp size={18} />}
              <div>
                {result.kind === 'bust'
                  ? <>Жила осыпалась на глубине {result.depth}. Ставка ушла в породу.</>
                  : <>Ты забрал <b>{arFmt(result.payout)}</b> {result.currency === 'ar' ? 'АР' : 'SV₽'} на глубине {result.depth} (x{result.mult.toFixed(2)}).</>}
              </div>
            </div>
          )}

          {!round ? (
            <>
              <label className="mc-label" htmlFor="mc-stake">Ставка, {displayUnit}</label>
              <div className="mc-stake-row">
                <input
                  id="mc-stake"
                  className="mc-input"
                  inputMode="numeric"
                  value={stake}
                  onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder={displayCurrency === 'ar' ? '1' : '10'}
                />
                <button
                  className="wl-btn-orange mc-main-btn"
                  onClick={startDig}
                  disabled={busy === 'start' || (displayCurrency === 'ar' ? status.ore < 1 : svBal < 10)}
                >
                  {busy === 'start' ? <Loader2 size={16} className="mc-spin" /> : <Pickaxe size={16} />}
                  Начать спуск
                </button>
              </div>
              <div className="mc-chips">
                {(displayCurrency === 'ar' ? [1, 5, 10, 25] : [10, 50, 100, 500]).map(value => (
                  <button key={value} className="mc-chip" onClick={() => setStake(String(value))}>
                    {value}
                  </button>
                ))}
                <button className="mc-chip" onClick={() => setStake(String(Math.floor(displayCurrency === 'ar' ? status.ore : svBal)))}>
                  MAX
                </button>
              </div>
              <p className="mc-fine">
                Шанс обвала на каждом шаге — {share?.bustPercent}%. Ставка списывается сразу.
                Глубже {status.maxDepth} шагов крепь не пускает.
              </p>
              {isGame && displayCurrency === 'ar' && status.ore < 1 && onOpenLink && (
                <p className="mc-fine mc-game-link">
                  АР на нуле.{' '}
                  <button type="button" className="mc-link-btn" onClick={onOpenLink}>Пополнить</button>
                </p>
              )}
              {isGame && displayCurrency === 'sv' && svBal < 10 && (
                <p className="mc-fine mc-game-link">
                  SV₽ на нуле. Пополни баланс в «Моём счёте».
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mc-round">
                <div className="mc-round-metrics">
                  <div className="mc-metric">
                    <span>Глубина</span>
                    <strong>{round.depth} <small>/ {status.maxDepth}</small></strong>
                  </div>
                  <div className="mc-metric">
                    <span>Множитель</span>
                    <strong className="mc-cyan">x{round.mult.toFixed(2)}</strong>
                  </div>
                  <div className="mc-metric">
                    <span>Заберёшь, {round.currency === 'ar' ? 'АР' : 'SV₽'}</span>
                    <strong>{arFmt(potential)}</strong>
                  </div>
                </div>

                <div className="mc-shaft-wrap" aria-hidden="true">
                  <div className="mc-shaft-track">
                    <div className="mc-shaft-lava" />
                    <div className="mc-shaft-fill" style={{ height: `${depthPercent}%` }} />
                    <div className="mc-shaft-marker" style={{ top: `clamp(11px, ${depthPercent}%, calc(100% - 11px))` }}>
                      {round.depth}
                    </div>
                  </div>
                  <div className="mc-shaft-scale">
                    <span>поверхность</span>
                    <span>лава</span>
                  </div>
                </div>
              </div>

              <div className="mc-actions">
                <button
                  className="wl-btn-orange mc-main-btn"
                  onClick={dig}
                  disabled={busy === 'dig' || round.depth >= status.maxDepth}
                >
                  {busy === 'dig' ? <Loader2 size={16} className="mc-spin" /> : <Pickaxe size={16} />}
                  Копать глубже
                </button>
                <button
                  className="wl-btn-green mc-main-btn"
                  onClick={cashout}
                  disabled={busy === 'cash'}
                >
                  {busy === 'cash' ? <Loader2 size={16} className="mc-spin" /> : <ArrowDownToLine size={16} />}
                  Забрать {arFmt(potential)} {round.currency === 'ar' ? 'АР' : 'SV₽'}
                </button>
              </div>
              <p className="mc-fine">
                Каждый шаг: {(status.bustChance * 100).toFixed(0)}% обвала. Забирать можно после любого шага.
              </p>
            </>
          )}
        </section>
        )}

        {!isGame && (
        <aside className="mc-side">
          <section className="mc-card">
            <div className="mc-card-head"><Link2 size={16} /> <h3>Привязка Minecraft</h3></div>
            {status.linked ? (
              <>
                <div className="mc-linked">
                  <span className="mc-dot" />
                  <span className="mc-linked-name">{status.mcName}</span>
                </div>
                <p className="mc-muted">
                  Ник привязан. Заноси руду командой <code>/sw deposit all</code> —
                  1 руда = 1 АР. Баланс смотри командой <code>/sw balance</code>.
                </p>
                {confirmUnlink ? (
                  <div className="mc-inline-confirm">
                    <span>Отвязать аккаунт?</span>
                    <button className="mc-mini-btn danger" onClick={unlink} disabled={busy === 'unlink'}>Да</button>
                    <button className="mc-mini-btn" onClick={() => setConfirmUnlink(false)}>Нет</button>
                  </div>
                ) : (
                  <button className="mc-link-btn" onClick={() => setConfirmUnlink(true)}>
                    <Unlink size={14} /> Отвязать
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="mc-muted">
                  Получи код на сайте и введи его на сервере — так мы поймём,
                  что Minecraft-ник твой.
                </p>
                {code && secondsLeft > 0 ? (
                  <div className="mc-code-box">
                    <span className="mc-code">{code.code}</span>
                    <span className="mc-code-exp">
                      ещё {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                    </span>
                    <div className="mc-code-cmd">/sw link {code.code}</div>
                  </div>
                ) : (
                  <button className="wl-btn-orange mc-full-btn" onClick={createCode} disabled={busy === 'code'}>
                    {busy === 'code' ? <Loader2 size={15} className="mc-spin" /> : <Link2 size={15} />}
                    {code ? 'Новый код' : 'Получить код'}
                  </button>
                )}
                {code && secondsLeft === 0 && (
                  <p className="mc-warn">Код истёк. Сгенерируй новый — старый уже не сработает.</p>
                )}
                <button className="mc-link-btn mc-refresh" onClick={() => load(false)} disabled={loading}>
                  <RefreshCw size={14} className={loading ? 'mc-spin' : ''} /> Проверить привязку
                </button>
              </>
            )}
          </section>

          <section className="mc-card">
            <div className="mc-card-head"><ArrowUpFromLine size={16} /> <h3>Вывод в Minecraft</h3></div>
            <p className="mc-muted">
              Вывод — только целыми АР: 1 АР = 1 алмазная руда, полруды в Minecraft
              не выдать. Выдача — при входе или по команде <code>/sw withdraw</code>.
            </p>
            <div className="mc-form-row">
              <input
                className="mc-input"
                inputMode="numeric"
                placeholder={`от ${status.minWithdraw}`}
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value.replace(/[^\d]/g, ''))}
              />
              <button
                className="wl-btn-green mc-btn"
                onClick={withdraw}
                disabled={busy === 'withdraw' || !status.linked || status.ore < status.minWithdraw}
              >
                Вывести
              </button>
            </div>
            <p className="mc-fine">
              Минимум {status.minWithdraw} АР. Занесено всего: {arFmt(status.deposited)} · выведено: {arFmt(status.withdrawn)}.
            </p>
            {status.pending.length > 0 && (
              <div className="mc-pending">
                <ArrowDownToLine size={15} />
                <span>
                  В пути: {arFmt(status.pending.reduce((sum, p) => sum + p.amount, 0))} АР.
                  Забери в игре или подожди автовыдачу.
                </span>
              </div>
            )}
          </section>
        </aside>
        )}
      </div>
    </div>
  )
}
