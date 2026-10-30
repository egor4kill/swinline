import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Свои картинки: положи файл в src/assets/games/ с именем <id игры>.png|jpg|webp
// (см. README в той папке) — он заменит CSS-миниатюру автоматически.
const customImages = import.meta.glob('../assets/games/*.{png,jpg,jpeg,webp,avif,gif}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

function customImageFor(id: string): string | undefined {
  const entry = Object.entries(customImages).find(([path]) => {
    const name = (path.split('/').pop() || '').toLowerCase()
    return name === `${id}.png` || name === `${id}.jpg` || name === `${id}.jpeg`
      || name === `${id}.webp` || name === `${id}.avif` || name === `${id}.gif`
      || name.startsWith(`${id}.`) // суффиксы вида crash.v2.png тоже подходят
  })
  return entry?.[1]
}

type GameTab = 'crash' | 'roulette' | 'plinko' | 'puddles' | 'ruble' | 'blackjack' | 'pick' | 'mine' | 'bonanza' | 'olympus'

type Card = {
  id: GameTab
  name: string
  sub: string
  bg: string
  art: ReactNode
}

// Оригинальные миниатюры игр «Игры 24/7» в стиле казино-лобби.
// Вся рисовка — CSS/SVG, никаких сторонних картинок.
const CARDS: Card[] = [
  {
    id: 'crash',
    name: 'Хряк-Крэш',
    sub: 'общий раунд',
    bg: 'linear-gradient(165deg, #221447 0%, #0d0620 70%)',
    art: (
      <>
        <i className="gc-star" style={{ top: '14%', left: '12%' }} />
        <i className="gc-star" style={{ top: '22%', right: '18%' }} />
        <i className="gc-star" style={{ bottom: '30%', left: '40%' }} />
        <svg className="gc-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
          <path d="M4 56 Q 45 52 74 18 L 84 6" stroke="#ff7a1a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </svg>
        <span className="gc-float" style={{ top: '8%', right: '8%' }}>🐷🚀</span>
        <span className="gc-big">3.75x</span>
      </>
    )
  },
  {
    id: 'blackjack',
    name: 'Свинджек',
    sub: 'карты 21',
    bg: 'linear-gradient(165deg, #0f3320 0%, #07160c 70%)',
    art: (
      <>
        <span className="gc-card gc-card-a"><b>A</b><i>♠</i></span>
        <span className="gc-card gc-card-b"><b>A</b><i>♥</i></span>
        <span className="gc-big">21</span>
      </>
    )
  },
  {
    id: 'bonanza',
    name: 'Бонанза',
    sub: 'megaways',
    bg: 'linear-gradient(165deg, #2b1c08 0%, #120b04 70%)',
    art: (
      <>
        <span className="gc-float" style={{ top: '8%', left: '10%' }}>💎</span>
        <span className="gc-float" style={{ bottom: '14%', right: '12%', fontSize: 15 }}>🧨</span>
        <span className="gc-float gold" style={{ top: '16%', right: '26%' }}>G</span>
        <span className="gc-float gold" style={{ bottom: '18%', left: '22%' }}>D</span>
        <span className="gc-big" style={{ color: '#ffd76a' }}>BONANZA</span>
      </>
    )
  },
  {
    id: 'olympus',
    name: 'Олимп',
    sub: '8+ символов',
    bg: 'linear-gradient(165deg, #2a1550 0%, #0b0618 70%)',
    art: (
      <>
        <span className="gc-temple"><i /><i /><i /></span>
        <span className="gc-float" style={{ top: '8%', right: '12%' }}>⚡</span>
        <span className="gc-float gold" style={{ bottom: '16%', left: '12%' }}>x1000</span>
        <span className="gc-big" style={{ color: '#ffd76a' }}>OLYMPUS</span>
      </>
    )
  },
  {
    id: 'roulette',
    name: 'Корыто Фортуны',
    sub: 'колесо',
    bg: 'linear-gradient(165deg, #3a2410 0%, #17100a 70%)',
    art: (
      <>
        <span className="gc-wheel"><i /><i /><i /><i /><i /><i /><i /><i /></span>
        <span className="gc-float" style={{ top: '10%', left: '50%' }}>🔻</span>
      </>
    )
  },
  {
    id: 'plinko',
    name: 'Пяточок-Плинко',
    sub: 'шарики',
    bg: 'linear-gradient(165deg, #0d2b3d 0%, #06121c 70%)',
    art: (
      <>
        <span className="gc-pegs">
          {[0, 1, 2, 3].map(row => (
            <i key={row} className="gc-peg-row">
              {Array.from({ length: 3 + row }).map((_, i) => (
                <b key={i} />
              ))}
            </i>
          ))}
        </span>
        <span className="gc-float" style={{ top: '6%', left: '46%' }}>🐷</span>
        <span className="gc-float" style={{ bottom: '10%', left: '30%' }}>x10</span>
      </>
    )
  },
  {
    id: 'puddles',
    name: 'Грязевые лужи',
    sub: 'мины',
    bg: 'linear-gradient(165deg, #3d2a12 0%, #1a1207 70%)',
    art: (
      <>
        <span className="gc-tiles">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <b key={i} className={i === 3 ? 'boom' : i === 1 ? 'safe' : ''}>{i === 3 ? '💥' : i === 1 ? '🐽' : ''}</b>
          ))}
        </span>
        <span className="gc-big">MINES</span>
      </>
    )
  },
  {
    id: 'ruble',
    name: 'Курс рубля',
    sub: 'лента 24/7',
    bg: 'linear-gradient(165deg, #102a1a 0%, #081309 70%)',
    art: (
      <>
        <svg className="gc-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
          <polyline points="0,45 18,34 32,40 50,16 66,26 84,10 100,18" stroke="#37c26e" strokeWidth="3" fill="none" strokeLinejoin="round" />
        </svg>
        <span className="gc-float" style={{ top: '10%', right: '12%' }}>₽</span>
        <span className="gc-big" style={{ color: '#37c26e' }}>₽↑₽↓</span>
      </>
    )
  },
  {
    id: 'pick',
    name: 'Кирка',
    sub: 'башня',
    bg: 'linear-gradient(165deg, #31261a 0%, #150f08 70%)',
    art: (
      <>
        <span className="gc-tiles small">
          {[0, 1, 2, 3].map(i => (
            <b key={i} className={i === 2 ? 'boom' : ''}>{i === 2 ? '🧨' : ''}</b>
          ))}
        </span>
        <span className="gc-float" style={{ top: '6%', left: '40%' }}>⛏️</span>
      </>
    )
  },
  {
    id: 'mine',
    name: 'Шахта',
    sub: 'алмазная жила',
    bg: 'linear-gradient(165deg, #1a1f2e 0%, #0a0d14 70%)',
    art: (
      <>
        <span className="gc-lava" />
        <span className="gc-float" style={{ top: '10%', left: '42%' }}>💎</span>
        <span className="gc-float" style={{ bottom: '16%', left: '18%', fontSize: 14 }}>⛏️</span>
        <span className="gc-big" style={{ color: '#67e8f9' }}>АР</span>
      </>
    )
  }
]

type Props = {
  gamesTab: string
  setGamesTab: (t: any) => void
}

export default function GameCards({ gamesTab, setGamesTab }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const initialScroll = useRef(0)
  const hasMoved = useRef(false)

  const updateScrollState = () => {
    const el = rowRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 6)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6)
  }

  useEffect(() => {
    updateScrollState()
    const el = rowRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [])

  // Автоскролл к активной карточке
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('.game-card.active')
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
    updateScrollState()
  }, [gamesTab])

  const scrollBy = (dir: 'left' | 'right') => {
    const el = rowRef.current
    if (!el) return
    const delta = (el.clientWidth * 0.7) * (dir === 'left' ? -1 : 1)
    el.scrollBy({ left: delta, behavior: 'smooth' })
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = rowRef.current
    if (!el) return
    // Перенаправляем вертикальный скролл мыши в горизонтальный скролл карточек
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      if ((e.deltaY > 0 && canScrollRight) || (e.deltaY < 0 && canScrollLeft)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY * 1.2
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = rowRef.current
    if (!el) return
    isDragging.current = true
    startX.current = e.pageX
    initialScroll.current = el.scrollLeft
    hasMoved.current = false
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const el = rowRef.current
    if (!el) return
    const diff = e.pageX - startX.current
    if (Math.abs(diff) > 4) {
      hasMoved.current = true
    }
    el.scrollLeft = initialScroll.current - diff
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  return (
    <div className="game-cards-wrapper">
      {canScrollLeft && (
        <button
          type="button"
          className="game-cards-arrow left"
          aria-label="Прокрутить игры влево"
          onClick={() => scrollBy('left')}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <div
        ref={rowRef}
        className="game-cards-row"
        role="tablist"
        aria-label="Игры 24/7"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {CARDS.map(c => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={gamesTab === c.id}
            className={`game-card ${gamesTab === c.id ? 'active' : ''}`}
            onClick={() => {
              if (hasMoved.current) return
              setGamesTab(c.id)
            }}
          >
            <span className="game-card-art" style={{ background: c.bg }}>
              {customImageFor(c.id)
                ? <img src={customImageFor(c.id)} alt={c.name} className="game-card-img" loading="lazy" />
                : c.art}
              {gamesTab === c.id && <i className="game-card-live" />}
            </span>
            <span className="game-card-name">{c.name}</span>
            <span className="game-card-sub">{c.sub}</span>
          </button>
        ))}
      </div>

      {canScrollRight && (
        <button
          type="button"
          className="game-cards-arrow right"
          aria-label="Прокрутить игры вправо"
          onClick={() => scrollBy('right')}
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  )
}
