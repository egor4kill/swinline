import { ShieldCheck } from 'lucide-react'
import { ABOUT, START, MINBET } from '../data'
import { fmt } from '../fmt'
import ceoPhoto from '../assets/ceo.jpg'

export default function AboutView() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 22, marginBottom: 16 }}>
        О компании SWINLINE
      </h2>

      {/* CEO Showcase Card */}
      <div
        className="wl-banner-card highlight"
        style={{
          display: 'flex',
          gap: 22,
          alignItems: 'center',
          marginBottom: 20,
          padding: '20px 24px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, #151a26, #1c2333)',
          border: '1px solid rgba(255, 85, 0, 0.35)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)'
        }}
      >
        <img
          src={ceoPhoto}
          alt="Генеральный директор SWINLINE"
          style={{
            width: 120,
            height: 150,
            objectFit: 'cover',
            borderRadius: 12,
            border: '2px solid var(--org)',
            boxShadow: '0 4px 20px var(--org-glow)',
            flexShrink: 0
          }}
        />
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255, 85, 0, 0.15)', color: 'var(--org)', border: '1px solid rgba(255, 85, 0, 0.3)', padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
            <ShieldCheck size={14} /> Руководство компании
          </div>
          <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6, fontFamily: 'var(--font-d)' }}>
            Генеральный директор SWINLINE
          </h3>
          <div style={{ fontSize: 14, color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
            Основатель и генеральный директор букмекерской платформы SWINLINE. Лично курирует честность выплат, надёжность алгоритмов линии, организацию турниров и стратегическое развитие платформы нового поколения.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
        {Array.from({ length: ABOUT.length / 2 }).map((_, i) => (
          <div key={i} className="wl-banner-card">
            <span className="wl-banner-tag">{ABOUT[i * 2]}</span>
            <div style={{ fontSize: 14, color: 'var(--tx-secondary)', marginTop: 8, lineHeight: 1.6 }}>
              {ABOUT[i * 2 + 1]}
            </div>
          </div>
        ))}
      </div>

      <div className="wl-banner-card highlight">
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Правила платформы</h3>
        <p style={{ fontSize: 13, color: 'var(--tx-secondary)', lineHeight: 1.6 }}>
          SWINLINE — интерактивная игровая платформа. Внутренняя расчетная единица: SV₽. Стартовый баланс: {fmt(START)}, минимальная ставка: {MINBET} SV₽. Все игровые расчеты производятся в единицах SV₽.
        </p>
      </div>
    </div>
  )
}
