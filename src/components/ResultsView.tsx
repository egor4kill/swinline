import type { Ev } from '../data'

type ResultsViewProps = {
  allEvents: Ev[]
  S: any
}

export default function ResultsView({ allEvents, S }: ResultsViewProps) {
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
        Результаты и архив событий
      </h2>
      <div className="wl-table-container">
        {(() => {
          const finishedEvents = allEvents.filter(ev => S.st[ev.id]?.s === 'done' || S.st[ev.id]?.s === 'cancelled')
          if (finishedEvents.length === 0) {
            return (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-muted)' }}>
                Завершённых событий пока нет. Итоги матчей появятся здесь после их расчёта администратором.
              </div>
            )
          }
          return finishedEvents.map(ev => {
            const state = S.st[ev.id]
            const isCancelled = state?.s === 'cancelled'
            return (
              <div key={ev.id} style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{ev.league}</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{ev.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>{ev.desc}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-d)', fontWeight: 800, fontSize: 18, color: 'var(--org)' }}>
                    {ev.score || (isCancelled ? 'Отменён' : 'Завершено')}
                  </div>
                  <div style={{ fontSize: 11, color: isCancelled ? '#ef4444' : 'var(--green)' }}>
                    {isCancelled ? 'Матч отменён (возврат ставок)' : state?.w !== undefined ? `Победил исход: ${ev.out[state.w]?.[0]}` : 'Итог зафиксирован'}
                  </div>
                </div>
              </div>
            )
          })
        })()}
      </div>
    </div>
  )
}
