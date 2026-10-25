// «Хрюк-блэкджек»: карточные помощники — зеркало SQL (bj_hand_value, секция 15).
// Карта = число 0..51: ранг = n % 13 (0..8 => 2..10, 9=J, 10=Q, 11=K, 12=A),
// масть = Math.floor(n / 13): 0♠ 1♥ 2♦ 3♣.
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export const SUITS = ['♠', '♥', '♦', '♣'] as const

export const rankOf = (c: number) => RANKS[((c % 13) + 13) % 13]
export const suitOf = (c: number) => SUITS[Math.floor(c / 13) % 4]
export const isRed = (c: number) => [1, 2].includes(Math.floor(c / 13) % 4)

/** Значение руки: туз 11/1, картинки 10. */
export function handValue(cards: number[]): number {
  let total = 0
  let aces = 0
  for (const c of cards || []) {
    const r = c % 13
    if (r === 12) { total += 11; aces++ }
    else if (r >= 9) total += 10
    else total += r + 2
  }
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

/** Блэкджек: две карты и ровно 21. */
export const isBlackjack = (cards: number[]) => (cards || []).length === 2 && handValue(cards) === 21
