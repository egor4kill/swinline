import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { EMPTY, dayKey, status, type DailyState } from './dailyLogic'

export type ClaimResult = { reward: number; day: number; bal: number } | { error: string }

// Ежедневные награды: серия и факт получения живут на сервере (claim_daily),
// localStorage больше не источник истины — награду нельзя «передвинуть» из браузера
export function useDaily(userId?: string | null) {
  const [state, setState] = useState<DailyState>(EMPTY)
  const [today, setToday] = useState(() => dayKey())

  useEffect(() => {
    if (!userId) { setState(EMPTY); return }
    let alive = true
    supabase.from('daily_claims').select('*').eq('user_id', userId).maybeSingle().then(({ data }) => {
      if (!alive) return
      setState(data ? { streak: data.streak, last: data.last_claim } : EMPTY)
    })
    return () => { alive = false }
  }, [userId])

  useEffect(() => {
    const t = setInterval(() => setToday(dayKey()), 15000)
    return () => clearInterval(t)
  }, [])

  const claim = useCallback(async (): Promise<ClaimResult | null> => {
    if (!userId) return null
    const { data, error } = await supabase.rpc('claim_daily', { p_today: today })
    if (error || !data) return { error: error?.message || 'Не удалось забрать награду' }
    setState({ streak: Number(data.day), last: today })
    return { reward: Number(data.reward), day: Number(data.day), bal: Number(data.bal) }
  }, [userId, today])

  return { state, today, status: status(state, today), claim, loggedIn: !!userId }
}
