import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { supabase } from './supabase'
import type { UserAccount } from './data'

type Props = {
  currentUser: UserAccount | null
  notify: (message: string) => void
  onNeedAuth: () => void
}

type UpgraderElement = HTMLElement & {
  adapter?: unknown
  busy?: boolean
  message?: string
  resultKind?: string
  load: () => Promise<void>
  render: () => void
}

const BASE = import.meta.env.BASE_URL || '/'
const UPGRADER_VERSION = '8'
const MODULE_URL = `${BASE}upgrader/upgrader.js?v=${UPGRADER_VERSION}`
const ADAPTER_URL = `${BASE}upgrader/site-adapter.js?v=${UPGRADER_VERSION}`

let modulePromise: Promise<void> | null = null

function loadModule(): Promise<void> {
  if (modulePromise) return modulePromise
  modulePromise = (async () => {
    if (!customElements.get('minecraft-upgrader')) {
      try {
        await import(/* @vite-ignore */ MODULE_URL)
      } catch (importErr) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.type = 'module'
          script.src = MODULE_URL
          script.onload = () => resolve()
          script.onerror = (e) => {
            console.error('Failed to load upgrader script tag:', MODULE_URL, e)
            reject(importErr || new Error('Не удалось загрузить модуль Upgrader'))
          }
          document.head.appendChild(script)
        })
      }
    }
    await customElements.whenDefined('minecraft-upgrader')
  })().catch(error => {
    modulePromise = null
    console.error('loadModule failed:', error)
    throw error
  })
  return modulePromise
}

const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as any)(fn, args)

export default function MinecraftUpgrader({ currentUser, notify, onNeedAuth }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<UpgraderElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [mcNick, setMcNick] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!currentUser?.id) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('mc_links')
          .select('mc_name')
          .eq('user_id', currentUser.id)
          .maybeSingle()
        if (active && data?.mc_name) {
          setMcNick(data.mc_name)
        }
      } catch {
        // Игнорируем ошибку чтения привязки
      }
    })()
    return () => { active = false }
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser) return
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    setStatus('loading')
    setError('')

    ;(async () => {
      try {
        await loadModule()
        if (cancelled) return
        const { SiteAdapter } = (await import(/* @vite-ignore */ ADAPTER_URL)) as {
          SiteAdapter: new (call: typeof rpc, client?: any) => unknown
        }
        if (cancelled) return
        const element = document.createElement('minecraft-upgrader') as UpgraderElement
        element.adapter = new SiteAdapter(rpc, supabase)
        elementRef.current = element
        host.replaceChildren(element)
        setStatus('ready')
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || 'Не удалось загрузить Upgrader')
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      elementRef.current?.remove()
      elementRef.current = null
      host.replaceChildren()
    }
  }, [currentUser?.id, reloadKey])

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    notify(`Скопировано: ${cmd}`)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!currentUser) {
    return (
      <section className="mc-card mc-upgrader-gate">
        <div className="mc-upgrader-gate-icon"><Sparkles size={28} /></div>
        <h2>Апгрейдер Minecraft</h2>
        <p>
          Инвентарь привязан к серверу выживания Minecraft. Войди через Twitch,
          чтобы улучшать свои игровые предметы.
        </p>
        <button className="wl-btn-orange mc-upgrader-gate-btn" onClick={onNeedAuth}>
          Войти через Twitch
        </button>
      </section>
    )
  }

  return (
    <div className="mc-upgrader-shell">
      <div className="mc-upgrader-toolbar">
        <div className="mc-upgrader-copy">
          <span className="mc-upgrader-kicker">MINECRAFT · UPGRADER</span>
          <p>
            {mcNick ? (
              <>Привязанный ник: <b>{mcNick}</b>. Положить предмет из руки: <code>/up deposit</code></>
            ) : (
              <>Привяжите свой Minecraft-ник командой <code>/sw link КОД</code> (код в профиле или Шахте).</>
            )}
          </p>
        </div>
        <div className="mc-upgrader-actions">
          <button
            className="mc-upgrader-ghost"
            title="Скопировать команду заноса предмета из руки"
            onClick={() => copyCommand('/up deposit')}
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>/up deposit</span>
          </button>
          <button
            className="mc-upgrader-ghost"
            title="Скопировать команду выдачи выведенных предметов"
            onClick={() => copyCommand('/up withdraw')}
          >
            <Copy size={14} />
            <span>/up withdraw</span>
          </button>
        </div>
      </div>

      <div ref={hostRef} className="mc-upgrader-host" aria-live="polite" />

      {status === 'loading' && (
        <div className="mc-upgrader-state">
          <Loader2 size={22} className="mc-spin" />
          <span>Загружаем инвентарь и каталог предметов…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="mc-upgrader-state mc-upgrader-state-error">
          <AlertTriangle size={22} />
          <span>{error}</span>
          <button className="mc-upgrader-ghost" onClick={() => setReloadKey(k => k + 1)}>
            Повторить
          </button>
        </div>
      )}
    </div>
  )
}
