import { describe, it, expect } from 'vitest'
import { rankOf, suitOf, isRed, handValue, isBlackjack } from './blackjackLogic'

describe('хрюк-блэкджек (карты)', () => {
  it('ранг и масть соответствуют номеру карты', () => {
    expect(rankOf(0)).toBe('2')
    expect(rankOf(12)).toBe('A')
    expect(rankOf(13)).toBe('2')
    expect(suitOf(0)).toBe('♠')
    expect(suitOf(13)).toBe('♥')
    expect(suitOf(26)).toBe('♦')
    expect(isRed(13)).toBe(true)
    expect(isRed(0)).toBe(false)
  })
  it('значения рук: туз 11/1, картинки 10', () => {
    expect(handValue([12, 11])).toBe(21)        // A + K
    expect(handValue([12, 12, 7])).toBe(21)     // A + A + 9 (второй туз уже единица)
    expect(handValue([8, 7, 12])).toBe(20)      // 10 + 9 + A
    expect(handValue([10, 10, 10])).toBe(30)    // перебор
    expect(handValue([])).toBe(0)
  })
  it('блэкджек — ровно две карты и 21', () => {
    expect(isBlackjack([12, 11])).toBe(true)
    expect(isBlackjack([9, 8, 12])).toBe(false) // 21 тремя картами — не блэкджек
    expect(isBlackjack([10, 10])).toBe(false)
  })
})
