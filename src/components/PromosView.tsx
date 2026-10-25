import { PROMOS } from '../data'

type PromosViewProps = {
  notify: (m: string) => void
}

export default function PromosView({ notify }: PromosViewProps) {
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
        Акции и специальные предложения
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {PROMOS.map((p, idx) => (
          <div key={idx} className="wl-banner-card" style={{ minHeight: 180 }}>
            <span className="wl-banner-tag">АКЦИЯ #{idx + 1}</span>
            <div className="wl-banner-title" style={{ fontSize: 18 }}>
              {p[0]}
            </div>
            <div className="wl-banner-desc" style={{ maxWidth: '100%' }}>
              {p[1]}
            </div>
            <button
              className="wl-btn-orange"
              style={{ marginTop: 14, width: 'fit-content' }}
              onClick={() => notify(`Условия акции «${p[0]}» выполнены!`)}
            >
              Активировать
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
