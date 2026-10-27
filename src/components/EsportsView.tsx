import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'
import {
  MonitorPlay,
  PlusCircle,
  Radio,
  Trash2,
  Trophy
} from 'lucide-react'
import type { Ev, UserAccount } from '../data'

type StreamInfo = { id: string; channel: string; title: string }

type EsportsViewProps = {
  currentUser: UserAccount | null
  isAdmin: boolean
  allEvents: Ev[]
  S: any
  selectedBet: { evId: string; outcomeIdx: number } | null
  selectOdd: (ev: Ev, outcomeIdx: number, title: string, odds: number) => void
  onOpenCreateMatch: () => void
  notify: (m: string) => void
}

// «Киберспорт»: Twitch-каналы, подключаемые владельцем, плюс ставки
// на события линии категории «Кибер-Хряк». Никакой фейковой трансляции.
export default function EsportsView({
  currentUser,
  isAdmin,
  allEvents,
  S,
  selectedBet,
  selectOdd,
  onOpenCreateMatch,
  notify
}: EsportsViewProps) {
  const [streams, setStreams] = useState<StreamInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [channelInput, setChannelInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [loaded, setLoaded] = useState(false)
  void currentUser

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('esports_streams_list')
    if (!error && data) {
      const list = data as StreamInfo[]
      setStreams(list)
      setActiveId(prev => {
        if (prev && list.some(s => s.id === prev)) return prev
        return list.length ? list[0].id : null
      })
    }
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  const parentHost = typeof window !== 'undefined' ? window.location.hostname : 'egor4kill.github.io'
  const active = streams.find(s => s.id === activeId) || null

  const addStream = async (e: FormEvent) => {
    e.preventDefault()
    if (!channelInput.trim()) return
    const { error } = await supabase.rpc('esports_add_stream', {
      p_channel: channelInput.trim(),
      p_title: titleInput.trim()
    })
    if (error) { notify(`❌ ${error.message}`); return }
    setChannelInput('')
    setTitleInput('')
    notify('📡 Канал подключён')
    load()
  }

  const removeStream = async (id: string) => {
    const { error } = await supabase.rpc('esports_remove_stream', { p_id: id })
    if (error) { notify(`❌ ${error.message}`); return }
    notify('Канал отключён')
    load()
  }

  const esportsEvents = allEvents.filter(e => e.cat === 4)

  return (
    <div>
      <div className="wl-esports-head" style={{ background: '#141822', padding: '14px 18px', borderRadius: 12, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--org)', fontWeight: 800 }}>КИБЕР-ХРЯК • ПРЯМЫЕ ЭФИРЫ И СТАВКИ</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
            Киберспорт
          </div>
        </div>
        {isAdmin && (
          <button
            className="wl-btn-orange"
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={onOpenCreateMatch}
          >
            <PlusCircle size={15} />
            <span>+ Создать матч</span>
          </button>
        )}
      </div>

      {/* Трансляция активного канала */}
      {active && (
        <div className="es-stream-wrap">
          <div className="es-stream-head">
            <span className="es-stream-live"><i className="live-badge-dot" /> ЭФИР</span>
            <span className="es-stream-title">{active.title || active.channel}</span>
            <button
              type="button"
              className="wl-round-btn es-chat-toggle"
              onClick={() => setShowChat(p => !p)}
            >
              {showChat ? 'Скрыть чат' : 'Чат'}
            </button>
          </div>
          <div className={`es-stream-grid ${showChat ? 'with-chat' : ''}`}>
            <iframe
              key={active.id}
              title={`Twitch: ${active.channel}`}
              src={`https://player.twitch.tv/?channel=${active.channel}&parent=${parentHost}&autoplay=false&muted=true`}
              allowFullScreen
              className="es-twitch-player"
            />
            {showChat && (
              <iframe
                key={`chat-${active.id}`}
                title={`Twitch chat: ${active.channel}`}
                src={`https://www.twitch.tv/embed/${active.channel}/chat?parent=${parentHost}&darkpopout`}
                className="es-twitch-chat"
              />
            )}
          </div>
        </div>
      )}

      {/* Переключатель каналов */}
      {streams.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px 0 14px', paddingBottom: 2, scrollbarWidth: 'none' }}>
          {streams.map(s => (
            <button
              key={s.id}
              type="button"
              className={`wl-round-btn ${s.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(s.id)}
              style={{ flexShrink: 0, minHeight: 40 }}
            >
              <MonitorPlay size={14} />
              <span>{s.channel}</span>
            </button>
          ))}
        </div>
      )}

      {/* Подключение каналов — только владелец */}
      {isAdmin && (
        <div className="wl-banner-card" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <MonitorPlay size={15} /> Twitch-каналы трансляций
          </div>
          {streams.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {streams.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1b212d', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                    <b>twitch.tv/{s.channel}</b>{s.title ? <span style={{ color: 'var(--tx-muted)' }}> — {s.title}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="wl-admin-action-btn danger"
                    style={{ minHeight: 36, padding: '0 10px' }}
                    onClick={() => removeStream(s.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addStream} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="wl-search-input"
              placeholder="Ник канала, например swinline"
              value={channelInput}
              onChange={e => setChannelInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              style={{ flex: '1 1 140px', height: 40, fontSize: 13 }}
            />
            <input
              type="text"
              className="wl-search-input"
              placeholder="Подпись (необязательно)"
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              style={{ flex: '1 1 140px', height: 40, fontSize: 13 }}
            />
            <button type="submit" className="wl-btn-orange" style={{ minHeight: 40, padding: '0 16px' }}>
              Подключить
            </button>
          </form>
        </div>
      )}

      {!loaded ? (
        <div className="wl-game-loading">Загружаем каналы…</div>
      ) : streams.length === 0 && (
        <div className="wl-banner-card" style={{ marginBottom: 14, textAlign: 'center', padding: '26px 16px' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📺</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Трансляций пока нет</div>
          <div style={{ color: 'var(--tx-secondary)', fontSize: 13, marginTop: 4 }}>
            {isAdmin
              ? 'Подключи Twitch-канал выше — он появится здесь у всех игроков.'
              : 'Владелец скоро подключит прямые эфиры. Ставки на киберспорт уже принимаются ниже!'}
          </div>
        </div>
      )}

      {/* Ставки на киберспорт */}
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: '16px 0 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Trophy size={16} /> Ставки на киберспорт
      </h3>
      {esportsEvents.length === 0 ? (
        <div className="wl-banner-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ color: 'var(--tx-secondary)', fontSize: 13.5 }}>
            Активных матчей нет. {isAdmin ? 'Создай матч кнопкой выше — событие появится в линии и здесь.' : 'Загляни в «Линию» — админ скоро добавит матчи.'}
          </div>
        </div>
      ) : (
        <div className="wl-table-container">
          {esportsEvents.map(ev => {
            const st = S.st[ev.id]?.s || 'open'
            const isDone = st === 'done'
            const isClosed = st === 'closed'
            const isCancelled = st === 'cancel'
            const winningIdx = S.st[ev.id]?.w
            const disabled = isClosed || isDone || isCancelled
            return (
              <div key={ev.id} className="wl-event-block">
                <div className="wl-match-row" style={{ display: 'block' }}>
                  <div className="wl-match-info" style={{ marginBottom: 10 }}>
                    <div className="wl-match-teams" style={{ flexWrap: 'wrap' }}>
                      <span>{ev.title}</span>
                      {ev.score && <span className="wl-match-score-badge">{ev.score}</span>}
                    </div>
                    <div className="wl-match-meta" style={{ marginTop: 4 }}>
                      {ev.isLive ? <span className="live-indicator">● {ev.liveTime || 'LIVE'}</span> : <span>{ev.liveTime || 'Скоро'}</span>}
                      <span>•</span>
                      <span style={{ color: 'var(--tx-muted)' }}>{ev.desc}</span>
                    </div>
                  </div>
                  <div className="wl-odds-matrix">
                    {ev.out.slice(0, 3).map((outcome, idx) => {
                      const isSelected = selectedBet?.evId === ev.id && selectedBet?.outcomeIdx === idx
                      const isWinner = isDone && winningIdx === idx
                      return (
                        <button
                          key={idx}
                          type="button"
                          className={`wl-odd-box ${isSelected ? 'selected' : ''}`}
                          style={{
                            borderColor: isWinner ? 'var(--green)' : undefined,
                            boxShadow: isWinner ? '0 0 10px rgba(34, 197, 94, 0.4)' : undefined
                          }}
                          disabled={disabled}
                          onClick={() => selectOdd(ev, idx, outcome[0], outcome[1])}
                        >
                          <span className="wl-odd-val">{outcome[1].toFixed(2)}</span>
                          <span className="wl-odd-lbl">{outcome[0].split(' ')[0]}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
