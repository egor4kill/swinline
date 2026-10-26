import { SECTORS as ROULETTE_SECTORS } from '../../wheelLogic'
import { PigLogo } from '../Avatars'

// Колесо «Корыто Фортуны»: секторы и честный RTP (~96%) — в wheelLogic.ts, покрыто тестом
export const WHEEL_SEC_DEG = 360 / ROULETTE_SECTORS.length

type RouletteWheelProps = {
  spinning: boolean
  wheelRotation: number
  wonSectorIdx: number | null
  rouletteResult: string | null
  spinRoulette: () => void
  unit: string
  stake: number
}

export default function RouletteWheel({
  spinning,
  wheelRotation,
  wonSectorIdx,
  rouletteResult,
  spinRoulette,
  unit,
  stake
}: RouletteWheelProps) {
  return (
    <div className="wl-banner-card highlight" style={{ padding: '28px 24px 34px', textAlign: 'center' }}>
      <span className="wl-banner-tag">ИГРЫ 24/7 • БЫСТРЫЕ ИСХОДЫ</span>
      <h2 style={{ fontFamily: 'var(--font-d)', fontSize: 28, margin: '12px 0 6px' }}>
        КОРЫТО ФОРТУНЫ 🐷
      </h2>
      <p style={{ color: 'var(--tx-secondary)', fontSize: 14, marginBottom: 18, maxWidth: 520, margin: '0 auto 18px' }}>
        Испытайте удачу! Ставка {stake} {unit}. Крутите корыто и забирайте моментальные множители от x0 до x10!
      </p>

      {/* Physics-Based SVG Fortune Wheel */}
      <div className="wl-wheel-container">
        {/* Outer Rim with LED Bulbs */}
        <div className="wl-wheel-rim">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: spinning ? (i % 2 === 0 ? '#ff7700' : '#ffd700') : '#475569',
                boxShadow: spinning ? '0 0 8px #ff7700' : 'none',
                top: `${50 - 48 * Math.cos((i * 22.5 * Math.PI) / 180)}%`,
                left: `${50 + 48 * Math.sin((i * 22.5 * Math.PI) / 180)}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'all 0.2s'
              }}
            />
          ))}
        </div>

        {/* Golden Pointer at 12 o'clock */}
        <div className={`wl-wheel-pointer ${spinning ? 'ticking' : ''}`}>
          <svg width="32" height="36" viewBox="0 0 32 36">
            <path d="M 16 36 L 4 6 Q 16 0 28 6 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.8))" />
            <circle cx="16" cy="10" r="4" fill="#fff" />
          </svg>
        </div>

        {/* Rotating SVG Wheel */}
        <div
          className="wl-wheel-rotor"
          style={{
            transform: `rotate(${wheelRotation}deg)`,
            transition: spinning ? 'transform 4.2s cubic-bezier(0.12, 0.8, 0.2, 1)' : 'none'
          }}
        >
          <svg viewBox="0 0 300 300" className="wl-wheel-svg">
            {ROULETTE_SECTORS.map((sec, idx) => {
              const r1 = (idx * WHEEL_SEC_DEG * Math.PI) / 180
              const r2 = ((idx + 1) * WHEEL_SEC_DEG * Math.PI) / 180
              const x1 = 150 + 145 * Math.cos(r1)
              const y1 = 150 + 145 * Math.sin(r1)
              const x2 = 150 + 145 * Math.cos(r2)
              const y2 = 150 + 145 * Math.sin(r2)
              const path = `M 150 150 L ${x1} ${y1} A 145 145 0 0 1 ${x2} ${y2} Z`

              const midAngle = (idx + 0.5) * WHEEL_SEC_DEG
              const midRad = (midAngle * Math.PI) / 180
              const textX = 150 + 94 * Math.cos(midRad)
              const textY = 150 + 94 * Math.sin(midRad)

              const isWinner = wonSectorIdx === idx && !spinning

              return (
                <g key={idx}>
                  <path
                    d={path}
                    fill={isWinner ? '#f59e0b' : sec.bg}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="1.5"
                    style={{
                      transition: 'fill 0.3s',
                      filter: isWinner ? 'drop-shadow(0 0 12px #f59e0b)' : 'none'
                    }}
                  />
                  <g transform={`rotate(${midAngle + 90}, ${textX}, ${textY})`}>
                    <text
                      x={textX}
                      y={textY - 8}
                      fill="#fff"
                      fontSize="16"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {sec.emoji}
                    </text>
                    <text
                      x={textX}
                      y={textY + 12}
                      fill={isWinner ? '#000' : sec.color}
                      fontSize="13"
                      fontWeight="800"
                      fontFamily="var(--font-d)"
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {sec.label}
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Central Mascot Hub */}
        <div className="wl-wheel-center-hub" onClick={!spinning ? spinRoulette : undefined} title="Крутить корыто">
          <PigLogo />
          <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', marginTop: 2, letterSpacing: 0.5 }}>SWIN</span>
        </div>
      </div>

      {/* Result Box */}
      {rouletteResult && (
        <div style={{
          padding: '12px 20px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #171d2b, #1f2738)',
          border: '1px solid var(--org)',
          color: '#fff',
          fontSize: 16,
          fontWeight: 800,
          marginBottom: 20,
          display: 'inline-block',
          boxShadow: '0 4px 20px rgba(255, 85, 0, 0.25)'
        }}>
          {rouletteResult}
        </div>
      )}

      <div>
        <button
          className="wl-btn-orange"
          style={{ fontSize: 16, padding: '14px 42px', borderRadius: 12, fontWeight: 800 }}
          disabled={spinning}
          onClick={spinRoulette}
        >
          {spinning ? 'Корыто крутится...' : `Крутить за ${stake} ${unit} 🎰`}
        </button>
      </div>
    </div>
  )
}
