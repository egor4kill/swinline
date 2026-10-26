import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  Trophy,
  Gamepad2,
  Flame,
  Building,
  Sparkles,
  Swords,
  Activity,
  Utensils,
  Search,
  Star,
  Clock,
  X,
  PlusCircle
} from 'lucide-react'
import { SPORT_CATEGORIES, type Ev } from '../data'

const getSportIcon = (iconName: string) => {
  switch (iconName) {
    case 'Trophy': return <Trophy size={16} />
    case 'Gamepad2': return <Gamepad2 size={16} />
    case 'Flame': return <Flame size={16} />
    case 'Building': return <Building size={16} />
    case 'Sparkles': return <Sparkles size={16} />
    case 'Swords': return <Swords size={16} />
    case 'Activity': return <Activity size={16} />
    case 'Utensils': return <Utensils size={16} />
    default: return <Sparkles size={16} />
  }
}

type SidebarProps = {
  view: string
  setView: (v: string) => void
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  favoritesOnly: boolean
  setFavoritesOnly: Dispatch<SetStateAction<boolean>>
  favorites: Record<string, boolean>
  selectedSport: number | null
  setSelectedSport: (s: number | null) => void
  isAdmin: boolean
  onOpenAdmin: () => void
  allEvents: Ev[]
}

export default function Sidebar({
  view,
  setView,
  searchQuery,
  setSearchQuery,
  favoritesOnly,
  setFavoritesOnly,
  favorites,
  selectedSport,
  setSelectedSport,
  isAdmin,
  onOpenAdmin,
  allEvents
}: SidebarProps) {
  // На телефоне поиск не занимает строку постоянно: чипы категорий + иконка поиска
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mobileSearchOpen) searchRef.current?.focus()
  }, [mobileSearchOpen])

  const favoritesCount = Object.values(favorites).filter(Boolean).length

  return (
    <aside className={`wl-sidebar ${mobileSearchOpen ? 'wl-mobile-search-open' : ''}`}>
      <button
        type="button"
        className={`wl-search-toggle ${searchQuery ? 'active' : ''}`}
        aria-label={mobileSearchOpen ? 'Закрыть поиск' : 'Поиск событий'}
        aria-expanded={mobileSearchOpen}
        onClick={() => setMobileSearchOpen(open => !open)}
      >
        {mobileSearchOpen ? <X size={20} /> : <Search size={20} />}
      </button>

      <div className="wl-search-box">
        <Search className="wl-search-icon" size={16} />
        <input
          ref={searchRef}
          type="text"
          className="wl-search-input"
          placeholder="Поиск событий..."
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value)
            if (view !== 'line' && view !== 'live' && e.target.value) {
              setView('line')
            }
          }}
        />
        {searchQuery && (
          <button
            className="wl-search-clear"
            aria-label="Очистить поиск"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#888' }}
            onClick={() => setSearchQuery('')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="wl-sidebar-quick">
        <button
          className={`wl-sidebar-quick-btn wl-quick-favorites ${favoritesOnly ? 'active' : ''}`}
          aria-label="Показать избранные события"
          title="Избранное"
          onClick={() => {
            setFavoritesOnly(prev => !prev)
            if (view !== 'line' && view !== 'live') setView('line')
          }}
        >
          <Star size={16} color={favoritesOnly ? 'var(--org)' : '#94a3b8'} />
          <span>Избранное</span>
          {favoritesCount > 0 && (
            <span className="wl-badge-count">{favoritesCount}</span>
          )}
        </button>

        <button
          className={`wl-sidebar-quick-btn wl-quick-all ${selectedSport === null && !favoritesOnly ? 'active' : ''}`}
          onClick={() => {
            setSelectedSport(null)
            setFavoritesOnly(false)
            if (view !== 'line' && view !== 'live') setView('line')
          }}
        >
          <Clock size={16} />
          <span>Все события</span>
        </button>

        {isAdmin && (
          <button
            className="wl-sidebar-quick-btn wl-quick-admin"
            style={{ color: '#f59e0b', background: '#f59e0b11', borderColor: '#f59e0b33' }}
            onClick={onOpenAdmin}
          >
            <PlusCircle size={16} />
            <span>+ Добавить матч</span>
          </button>
        )}
      </div>

      <div className="wl-sports-list">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase', padding: '6px 12px' }}>
          Категории ставок
        </div>
        <button
          type="button"
          className={`wl-sport-item wl-sport-mobile-chip wl-sport-all-mobile ${selectedSport === null && !favoritesOnly ? 'active' : ''}`}
          onClick={() => {
            setSelectedSport(null)
            setFavoritesOnly(false)
          }}
        >
          <div className="wl-sport-left">
            <Clock size={15} />
            <span>Все</span>
          </div>
        </button>
        <button
          type="button"
          className={`wl-sport-item wl-sport-mobile-chip wl-sport-favorites-mobile ${favoritesOnly ? 'active' : ''}`}
          onClick={() => {
            setFavoritesOnly(prev => !prev)
            if (view !== 'line' && view !== 'live') setView('line')
          }}
        >
          <div className="wl-sport-left">
            <Star size={15} color={favoritesOnly ? 'var(--org)' : 'inherit'} />
            <span>Избранное</span>
          </div>
          {favoritesCount > 0 && <span className="wl-badge-count">{favoritesCount}</span>}
        </button>
        {SPORT_CATEGORIES.map(sport => {
          const isActive = selectedSport === sport.id
          return (
            <button
              key={sport.id}
              className={`wl-sport-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                setSelectedSport(isActive ? null : sport.id)
                setFavoritesOnly(false)
                if (view !== 'line' && view !== 'live') setView('line')
              }}
            >
              <div className="wl-sport-left">
                <span style={{ color: isActive ? 'var(--org)' : 'inherit' }}>
                  {getSportIcon(sport.icon)}
                </span>
                <span>{sport.name}</span>
              </div>
              <span className="wl-badge-count">{allEvents.filter(e => e.cat === sport.id).length}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
