import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, Sparkles } from 'lucide-react'
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
const UPGRADER_VERSION = '5'
const MODULE_URL = `${BASE}upgrader/upgrader.js?v=${UPGRADER_VERSION}`
const ADAPTER_URL = `${BASE}upgrader/site-adapter.js?v=${UPGRADER_VERSION}`

let modulePromise: Promise<void> | null = null

function loadModule(): Promise<void> {
  if (modulePromise) return modulePromise
  modulePromise = (async () => {
    if (!customElements.get('minecraft-upgrader')) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.type = 'module'
        script.src = MODULE_URL
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Не удалось загрузить модуль Upgrader'))
        document.head.appendChild(script)
      })
    }
    await customElements.whenDefined('minecraft-upgrader')
  })().catch(error => {
    modulePromise = null
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
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!currentUser) return
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    setStatus('loading')
    setError('')
    setConfirmReset(false)

    ;(async () => {
      try {
        await loadModule()
        if (cancelled) return
        const { SiteAdapter } = (await import(/* @vite-ignore */ ADAPTER_URL)) as {
          SiteAdapter: new (call: typeof rpc) => unknown
        }
        if (cancelled) return
        const element = document.createElement('minecraft-upgrader') as UpgraderElement
        element.adapter = new SiteAdapter(rpc)
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

  if (!currentUser) {
    return (
      <section className="mc-card mc-upgrader-gate">
        <div className="mc-upgrader-gate-icon"><Sparkles size={28} /></div>
        <h2>Апгрейдер Minecraft</h2>
        <p>
          Игровой инвентарь привязан к аккаунту SWINLINE. Войди через Twitch,
          чтобы получить стартовый набор и улучшать предметы.
        </p>
        <button className="wl-btn-orange mc-upgrader-gate-btn" onClick={onNeedAuth}>
          Войти через Twitch
        </button>
      </section>
    )
  }

  const reset = async () => {
    if (resetting) return
    if (elementRef.current?.busy) {
      notify('Дождитесь окончания вращения')
      return
    }
    setResetting(true)
    const { error: resetError } = await (supabase.rpc as any)('upgrader_reset', {})
    setResetting(false)
    if (resetError) {
      notify(resetError.message || 'Не удалось сбросить инвентарь')
      return
    }
    setConfirmReset(false)
    notify('Стартовый набор восстановлен')
    await elementRef.current?.load()
    if (elementRef.current) {
      elementRef.current.message = 'Стартовый набор восстановлен. Можно пробовать снова.'
      elementRef.current.resultKind = ''
      elementRef.current.render()
    }
  }

  return (
    <div className="mc-upgrader-shell">
      <div className="mc-upgrader-toolbar">
        <div className="mc-upgrader-copy">
          <span className="mc-upgrader-kicker">MINECRAFT · UPGRADER</span>
          <p>Инвентарь привязан к аккаунту SWINLINE. Это отдельная мини-игра: АР и SV₽ не списываются.</p>
        </div>
        <div className="mc-upgrader-actions">
          {confirmReset ? (
            <>
              <span className="mc-upgrader-confirm">Добытые предметы пропадут</span>
              <button className="mc-upgrader-danger" onClick={reset} disabled={resetting}>
                {resetting ? <Loader2 size={14} className="mc-spin" /> : null}
                Да, сбросить
              </button>
              <button className="mc-upgrader-ghost" onClick={() => setConfirmReset(false)} disabled={resetting}>
                Отмена
              </button>
            </>
          ) : (
            <button className="mc-upgrader-reset" onClick={() => setConfirmReset(true)} disabled={status !== 'ready'}>
              <RotateCcw size={14} /> Сбросить набор
            </button>
          )}
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
