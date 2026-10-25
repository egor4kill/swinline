import type { Dispatch, SetStateAction } from 'react'
import {
  Play,
  Pause,
  Volume2,
  Maximize2,
  MessageSquare
} from 'lucide-react'
import type { UserAccount } from '../data'

type EsportsViewProps = {
  streamPlaying: boolean
  setStreamPlaying: Dispatch<SetStateAction<boolean>>
  chatMessages: string[]
  setChatMessages: Dispatch<SetStateAction<string[]>>
  esportsChatInput: string
  setEsportsChatInput: Dispatch<SetStateAction<string>>
  currentUser: UserAccount | null
}

export default function EsportsView({
  streamPlaying,
  setStreamPlaying,
  chatMessages,
  setChatMessages,
  esportsChatInput,
  setEsportsChatInput,
  currentUser
}: EsportsViewProps) {
  return (
    <div>
      <div style={{ background: '#141822', padding: '14px 18px', borderRadius: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--org)', fontWeight: 800 }}>THUNDERPICK WORLD CHAMPIONSHIP • ГРАНД-ФИНАЛ</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
            FURIA Piglets vs BetBoom Svin Team
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-d)', fontWeight: 800, color: 'var(--org)' }}>
            1 : 0
          </div>
          <div className="wl-badge-count" style={{ background: '#22c55e22', color: '#22c55e', borderColor: '#22c55e55' }}>
            КАРТА 2 • ПЕРЕРЫВ
          </div>
        </div>
      </div>

      <div className="wl-esports-arena">
        <div className="wl-stream-player">
          <div className="wl-stream-hud">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 999 }}>
              <div className="live-badge-dot" />
              <span style={{ fontSize: 12, fontWeight: 700 }}>LIVE 1080p • Прямой эфир</span>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>
              Карта: Dust 2
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, animation: streamPlaying ? 'pulse 2s infinite' : 'none' }}>
              🐷🎮
            </div>
            <div style={{ fontFamily: 'var(--font-d)', fontWeight: 800, fontSize: 22, marginTop: 12 }}>
              SWIN-ESPORTS ARENA
            </div>
            <div style={{ color: 'var(--tx-secondary)', fontSize: 13, marginTop: 4 }}>
              {streamPlaying ? 'Прямой эфир турнира CS2 • Идёт разминка' : 'Трансляция на паузе'}
            </div>
          </div>

          <div className="wl-stream-bottom-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setStreamPlaying(p => !p)} style={{ color: '#fff' }}>
                {streamPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button style={{ color: '#fff' }}>
                <Volume2 size={20} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>01:24:19</span>
            </div>
            <div>
              <button style={{ color: '#fff' }}>
                <Maximize2 size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="wl-esports-stats-panel">
          <div style={{ fontWeight: 800, fontSize: 15, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            Командная статистика
          </div>

          <div className="wl-stat-row">
            <div className="wl-stat-labels">
              <span>FURIA: 55%</span>
              <span>Винрейт на карте</span>
              <span>50% :BetBoom</span>
            </div>
            <div className="wl-stat-bar-outer">
              <div className="wl-stat-bar-team1" style={{ width: '55%' }} />
              <div className="wl-stat-bar-team2" style={{ width: '45%' }} />
            </div>
          </div>

          <div className="wl-stat-row">
            <div className="wl-stat-labels">
              <span>FURIA: 58%</span>
              <span>Пистолетные раунды</span>
              <span>52% :BetBoom</span>
            </div>
            <div className="wl-stat-bar-outer">
              <div className="wl-stat-bar-team1" style={{ width: '58%' }} />
              <div className="wl-stat-bar-team2" style={{ width: '42%' }} />
            </div>
          </div>

          <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <MessageSquare size={14} /> Чат матча
            </div>
            <div style={{ maxHeight: 130, minHeight: 70, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, marginBottom: 8 }}>
              {chatMessages.length === 0 ? (
                <div style={{ color: 'var(--tx-muted)', textAlign: 'center', padding: '15px 0' }}>Сообщений пока нет. Будьте первыми!</div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} style={{ background: '#1a1f2b', padding: '4px 8px', borderRadius: 6, color: '#e2e8f0' }}>
                    {msg}
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={e => {
                e.preventDefault()
                if (!esportsChatInput.trim()) return
                const sender = currentUser?.username || 'Гость'
                setChatMessages(prev => [...prev.slice(-30), `${sender}: ${esportsChatInput.trim()}`])
                setEsportsChatInput('')
              }}
              style={{ display: 'flex', gap: 6 }}
            >
              <input
                type="text"
                className="wl-search-input"
                placeholder="Написать в чат..."
                value={esportsChatInput}
                onChange={e => setEsportsChatInput(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 12, height: 32 }}
              />
              <button
                type="submit"
                className="wl-btn-orange"
                style={{ padding: '4px 12px', fontSize: 12, height: 32, borderRadius: 8 }}
              >
                Отправить
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
