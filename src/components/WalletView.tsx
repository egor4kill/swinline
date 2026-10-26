import { useEffect, useState } from 'react'
import type { UserAccount, Ev } from '../data'
import { fmt } from '../fmt'
import { supabase } from '../supabase'
import DailyRewards from '../DailyRewards'
import type { useDaily } from '../useDaily'

type WalletViewProps = {
  daily: ReturnType<typeof useDaily>
  claimDaily: () => void
  balance: number
  S: any
  allEvents: Ev[]
  currentUser: UserAccount | null
  addVirtualMoney: (amount: number) => void
  claimCashback: () => void
  onResetAll: () => void
}

export default function WalletView({
  daily,
  claimDaily,
  balance,
  S,
  allEvents,
  currentUser,
  addVirtualMoney,
  claimCashback,
  onResetAll
}: WalletViewProps) {
  // История ставок из базы (RLS отдаёт только свои): на любом устройстве одна и та же
  const [dbBets, setDbBets] = useState<any[] | null>(null)
  useEffect(() => {
    if (!currentUser) { setDbBets(null); return }
    let alive = true
    setDbBets(null)
    supabase.from('bets').select('*').eq('user_id', currentUser.id)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (alive) setDbBets((data || []) as any[]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])
  // для вошедшего — серверная история, для гостя — локальная
  const rows: any[] = currentUser ? (dbBets || []) : (S.bets || [])
  const rowsMeta: 'db' | 'local' = currentUser ? 'db' : 'local'
  const betMoney = (n: number, b: any) =>
    n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + (b.currency === 'ar' ? 'АР' : 'SV₽')

  const rowViews = rows.map((b: any) => {
    const isDb = rowsMeta === 'db'
    const ev = isDb ? null : allEvents.find(e => e.id === b.ev)
    const title = isDb ? (b.match_title || b.event_id) : (ev?.title || b.ev)
    const pick = isDb ? (b.pick_name || b.pick) : (ev?.out[b.i]?.[0] || 'Исход')
    const status = isDb ? b.status : b.state
    const statusColor = status === 'won' ? 'var(--green)' : status === 'lost' ? '#ef4444' : status === 'refund' ? '#94a3b8' : 'var(--org)'
    const statusText = status === 'won' ? 'ВЫИГРЫШ' : status === 'lost' ? 'ПРОИГРЫШ' : status === 'refund' ? 'ВОЗВРАТ' : 'В ИГРЕ'
    return {
      key: b.id,
      title,
      pick,
      statusColor,
      statusText,
      payout: isDb && status === 'won' ? betMoney(Number(b.payout || 0), b) : '',
      stake: betMoney(Number(b.stake), b),
      odds: Number(b.odds).toFixed(2)
    }
  })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
        Мой счёт и баланс
      </h2>

      <DailyRewards daily={daily} onClaim={claimDaily} />

      <div className="wl-banner-card wl-wallet-balance" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>Доступный виртуальный баланс:</div>
        <div className="wl-wallet-balance-value" style={{ fontFamily: 'var(--font-d)', fontSize: 36, fontWeight: 800, color: 'var(--org)', margin: '8px 0 16px' }}>
          {fmt(balance)}
        </div>
        <div className="wl-wallet-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="wl-btn-orange" onClick={() => addVirtualMoney(5000)}>
            + 5 000 SV₽
          </button>
          <button className="wl-btn-orange" style={{ background: '#3b82f6' }} onClick={() => addVirtualMoney(25000)}>
            + 25 000 SV₽
          </button>
          <button className="wl-btn-orange" style={{ background: '#7c3aed' }} onClick={claimCashback}>
            💰 Забрать кэшбэк
          </button>
          <button
            className="wl-sidebar-quick-btn"
            style={{ border: '1px solid var(--border)' }}
            onClick={onResetAll}
          >
            Сбросить всё
          </button>
        </div>
      </div>

      <h3 style={{ fontSize: 17, fontWeight: 700, margin: '24px 0 12px' }}>
        История ставок {rowsMeta === 'db' ? '(из базы)' : ''}
      </h3>
      <div className="wl-table-container wl-wallet-table-wrap">
        {rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--tx-muted)' }}>
            {rowsMeta === 'db' && dbBets === null
              ? 'Загружаем из базы…'
              : 'Ставок пока нет. Загляните в линию и выберите исход!'}
          </div>
        ) : (
          <table className="wl-wallet-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#171b26', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px' }}>Событие</th>
                <th style={{ padding: '10px 14px' }}>Ставка</th>
                <th style={{ padding: '10px 14px' }}>Коэф.</th>
                <th style={{ padding: '10px 14px' }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rowViews.map(r => (
                <tr key={r.key} style={{ borderBottom: '1px solid #1c2230' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700 }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{r.pick}{r.payout ? ` • выплата ${r.payout}` : ''}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.stake}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-d)', color: 'var(--org)' }}>{r.odds}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: r.statusColor, fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#191f2c' }}>
                      {r.statusText}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* На телефоне таблица превращается в карточки — горизонтальный скролл не нужен */}
      <div className="wl-wallet-cards">
        {rowViews.length === 0 ? (
          <div className="wl-wallet-empty">
            {rowsMeta === 'db' && dbBets === null
              ? 'Загружаем из базы…'
              : 'Ставок пока нет. Загляните в линию и выберите исход!'}
          </div>
        ) : rowViews.map(r => (
          <article className="wl-wallet-card" key={r.key}>
            <div className="wl-wallet-card-top">
              <div className="wl-wallet-card-title">{r.title}</div>
              <span className="wl-wallet-card-status" style={{ color: r.statusColor }}>{r.statusText}</span>
            </div>
            <div className="wl-wallet-card-pick">
              {r.pick}{r.payout ? ` · выплата ${r.payout}` : ''}
            </div>
            <div className="wl-wallet-card-bottom">
              <span>Ставка <b>{r.stake}</b></span>
              <span>Коэф. <b className="wl-wallet-card-odds">{r.odds}</b></span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
