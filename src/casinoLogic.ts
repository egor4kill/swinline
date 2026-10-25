// «Настоящее казино»: Хряк-пот, VIP-уровни и кэшбэк.
// Константы зеркалят SQL (секция 14 в scripts/supabase_security_setup.sql).

// Джекпот: с каждой ставки 1% уходит в горшок, с шансом 1/3000 горшок целиком
// падает игроку. После срыва горшок засевается заново базовой суммой.
export const JACKPOT_SEED = 50000
export const JACKPOT_CONTRIB = 0.01
export const JACKPOT_ODDS = 1 / 3000

// VIP-уровни по обороту ставок (total_wagered). Процент кэшбэка = 3 + уровень.
export const LEVELS = [
  { min: 0, name: 'Бессовестный', color: '#9aa0a6' },
  { min: 50000, name: 'Хряк', color: '#cd7f32' },
  { min: 250000, name: 'Свин-магнат', color: '#c0c0c0' },
  { min: 1000000, name: 'Барон', color: '#ffd700' },
  { min: 5000000, name: 'Свиновладыка', color: '#ff4d6d' },
] as const

export function vipLevel(wagered: number): number {
  let lvl = 0
  for (let i = 0; i < LEVELS.length; i++) if (wagered >= LEVELS[i].min) lvl = i
  return lvl
}

export function vipName(wagered: number): string {
  return LEVELS[vipLevel(wagered)].name
}

export function cashbackPct(level: number): number {
  return 3 + Math.max(0, Math.min(LEVELS.length - 1, level))
}

/** До следующего уровня оборота (null = максимум). */
export function nextLevelGap(wagered: number): number | null {
  const lvl = vipLevel(wagered)
  if (lvl >= LEVELS.length - 1) return null
  return LEVELS[lvl + 1].min - wagered
}
