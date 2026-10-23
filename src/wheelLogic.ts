// «Корыто Фортуны»: 16 равных секторов. Сумма множителей = 15.4 → RTP 96.25%.
// Старая таблица на 8 секторов давала RTP 227% — колесо «печатало» деньги; теперь честно и покрыто тестом.
export type Sector = { mul: number; label: string; title: string; color: string; bg: string; emoji: string }

export const SECTORS: Sector[] = [
  { mul: 0,   label: 'x0',   title: 'В лужу',           color: '#ef4444', bg: '#2b0d10', emoji: '💥' },
  { mul: 0.5, label: 'x0.5', title: 'Половинка',        color: '#94a3b8', bg: '#1c2230', emoji: '🐽' },
  { mul: 0,   label: 'x0',   title: 'Корыто пусто',     color: '#ef4444', bg: '#2b0d10', emoji: '🐽' },
  { mul: 1.2, label: 'x1.2', title: 'Свин-старт',       color: '#ff7700', bg: '#2d1806', emoji: '🐷' },
  { mul: 0,   label: 'x0',   title: 'Хряк уснул',       color: '#ef4444', bg: '#2b0d10', emoji: '😴' },
  { mul: 0.5, label: 'x0.5', title: 'Полкорыта',        color: '#94a3b8', bg: '#1c2230', emoji: '🥓' },
  { mul: 0,   label: 'x0',   title: 'Мимо корыта',      color: '#ef4444', bg: '#2b0d10', emoji: '🥴' },
  { mul: 1.2, label: 'x1.2', title: 'Хрюк-бонус',       color: '#eab308', bg: '#2b2308', emoji: '🥓' },
  { mul: 0,   label: 'x0',   title: 'Гроза над фермой', color: '#ef4444', bg: '#2b0d10', emoji: '⛈️' },
  { mul: 0.5, label: 'x0.5', title: 'Половинка',        color: '#94a3b8', bg: '#1c2230', emoji: '🐽' },
  { mul: 0,   label: 'x0',   title: 'Свин съел ставку', color: '#ef4444', bg: '#2b0d10', emoji: '🍔' },
  { mul: 1.0, label: 'x1.0', title: 'Как было',         color: '#22c55e', bg: '#082618', emoji: '🔄' },
  { mul: 0,   label: 'x0',   title: 'В лужу',           color: '#ef4444', bg: '#2b0d10', emoji: '💦' },
  { mul: 0.5, label: 'x0.5', title: 'Половинка',        color: '#94a3b8', bg: '#1c2230', emoji: '🐽' },
  { mul: 0,   label: 'x0',   title: 'Корыто пусто',     color: '#ef4444', bg: '#2b0d10', emoji: '🐽' },
  { mul: 10,  label: 'x10',  title: 'ДЖЕКПОТ 👑',       color: '#fbbf24', bg: '#3a2804', emoji: '👑' }
]

/** Теоретический возврат колеса (для теста честности). */
export const rtp = () => SECTORS.reduce((a, s) => a + s.mul, 0) / SECTORS.length
