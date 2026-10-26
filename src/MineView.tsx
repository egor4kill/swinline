import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pickaxe,
  Gem,
  Link2,
  RefreshCw,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Unlink,
  Skull,
  TrendingUp
} from 'lucide-react'
import { supabase } from './supabase'
import { fmt } from './fmt'
import type { UserAccount } from './data'

const MC_SERVER = ((import.meta.env.VITE_MC_SERVER as string | undefined) || '').trim()
const UNIT = 'АР'
const FALLBACK_RATE_TO_SV = 250
const FALLBACK_RATE_FROM_SV = 300
const FALLBACK_MIN_WITHDRAW = 5
const FALLBACK_MAX_DEPTH = 30
const FALLBACK_BUST = 0.18
const FALLBACK_RTP = 0.9758

type PendingWithdrawal = {
  id: string
  amount: number
  created_at: string
}

type DigRound = {
  id: string
  stake: number
  depth: number
  mult: number
  status: string
  payout: number
}

type MineStatus = {
  authed: boolean
  linked: boolean
  mcName: string | null
  ore: number
  deposited: number
  withdrawn: number
  rateToSv: number
  rateFromSv: number
  minWithdraw: number
  bustChance: number
  rtp: number
  maxDepth: number
  pending: PendingWithdrawal[]
  round: DigRound | null
}

type Result =
  | { kind: 'bust'; depth: number; mult: number }
  | { kind: 'cash'; payout: number; depth: number; mult: number }
  | null

type Props = {
  currentUser: UserAccount | null
  balance: number
  notify: (message: string) => void
  onNeedAuth: () => void
  onBal: (bal: number, log: { x: string; d: number } | null) => void
}

const integer = (value: number) => Math.floor(value).toLocaleString('ru-RU')

function normalizeStatus(raw: any): MineStatus {
  const round = raw?.round
  return {
    authed: Boolean(raw?.authed),
    linked: Boolean(raw?.linked),
    mcName: raw?.mc_name || null,
    ore: Number(raw?.ore ?? 0),
    deposited: Number(raw?.deposited ?? 0),
    withdrawn: Number(raw?.withdrawn ?? 0),
    rateToSv: Number(raw?.rate_to_sv ?? FALLBACK_RATE_TO_SV),
    rateFromSv: Number(raw?.rate_from_sv ?? FALLBACK_RATE_FROM_SV),
    minWithdraw: Number(raw?.min_withdraw ?? FALLBACK_MIN_WITHDRAW),
    bustChance: Number(raw?.bust_chance ?? FALLBACK_BUST),
    rtp: Number(raw?.rtp ?? FALLBACK_RTP),
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
      payout: Number(round.payout ?? 0)
    } : null
  }
}

function OnlyForAuth({ onNeedAuth }: { onNeedAuth: () => void }) {
  return (
    <div className="mc-view mc-view-narrow">
      <section className="mc-card mc-gate">
        <div className="mc-gate-icon"><Pickaxe size={30} /></div>
        <h1>Шахта ждёт</h1>
        <p>
          Войди через Twitch, чтобы привязать Minecraft-аккаунт, заносить алмазную руду
          и получать АР — валюту шахты. 1 руда = 1 АР.
        </p>
        <button className="wl-btn-orange mc-gate-btn" onClick={onNeedAuth}>
          Войти через Twitch
        </button>
      </section>
    </div>
  )
}

function NotReady() {
  return (
    <div className="mc-view mc-view-narrow">
      <section className="mc-card mc-gate">
        <div className="mc-gate-icon"><AlertTriangle size={28} /></div>
        <h1>Шахта скоро откроется</h1>
        <p>
          Мы уже прокладываем ствол. Как только серверная часть будет подключена,
          здесь появится привязка Minecraft, занос руды (1 руда = 1 АР) и спуск в алмазную жилу.
        </p>
      </section>
    </div>
  )
}

export default function MineView({ currentUser, balance, notify, onNeedAuth, onBal }: Props) {
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
  const [withdrawAmount, setWithdrawAmount] = useState('5')
  const [convertAmount, setConvertAmount] = useState('')
  const [buyAmount, setBuyAmount] = useState('')

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
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Пока код живой — проверяем, не привязался ли игрок в игре.
  useEffect(() => {
    if (!code || !userId) return
    const timer = setInterval(() => load(true), 3000)
    return () => clearInterval(timer)
  }, [code, userId, load])

  useEffect(() => {
    if (status?.linked && code) setCode(null)
  }, [status?.linked, code])

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

  const startDig = async () => {
    if (busy || !status) return
    const amount = Math.floor(Number(stake))
    if (!Number.isFinite(amount) || amount < 1) {
      setMessage('Ставка — целое число АР, минимум 1.')
      return
    }
    if (amount > status.ore) {
      setMessage(`На сайте только ${integer(status.ore)} АР.`)
      return
    }
    setBusy('start')
    setMessage('')
    setResult(null)
    const { data, error } = await supabase.rpc('mc_dig_start', { p_stake: amount })
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось начать спуск')
    setStatus(prev => prev ? {
      ...prev,
      ore: Number(data.ore),
      round: normalizeStatus({ round: data.round }).round
    } : prev)
  }

  const dig = async () => {
    if (busy || !status?.round) return
    setBusy('dig')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_dig_step', { p_round: status.round.id })
    setBusy(null)
    if (error || !data) return fail(error, 'Жила не поддалась')
    if (data.busted) {
      setStatus(prev => prev ? { ...prev, ore: Number(data.ore), round: null } : prev)
      setResult({ kind: 'bust', depth: Number(data.depth), mult: Number(data.mult) })
      return
    }
    setStatus(prev => prev && prev.round ? {
      ...prev,
      ore: Number(data.ore),
      round: { ...prev.round, depth: Number(data.depth), mult: Number(data.mult) }
    } : prev)
  }

  const cashout = async () => {
    if (busy || !status?.round) return
    setBusy('cash')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_dig_cashout', { p_round: status.round.id })
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось забрать АР')
    setStatus(prev => prev ? { ...prev, ore: Number(data.ore), round: null } : prev)
    setResult({
      kind: 'cash',
      payout: Number(data.payout),
      depth: Number(data.depth),
      mult: Number(data.mult)
    })
    notify(`⛏ Забрал ${integer(Number(data.payout))} АР на глубине ${data.depth}.`)
  }

  const withdraw = async () => {
    if (busy || !status) return
    const amount = Math.floor(Number(withdrawAmount))
    if (!Number.isFinite(amount) || amount < status.minWithdraw) {
      setMessage(`Минимум для вывода — ${status.minWithdraw} АР.`)
      return
    }
    if (amount > status.ore) {
      setMessage(`На сайте только ${integer(status.ore)} АР.`)
      return
    }
    setBusy('withdraw')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_withdraw_ore', { p_amount: amount })
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось создать вывод')
    setStatus(prev => prev ? { ...prev, ore: Number(data.ore) } : prev)
    notify(`Заявка на ${integer(amount)} АР создана. Забери её в игре: /sw withdraw.`)
    load(true)
  }

  const convert = async () => {
    if (busy || !status) return
    const amount = Math.floor(Number(convertAmount))
    if (!Number.isFinite(amount) || amount < 1) {
      setMessage('Укажи целое количество АР.')
      return
    }
    if (amount > status.ore) {
      setMessage(`На сайте только ${integer(status.ore)} АР.`)
      return
    }
    setBusy('convert')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_convert', { p_amount: amount })
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось обменять АР')
    setStatus(prev => prev ? { ...prev, ore: Number(data.ore) } : prev)
    onBal(Number(data.bal), { x: `Обмен ${amount} АР на SV₽`, d: Number(data.sv) })
    setConvertAmount('')
    notify(`⛏ ${integer(amount)} АР → ${fmt(Number(data.sv))}`)
  }

  const buy = async () => {
    if (busy || !status) return
    const amount = Math.floor(Number(buyAmount))
    if (!Number.isFinite(amount) || amount < 1) {
      setMessage('Укажи целое количество АР.')
      return
    }
    const cost = amount * status.rateFromSv
    if (cost > balance) {
      setMessage(`Не хватает SV₽: нужно ${fmt(cost)}.`)
      return
    }
    setBusy('buy')
    setMessage('')
    const { data, error } = await supabase.rpc('mc_buy_ore', { p_amount: amount })
    setBusy(null)
    if (error || !data) return fail(error, 'Не удалось купить АР')
    setStatus(prev => prev ? { ...prev, ore: Number(data.ore) } : prev)
    onBal(Number(data.bal), { x: `Покупка ${amount} АР`, d: -Number(data.cost) })
    setBuyAmount('')
    notify(`⛏ Куплено ${integer(amount)} АР за ${fmt(Number(data.cost))}`)
  }

  const share = useMemo(() => {
    if (!status) return null
    const ore = status.ore
    return {
      sv: ore * status.rateToSv,
      bustPercent: (status.bustChance * 100).toFixed(0),
      rtpPercent: (status.rtp * 100).toFixed(1)
    }
  }, [status])

  if (!currentUser) return <OnlyForAuth onNeedAuth={onNeedAuth} />
  if (authRequired) return <OnlyForAuth onNeedAuth={onNeedAuth} />
  if (notReady) return <NotReady />

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

  if (!status.authed) return <OnlyForAuth onNeedAuth={onNeedAuth} />

  const round = status.round
  const potential = round ? Math.floor(round.stake * round.mult) : 0
  const depthPercent = round ? Math.min(100, (round.depth / Math.max(1, status.maxDepth)) * 100) : 0

  return (
    <div className="mc-view">
      <header className="mc-head">
        <div className="mc-head-copy">
          <div className="mc-title-row">
            <span className="mc-title-glyph"><Pickaxe size={22} /></span>
            <h1>Шахта «Алмазная жила»</h1>
          </div>
          <p className="mc-sub">
            Алмазная руда из Minecraft становится <b>АР</b> — отдельной валютой шахты.
            1 руда = 1 АР. Заноси в игре, спускайся за множителем и выводи обратно.
          </p>
        </div>
        <div className="mc-ore-hero">
          <span className="mc-ore-label">Баланс шахты</span>
          <div className="mc-ore-value">
            <Gem size={20} /> {integer(status.ore)} <span className="mc-unit">АР</span>
          </div>
          <span className="mc-ore-equivalent">≈ {fmt(share?.sv || 0)} · 1 АР = 1 руда</span>
        </div>
      </header>

      {message && (
        <div className="mc-inline-msg">
          <AlertTriangle size={15} /> {message}
        </div>
      )}

      <div className="mc-grid">
        <section className="mc-card mc-game">
          <div className="mc-game-head">
            <div>
              <h2>Спуск в жилу</h2>
              <p>
                Каждый шаг глубже — и множитель выше. Но порода может осыпаться.
                Забери АР в любой момент.
              </p>
            </div>
            <div className="mc-rtp" title="Средний возврат на любой глубине">
              <ShieldCheck size={14} /> {share?.rtpPercent}%
            </div>
          </div>

          {result && (
            <div className={`mc-result ${result.kind}`}>
              {result.kind === 'bust' ? <Skull size={18} /> : <TrendingUp size={18} />}
              <div>
                {result.kind === 'bust'
                  ? <>Жила осыпалась на глубине {result.depth}. Ставка ушла в породу.</>
                  : <>Ты забрал <b>{integer(result.payout)}</b> АР на глубине {result.depth} (x{result.mult.toFixed(2)}).</>}
              </div>
            </div>
          )}

          {!round ? (
            <>
              <label className="mc-label" htmlFor="mc-stake">Ставка, АР</label>
              <div className="mc-stake-row">
                <input
                  id="mc-stake"
                  className="mc-input"
                  inputMode="numeric"
                  value={stake}
                  onChange={e => setStake(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="1"
                />
                <button
                  className="wl-btn-orange mc-main-btn"
                  onClick={startDig}
                  disabled={busy === 'start' || status.ore < 1}
                >
                  {busy === 'start' ? <Loader2 size={16} className="mc-spin" /> : <Pickaxe size={16} />}
                  Начать спуск
                </button>
              </div>
              <div className="mc-chips">
                {[1, 5, 10, 25].map(value => (
                  <button key={value} className="mc-chip" onClick={() => setStake(String(value))}>
                    {value}
                  </button>
                ))}
                <button className="mc-chip" onClick={() => setStake(String(status.ore))}>
                  MAX
                </button>
              </div>
              <p className="mc-fine">
                Шанс обвала на каждом шаге — {share?.bustPercent}%. Ставка списывается сразу.
                Глубже {status.maxDepth} шагов крепь не пускает.
              </p>
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
                    <span>Заберёшь, АР</span>
                    <strong>{integer(potential)}</strong>
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
                  Забрать {integer(potential)} АР
                </button>
              </div>
              <p className="mc-fine">
                Каждый шаг: {(status.bustChance * 100).toFixed(0)}% обвала. Забирать можно после любого шага.
              </p>
            </>
          )}
        </section>

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
                {MC_SERVER && <div className="mc-server">Сервер: <code>{MC_SERVER}</code></div>}
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
            <div className="mc-card-head"><ArrowRightLeft size={16} /> <h3>АР и SV₽</h3></div>
            <div className="mc-rate-line">
              <span>1 АР → <b>{integer(status.rateToSv)} SV₽</b></span>
              <span>1 АР ← <b>{integer(status.rateFromSv)} SV₽</b></span>
            </div>
            <div className="mc-form-row">
              <input
                className="mc-input"
                inputMode="numeric"
                placeholder="Сколько АР"
                value={convertAmount}
                onChange={e => setConvertAmount(e.target.value.replace(/[^\d]/g, ''))}
              />
              <button className="wl-btn-orange mc-btn" onClick={convert} disabled={busy === 'convert' || status.ore < 1}>
                В SV₽
              </button>
            </div>
            <div className="mc-form-row">
              <input
                className="mc-input"
                inputMode="numeric"
                placeholder="Сколько АР купить"
                value={buyAmount}
                onChange={e => setBuyAmount(e.target.value.replace(/[^\d]/g, ''))}
              />
              <button className="mc-btn mc-btn-ghost" onClick={buy} disabled={busy === 'buy'}>
                За SV₽
              </button>
            </div>
            <p className="mc-fine">
              Обмен АР на SV₽ — без комиссии. Покупка АР — по курсу {integer(status.rateFromSv)} SV₽.
            </p>
          </section>

          <section className="mc-card">
            <div className="mc-card-head"><ArrowUpFromLine size={16} /> <h3>Вывод в Minecraft</h3></div>
            <p className="mc-muted">
              АР спишутся здесь и появятся в игре: 1 АР = 1 алмазная руда.
              Выдача — при входе или по команде <code>/sw withdraw</code>.
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
              Минимум {status.minWithdraw} АР. Занесено всего: {integer(status.deposited)} · выведено: {integer(status.withdrawn)}.
            </p>
            {status.pending.length > 0 && (
              <div className="mc-pending">
                <ArrowDownToLine size={15} />
                <span>
                  В пути: {integer(status.pending.reduce((sum, p) => sum + p.amount, 0))} АР.
                  Забери в игре или подожди автовыдачу.
                </span>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
