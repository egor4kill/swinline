import { Users } from 'lucide-react'
import type { UserAccount } from '../../data'
import { r2 } from '../../logic'
import { fmt } from '../../fmt'
import { UserAvatar } from '../Avatars'

type CrashArenaProps = {
  crashMultiplier: number
  crashPhase: 'betting' | 'flying' | 'crashed'
  crashCountdown: number
  crashRound: { id: number; startAt: number; bettingSeconds: number; crashed: boolean; crashPoint: number | null } | null
  crashHistory: number[]
  myCrashBet: {
    stake: number
    currency: 'sv' | 'ar'
    autoCashout?: number
    cashedOutMul?: number
    winAmount?: number
  } | null
  liveCrashBets: any[]
  crashStake: string
  setCrashStake: (v: string) => void
  crashAutoCashout: string
  setCrashAutoCashout: (v: string) => void
  placeCrashBet: () => void
  cancelCrashBet: () => void
  cashoutCrash: () => void
  currentUser: UserAccount | null
  unit: string
}

export default function CrashArena({
  crashMultiplier,
  crashPhase,
  crashCountdown,
  crashRound,
  crashHistory,
  myCrashBet,
  liveCrashBets,
  crashStake,
  setCrashStake,
  crashAutoCashout,
  setCrashAutoCashout,
  placeCrashBet,
  cancelCrashBet,
  cashoutCrash,
  currentUser,
  unit
}: CrashArenaProps) {
  const money = (n: number, c: 'sv' | 'ar' = 'sv') =>
    n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + (c === 'ar' ? 'АР' : 'SV₽')
  const svBank = liveCrashBets.filter(b => b.currency !== 'ar').reduce((acc, b) => acc + Number(b.stake || 0), 0)
  const arBank = liveCrashBets.filter(b => b.currency === 'ar').reduce((acc, b) => acc + Number(b.stake || 0), 0)
  const progress = Math.min(1, Math.max(0, (crashMultiplier - 1.0) / 8.0))
  const curX = 40 + progress * 480
  const curY = 230 - Math.pow(progress, 0.8) * 180
  const controlX = 40 + progress * 160
  const controlY = 230
  const curvePath = `M 40 230 Q ${controlX} ${controlY}, ${curX} ${curY}`
  const areaPath = `M 40 230 Q ${controlX} ${controlY}, ${curX} ${curY} L ${curX} 230 Z`
  const isHigh = crashMultiplier >= 10.0 && crashPhase === 'flying'
  const multiplierColor = crashPhase === 'crashed'
    ? '#ef4444'
    : myCrashBet?.cashedOutMul
    ? 'var(--green)'
    : crashMultiplier >= 10.0
    ? '#fbbf24'
    : crashMultiplier >= 5.0
    ? '#c084fc'
    : crashMultiplier >= 2.0
    ? 'var(--org)'
    : '#ffffff'

  return (
    <div className="wl-crash-layout">
      {/* Left Column: Multiplayer Flight Canvas & Controls */}
      <div className={`wl-crash-arena ${crashPhase} ${crashMultiplier > 3.2 && crashPhase === 'flying' ? 'shaking' : ''}`}>
        {/* Round Header & Past History Pills */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--org)', background: 'rgba(255,85,0,0.12)', border: '1px solid rgba(255,85,0,0.3)', padding: '4px 10px', borderRadius: 8, letterSpacing: '0.04em' }}>
              РАУНД #{crashRound?.id ?? '…'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 800 }}>
              ИСТОРИЯ:
            </span>
          </div>
          <div className="wl-crash-history-pills">
            {crashHistory.map((h, i) => (
              <span
                key={i}
                className="wl-crash-history-pill"
                style={{
                  color: h >= 2.0 ? 'var(--green)' : h < 1.2 ? '#ef4444' : 'var(--org)',
                  borderColor: h >= 2.0 ? 'rgba(16, 185, 129, 0.4)' : undefined,
                  boxShadow: h >= 10.0 ? '0 0 10px rgba(251, 191, 36, 0.4)' : undefined
                }}
              >
                {h.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>

        {/* SVG Shared Flight Canvas */}
        <div className="wl-crash-display">
          <svg className="wl-crash-svg-container" viewBox="0 0 600 260" preserveAspectRatio="none">
            <defs>
              <linearGradient id="crashAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff5500" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ff5500" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="crashLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ff5500" />
              </linearGradient>
            </defs>

            {/* Coordinate Grid */}
            <line x1="30" y1="230" x2="570" y2="230" stroke="#1f2738" strokeWidth="2" />
            <line x1="30" y1="170" x2="570" y2="170" stroke="#141a27" strokeDasharray="4 4" />
            <line x1="30" y1="110" x2="570" y2="110" stroke="#141a27" strokeDasharray="4 4" />
            <line x1="30" y1="50" x2="570" y2="50" stroke="#141a27" strokeDasharray="4 4" />

            <text x="565" y="234" fill="#3a455a" fontSize="10" fontWeight="700">1.0x</text>
            <text x="565" y="174" fill="#3a455a" fontSize="10" fontWeight="700">2.0x</text>
            <text x="565" y="114" fill="#3a455a" fontSize="10" fontWeight="700">5.0x</text>
            <text x="565" y="54" fill="#3a455a" fontSize="10" fontWeight="700">10x</text>

            {/* Trajectory & Neon Trail during flying/crashed */}
            {crashPhase !== 'betting' && (
              <>
                <path d={areaPath} fill="url(#crashAreaGrad)" />
                <path
                  d={curvePath}
                  fill="none"
                  stroke={crashPhase === 'crashed' ? '#ef4444' : 'url(#crashLineGrad)'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  style={{
                    filter: crashPhase === 'crashed' ? 'drop-shadow(0 0 8px #ef4444)' : 'drop-shadow(0 0 10px #ff5500)'
                  }}
                />
              </>
            )}

            {/* Rocket Pig waiting at launchpad in betting phase */}
            {crashPhase === 'betting' && (
              <g transform="translate(40, 230) rotate(-6)">
                <text x="-14" y="10" fontSize="32" className="wl-rocket-pig">🐷🚀</text>
              </g>
            )}

            {/* Flying Rocket Pig with Thruster */}
            {crashPhase === 'flying' && (
              <g transform={`translate(${curX}, ${curY}) rotate(${-8 - progress * 26})`}>
                <text x="-32" y="8" fontSize="24" className="wl-thruster-flame">🔥</text>
                <text x="-14" y="10" fontSize="34" className="wl-rocket-pig">🐷🚀</text>
              </g>
            )}

            {/* Crash Burst & Shockwave */}
            {crashPhase === 'crashed' && (
              <g transform={`translate(${curX}, ${curY})`}>
                <circle cx="0" cy="0" r="16" className="wl-crash-shockwave" />
                <text x="-22" y="14" fontSize="42">💥</text>
              </g>
            )}
          </svg>

          {/* Multiplier / Countdown HUD */}
          {crashPhase === 'betting' ? (
            <div style={{ position: 'absolute', top: '48%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx-muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
                СЛЕДУЮЩИЙ РАУНД ЧЕРЕЗ:
              </div>
              <div style={{ fontSize: 48, fontWeight: 900, fontFamily: 'var(--font-d)', color: 'var(--org)', textShadow: '0 0 20px rgba(255,85,0,0.5)' }}>
                {crashCountdown.toFixed(1)}s
              </div>
              <div className="wl-crash-countdown-bar-wrap" style={{ width: 220, margin: '8px auto 0' }}>
                <div className="wl-crash-countdown-bar" style={{ width: `${Math.max(0, Math.min(100, (crashCountdown / 6.0) * 100))}%` }} />
              </div>
            </div>
          ) : (
            <div
              className={`wl-crash-multiplier ${isHigh ? 'high' : ''}`}
              style={{ color: multiplierColor }}
            >
              {crashMultiplier.toFixed(2)}x
            </div>
          )}

          <div className="wl-crash-status">
            {crashPhase === 'betting' && (
              <span style={{ color: myCrashBet ? 'var(--green)' : 'var(--org)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '5px 16px', borderRadius: 999, fontWeight: 700 }}>
                {myCrashBet ? '✅ ВАША СТАВКА ПРИНЯТА НА РАУНД' : '⏳ ПРИЁМ СТАВОК НА РАУНД 🚀'}
              </span>
            )}
            {crashPhase === 'flying' && (
              <span style={{ color: 'var(--org)', background: 'rgba(255,85,0,0.15)', border: '1px solid rgba(255,85,0,0.3)', padding: '5px 16px', borderRadius: 999, fontWeight: 700 }}>
                🚀 ХРЯК В ПОЛЁТЕ! ВСЕ ОНЛАЙН В ОДНОЙ РАКЕТЕ!
              </span>
            )}
            {crashPhase === 'crashed' && (
              <span style={{ color: '#ef4444', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: '5px 16px', borderRadius: 999, fontWeight: 700 }}>
                💥 КРЭШ НА {crashMultiplier.toFixed(2)}x! СВИН УПАЛ В ЛУЖУ
              </span>
            )}
          </div>
        </div>

        {/* Multiplayer Control Bar */}
        <div style={{ background: '#161a24', padding: 16, borderRadius: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 700 }}>СТАВКА {unit}:</label>
            <input
              type="text"
              className="wl-stake-input"
              value={crashStake}
              disabled={crashPhase !== 'betting'}
              onChange={e => setCrashStake(e.target.value.replace(',', '.'))}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {(unit === 'АР' ? ['10', '25', '50', '100'] : ['100', '200', '500', '1000']).map(val => (
              <button
                key={val}
                className="wl-quick-btn"
                style={{ padding: '8px 12px' }}
                disabled={crashPhase !== 'betting'}
                onClick={() => setCrashStake(val)}
              >
                +{val}
              </button>
            ))}
          </div>

          <div style={{ width: 120 }}>
            <label style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 700 }}>АВТО-ВЫВОД (X):</label>
            <input
              type="text"
              className="wl-stake-input"
              placeholder="Напр. 2.00"
              value={crashAutoCashout}
              disabled={crashPhase !== 'betting'}
              onChange={e => setCrashAutoCashout(e.target.value.replace(',', '.'))}
            />
          </div>

          <div style={{ width: '100%', maxWidth: 260 }}>
            {crashPhase === 'betting' && (
              !myCrashBet ? (
                <button
                  className="wl-btn-orange"
                  style={{ width: '100%', height: 48, fontSize: 15, fontWeight: 800, borderRadius: 10 }}
                  onClick={placeCrashBet}
                >
                  ПОСТАВИТЬ НА РАУНД 🚀
                </button>
              ) : (
                <button
                  className="wl-btn-cancel"
                  style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800, borderRadius: 10, background: '#3b1d22', color: '#ff7878', border: '1px solid #ef4444' }}
                  onClick={cancelCrashBet}
                >
                  ОТМЕНИТЬ ({money(myCrashBet.stake, myCrashBet.currency)}) ✖
                </button>
              )
            )}

            {crashPhase === 'flying' && (
              myCrashBet && !myCrashBet.cashedOutMul ? (
                <button
                  className="wl-btn-green pulse"
                  style={{ width: '100%', height: 48, fontSize: 15, fontWeight: 800, borderRadius: 10 }}
                  onClick={cashoutCrash}
                >
                  ЗАБРАТЬ {money(r2(myCrashBet.stake * crashMultiplier), myCrashBet.currency)} 💰
                </button>
              ) : myCrashBet && myCrashBet.cashedOutMul ? (
                <button
                  disabled
                  className="wl-btn-green"
                  style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800, borderRadius: 10, opacity: 0.9, cursor: 'default' }}
                >
                  ЗАБРАНО {money(myCrashBet.winAmount, myCrashBet.currency)} (x{myCrashBet.cashedOutMul.toFixed(2)}) ✅
                </button>
              ) : (
                <button
                  disabled
                  className="wl-btn-orange"
                  style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800, borderRadius: 10, opacity: 0.5, cursor: 'not-allowed' }}
                >
                  РАУНД В ПРОЦЕССЕ... 🚀
                </button>
              )
            )}

            {crashPhase === 'crashed' && (
              myCrashBet && myCrashBet.cashedOutMul ? (
                <button
                  disabled
                  className="wl-btn-green"
                  style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800, borderRadius: 10, opacity: 0.9, cursor: 'default' }}
                >
                  ВЫИГРЫШ {money(myCrashBet.winAmount, myCrashBet.currency)} 🏆
                </button>
              ) : myCrashBet && !myCrashBet.cashedOutMul ? (
                <button
                  disabled
                  style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800, borderRadius: 10, background: '#2c1417', color: '#ef4444', border: '1px solid #ef4444', opacity: 0.85, cursor: 'default' }}
                >
                  СТАВКА СГОРЕЛА 💥
                </button>
              ) : (
                <button
                  disabled
                  className="wl-btn-orange"
                  style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800, borderRadius: 10, opacity: 0.5, cursor: 'not-allowed' }}
                >
                  КРЭШ НА {crashMultiplier.toFixed(2)}x 💥
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live Online Multiplayer Bets Sidebar */}
      <div className="wl-crash-sidebar">
        <div className="wl-crash-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={16} color="var(--org)" />
            <span>ОНЛАЙН СТАВКИ ({liveCrashBets.length})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx-muted)', fontWeight: 700 }}>
            Банк: {money(svBank, 'sv')}{arBank > 0 ? ` + ${money(arBank, 'ar')}` : ''}
          </div>
        </div>

        <div className="wl-crash-sidebar-list">
          {liveCrashBets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--tx-muted)', fontSize: 12 }}>
              {crashPhase === 'betting' ? 'Делайте ставки на раунд! 🚀' : 'В этом раунде нет ставок'}
            </div>
          ) : (
            liveCrashBets.map(b => {
              const isMine = b.user_id === currentUser?.id
              const cashedMul = b.cashed_out_mul != null ? Number(b.cashed_out_mul) : null
              const winAmount = b.win_amount != null ? Number(b.win_amount) : null
              const isWon = cashedMul !== null
              const isCrashed = crashPhase === 'crashed' && !isWon
              return (
                <div
                  key={b.id}
                  className={`wl-crash-bet-card ${isMine ? 'me' : ''} ${isWon ? 'won' : ''} ${isCrashed ? 'crashed' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <UserAvatar avatar={b.avatar} name={b.username} size={26} />
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800, fontSize: 12, color: isMine ? 'var(--org)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.username} {isMine && '(Вы)'}
                      </div>
                      {b.auto_cashout != null && cashedMul === null && (
                        <div style={{ fontSize: 10, color: 'var(--tx-muted)' }}>
                          авто: x{Number(b.auto_cashout).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>
                      {money(Number(b.stake), b.currency === 'ar' ? 'ar' : 'sv')}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800 }}>
                      {isWon ? (
                        <span style={{ color: 'var(--green)' }}>+{money(winAmount || 0, b.currency === 'ar' ? 'ar' : 'sv')} (x{cashedMul!.toFixed(2)})</span>
                      ) : isCrashed ? (
                        <span style={{ color: '#ef4444' }}>0 {b.currency === 'ar' ? 'АР' : 'SV₽'} 💥</span>
                      ) : (
                        <span style={{ color: 'var(--org)' }}>🚀 В игре</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
