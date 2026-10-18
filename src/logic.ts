import { EVENTS, MINBET, type Ev } from './data'

export function r2(x: number) {
  return Math.round(x * 100) / 100
}

export function payout(stake: number, odds: number) {
  return r2(stake * odds)
}

export function validateStake(stake: number, balance: number) {
  if (!isFinite(stake) || stake <= 0) return 'Введи сумму больше нуля'
  if (stake < MINBET) return 'Минимальная ставка: ' + MINBET + ' SV₽'
  if (stake > balance) return 'Недостаточно SV₽ на балансе'
  return ''
}

export function placeBet(s: any, evId: string, i: number, stake: number, eventsList: Ev[] = EVENTS) {
  const ev = eventsList.find(e => e.id === evId) || EVENTS.find(e => e.id === evId)
  if (!ev) return { err: 'Событие не найдено' }
  if ((s.st[evId] || { s: 'open' }).s !== 'open') return { err: 'Приём ставок закрыт' }
  const e = validateStake(stake, s.bal)
  if (e) return { err: e }
  s.bal = r2(s.bal - stake)
  const b = {
    id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
    ev: evId,
    i: i,
    stake: stake,
    odds: ev.out[i][1],
    state: 'open'
  }
  s.bets.unshift(b)
  s.log.unshift({ t: Date.now(), x: 'Ставка: ' + ev.title + ' (' + ev.out[i][0] + ')', d: -stake })
  return { ok: b }
}

export function settleEvent(s: any, evId: string, win: number, eventsList: Ev[] = EVENTS) {
  const ev = eventsList.find(e => e.id === evId) || EVENTS.find(e => e.id === evId)
  s.st[evId] = { s: 'done', w: win }
  s.bets.forEach((b: any) => {
    if (b.ev !== evId || b.state !== 'open') return
    if (b.i === win) {
      const p = payout(b.stake, b.odds)
      s.bal = r2(s.bal + p)
      b.state = 'won'
      s.log.unshift({ t: Date.now(), x: 'Выигрыш: ' + (ev ? ev.title : evId), d: p })
    } else {
      b.state = 'lost'
      s.log.unshift({ t: Date.now(), x: 'Проигрыш: ' + (ev ? ev.title : evId), d: 0 })
    }
  })
}

export function cancelEvent(s: any, evId: string, eventsList: Ev[] = EVENTS) {
  const ev = eventsList.find(e => e.id === evId) || EVENTS.find(e => e.id === evId)
  s.st[evId] = { s: 'cancel' }
  s.bets.forEach((b: any) => {
    if (b.ev !== evId || b.state !== 'open') return
    s.bal = r2(s.bal + b.stake)
    b.state = 'refund'
    s.log.unshift({ t: Date.now(), x: 'Возврат (событие отменено): ' + (ev ? ev.title : evId), d: b.stake })
  })
}
