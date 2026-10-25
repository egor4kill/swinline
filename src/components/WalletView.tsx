import type { UserAccount, Ev } from '../data'
import { fmt } from '../fmt'
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
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
        Мой счёт и баланс
      </h2>

      <DailyRewards daily={daily} onClaim={claimDaily} />

      <div className="wl-banner-card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--tx-secondary)' }}>Доступный виртуальный баланс:</div>
        <div style={{ fontFamily: 'var(--font-d)', fontSize: 36, fontWeight: 800, color: 'var(--org)', margin: '8px 0 16px' }}>
          {fmt(balance)}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
  )
}
