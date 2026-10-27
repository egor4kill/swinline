import type { ReactNode } from 'react'

type GameTab = 'crash' | 'roulette' | 'plinko' | 'puddles' | 'ruble' | 'blackjack' | 'pick' | 'mine' | 'bonanza'

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
    id: 'blackjack',
    name: 'Хрякджек',
    sub: 'карты',
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
  return (
    <div className="game-cards-row" role="tablist" aria-label="Игры 24/7">
      {CARDS.map(c => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={gamesTab === c.id}
          className={`game-card ${gamesTab === c.id ? 'active' : ''}`}
          onClick={() => setGamesTab(c.id)}
        >
          <span className="game-card-art" style={{ background: c.bg }}>
            {c.art}
            {gamesTab === c.id && <i className="game-card-live" />}
          </span>
          <span className="game-card-name">{c.name}</span>
          <span className="game-card-sub">{c.sub}</span>
        </button>
      ))}
    </div>
  )
}
