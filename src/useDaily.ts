import { useEffect, useRef, useState } from 'react'
import { EMPTY, dayKey, status, claim as claimLogic, type DailyState } from './dailyLogic'

const load = (key: string | null): DailyState => {
  if (!key) return EMPTY
  try { const o = JSON.parse(localStorage.getItem(key) || 'null'); if (o && typeof o.streak === 'number') return o } catch {}
  return EMPTY
}

// Прогресс хранится в браузере отдельно для каждого аккаунта. Позже переедет в базу вместе с защитой баланса.
export function useDaily(userId?: string | null) {
  const key = userId ? `svinline.v3.daily.${userId}` : null
  const [state, setState] = useState<DailyState>(() => load(key))
  const [today, setToday] = useState(() => dayKey())
  const ref = useRef(state)
  useEffect(() => { const s = load(key); ref.current = s; setState(s) }, [key])
  useEffect(() => { const t = setInterval(() => setToday(dayKey()), 15000); return () => clearInterval(t) }, [])

  const claim = () => {
    if (!key) return null
    const r = claimLogic(ref.current, dayKey()) // проверка по свежему состоянию: двойной клик не выдаст дважды
    if (!r) return null
    ref.current = r.state
    setState(r.state)
    try { localStorage.setItem(key, JSON.stringify(r.state)) } catch {}
    return { reward: r.reward, day: r.state.streak }
  }
  return { state, today, status: status(state, today), claim, loggedIn: !!key }
}
