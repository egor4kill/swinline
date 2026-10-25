import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { vipLevel, LEVELS, nextLevelGap } from './casinoLogic'

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })

// VIP-бейдж у ника: уровень растёт от оборота ставок (total_wagered на сервере).
export default function VipBadge({ userId }: { userId: string }) {
  const [wagered, setWagered] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const { data } = await supabase.from('profiles').select('total_wagered').eq('id', userId).maybeSingle()
        if (alive && data) setWagered(Number(data.total_wagered || 0))
      } catch { /* попробуем позже */ }
    }
    load()
    const id = window.setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [userId])

  if (wagered === null) return null
  const lvl = vipLevel(wagered)
  const L = LEVELS[lvl]
  const gap = nextLevelGap(wagered)
  return (
    <span
      title={`VIP: ${L.name} • оборот ${fmt(wagered)} SV₽${gap !== null ? ` • до следующего уровня ${fmt(gap)} SV₽` : ' • максимум'}`}
      style={{
        display: 'inline-block', fontSize: 9, fontWeight: 900, letterSpacing: 0.5,
        padding: '1px 6px', borderRadius: 6, marginTop: 2, alignSelf: 'flex-start',
        color: L.color, border: `1px solid ${L.color}`, background: 'rgba(0,0,0,0.25)',
      }}
    >
      {L.name} {lvl + 1}
    </span>
  )
}
