// Архиватор истории игр SWINLINE.
// Забирает у archive_take() всё, что старше последних 10 попыток (он же удаляет это из БД),
// красиво форматирует в Markdown и складывает в приватный бакет Supabase Storage «history»
// (файл на месяц: game-history-YYYY-MM.md, время московское).
// Запускается воркфлоу .github/workflows/archive.yml каждые 15 минут.
const SUPA_URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = 'history'

const RISK_LABEL = { low: 'Тихое корыто', mid: 'Грязь', high: 'Бешеный хряк' }
const GAME_EMOJI = { wheel: '🎡', plinko: '🐷', puddles: '🟤', crash: '🚀', ruble: '📉' }
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const msk = (d, opts) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', ...opts }).format(new Date(d))
const hhmm = d => msk(d, { hour: '2-digit', minute: '2-digit', hour12: false })
const dateKey = d => msk(d, { year: 'numeric', month: '2-digit', day: '2-digit' })
const dateTitle = d => {
  const p = msk(d, { day: 'numeric', month: 'numeric', year: 'numeric' }).split('.')
  return `${Number(p[0])} ${MONTHS[Number(p[1]) - 1]} ${p[2]}`
}
const monthFile = d => {
  const p = dateKey(d).split('.') // dd.mm.yyyy
  return `game-history-${p[2]}-${p[1]}.md`
}
const monthTitle = d => {
  const p = dateKey(d).split('.')
  return `${MONTHS_NOM[Number(p[1]) - 1]} ${p[2]}`
}
const num = v => (v === null || v === undefined ? null : Number(v))
const fmt = n => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })

async function api(path, init = {}) {
  const res = await fetch(`${SUPA_URL}${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...(init.headers || {}) }
  })
  return res
}

async function uploadWithRetry(path, body) {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await api(`/storage/v1/object/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'x-upsert': 'true' },
        body
      })
      if (res.ok) return true
      console.error(`upload attempt ${i}: HTTP ${res.status} ${await res.text()}`)
    } catch (e) {
      console.error(`upload attempt ${i} failed:`, e.message)
    }
    await new Promise(r => setTimeout(r, 2000 * i))
  }
  return false
}

function formatEntries(batch, users) {
  const nameOf = id => users.get(id) || (id || '').slice(0, 8)
  const betsByRound = new Map()
  for (const b of batch.crash_bets || []) {
    if (!betsByRound.has(b.round_id)) betsByRound.set(b.round_id, [])
    betsByRound.get(b.round_id).push(b)
  }

  const entries = []
  for (const r of batch.crash_rounds || []) {
    const lines = [`${hhmm(r.start_at)} ${GAME_EMOJI.crash} Крэш — раунд #${r.id}: **${num(r.crash_point)}x**`]
    for (const b of betsByRound.get(r.id) || []) {
      const stake = num(b.stake)
      const cashed = num(b.cashed_out_mul)
      const win = num(b.win_amount)
      const auto = num(b.auto_cashout)
      const tail = cashed !== null
        ? `${auto !== null && auto === cashed ? `авто-вывод x${cashed}` : `вывел x${cashed}`} (+${fmt(win)})`
        : 'сгорела 💥'
      lines.push(`   - ${b.username || nameOf(b.user_id)}: ставка ${fmt(stake)}, ${tail}`)
    }
    entries.push({ at: r.start_at, lines })
  }

  for (const a of batch.attempts || []) {
    const r = a.result || {}
    const u = nameOf(a.user_id)
    let text
    if (a.game === 'wheel') {
      const win = num(r.win) || 0
      text = `${hhmm(a.created_at)} ${GAME_EMOJI.wheel} Колесо — ${u}: ставка ${fmt(r.stake)}, сектор x${num(r.mul)}, ${win > 0 ? `**+${fmt(win)}**` : 'мимо'}`
    } else if (a.game === 'plinko') {
      const win = num(r.win) || 0
      text = `${hhmm(a.created_at)} ${GAME_EMOJI.plinko} Плинко — ${u}: ставка ${fmt(r.stake)} (${RISK_LABEL[r.risk] || r.risk}), ячейка ${r.slot}, x${num(r.mul)}, ${win > 0 ? `**+${fmt(win)}**` : 'мимо'}`
    } else if (a.game === 'ruble') {
      const win = num(r.win) || 0
      const start0 = num(r.start) || 100
      const pct = Math.round(((num(r.final) - start0) / start0) * 10000) / 100
      text = `${hhmm(a.created_at)} ${GAME_EMOJI.ruble} Курс рубля — ${u}: ставка ${fmt(r.stake)} на «${r.side === 'up' ? 'вверх' : 'вниз'}», итог ${pct > 0 ? '+' : ''}${pct}%, ${win > 0 ? `**+${fmt(win)}**` : 'мимо'}`
    } else if (a.game === 'puddles') {
      const base = `${hhmm(a.created_at)} ${GAME_EMOJI.puddles} Лужи — ${u}: ставка ${fmt(r.stake)}, ${r.mines} луж, `
      if (r.outcome === 'lost') text = base + `открыл ${r.opened || 0}, попал в лужу (−${fmt(r.stake)})`
      else text = base + `открыл ${r.opened || 0}, забрал x${num(r.mul)} (**+${fmt(r.win)}**)`
    } else {
      text = `${hhmm(a.created_at)} ${a.game} — ${u}: ${JSON.stringify(r)}`
    }
    entries.push({ at: a.created_at, lines: [text] })
  }

  for (const p of batch.puddles || []) {
    const u = nameOf(p.user_id)
    const opened = Array.isArray(p.opened) ? p.opened.length : 0
    const tail = p.status === 'lost' ? `попал в лужу (−${fmt(p.stake)})` : 'забрал выигрыш'
    entries.push({ at: p.created_at, lines: [`${hhmm(p.created_at)} ${GAME_EMOJI.puddles} Лужи — ${u}: ставка ${fmt(p.stake)}, ${p.mines_count} луж, открыл ${opened}, ${tail}`] })
  }

  entries.sort((a, b) => new Date(a.at) - new Date(b.at))

  // группировка по датам (МСК)
  const byDate = new Map()
  for (const e of entries) {
    const k = dateKey(e.at)
    if (!byDate.has(k)) byDate.set(k, { title: dateTitle(e.at), lines: [] })
    byDate.get(k).lines.push(...e.lines)
  }
  return [...byDate.entries()].map(([k, v]) => v)
}

async function run() {
  if (!KEY || !SUPA_URL) {
    console.log('SUPABASE_SERVICE_KEY/SUPABASE_URL не заданы — архивация пропущена')
    return
  }

  // 1) забрать партию на архивацию (функция сразу удаляет её из БД)
  const takeRes = await api('/rest/v1/rpc/archive_take', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  if (!takeRes.ok) throw new Error(`archive_take: HTTP ${takeRes.status} ${await takeRes.text()}`)
  const batch = await takeRes.json()
  const total = (batch.crash_rounds?.length || 0) + (batch.attempts?.length || 0) + (batch.puddles?.length || 0)
  if (total === 0) {
    console.log('Нечего архивировать: в базе только свежие данные')
    return
  }
  console.log(`Архивируем: раундов крэша ${batch.crash_rounds?.length || 0}, попыток ${batch.attempts?.length || 0}, раундов луж ${batch.puddles?.length || 0}`)

  // 2) ники игроков для документа
  const users = new Map()
  try {
    const u = await api('/rest/v1/profiles?select=id,username')
    if (u.ok) for (const p of await u.json()) users.set(p.id, p.username)
  } catch (e) { console.warn('profiles fetch failed:', e.message) }

  // 3) форматирование
  const days = formatEntries(batch, users)
  const now = Date.now()
  const file = monthFile(now)
  const month = monthTitle(now)
  const header = `# 🐷 История игр SWINLINE — ${month}\n\nВ базе данных хранятся только последние 10 попыток каждой игры. Всё, что ниже, выгружено автоматически (время московское).\n`

  // 4) бакет (приватный) + существующий документ
  const bucketRes = await api('/storage/v1/bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BUCKET, public: false })
  })
  if (!bucketRes.ok && bucketRes.status !== 409 && bucketRes.status !== 400) {
    console.warn(`bucket: HTTP ${bucketRes.status}`)
  }

  let doc = header
  const existing = await api(`/storage/v1/object/${BUCKET}/${file}`)
  if (existing.ok) {
    doc = await existing.text()
  }

  // 5) дописываем дни (каждая дата — своя секция, внутри по порядку времени)
  for (const day of days) {
    let section = `\n## ${day.title}\n\n`
    const existingSection = doc.includes(`## ${day.title}`)
    if (!existingSection) {
      doc += `${section}${day.lines.join('\n')}\n`
    } else {
      // дата уже есть — вставляем строки в конец её секции
      const marker = `## ${day.title}`
      const idx = doc.indexOf(marker)
      const nextIdx = doc.indexOf('\n## ', idx + marker.length)
      const insertAt = nextIdx === -1 ? doc.length : nextIdx
      doc = doc.slice(0, insertAt).replace(/\n*$/, '\n\n') + day.lines.join('\n') + '\n' + (nextIdx === -1 ? '' : doc.slice(insertAt).replace(/^\n*/, '\n'))
    }
  }

  // 6) загрузка с ретраями
  const ok = await uploadWithRetry(`${BUCKET}/${encodeURIComponent(file)}`, doc)
  if (!ok) {
    console.error('!!! Не удалось загрузить документ — партия УЖЕ удалена из базы и возвращена только в этом логе:')
    console.error(JSON.stringify(batch))
    process.exit(1)
  }
  console.log(`Документ обновлён: ${BUCKET}/${file} (+${total} записей)`)

  // 7) дублируем на Google Drive, если подключён вебхук Apps Script
  //    (DRIVE_WEBHOOK_URL = https://script.google.com/macros/s/.../exec?token=...)
  const hook = process.env.DRIVE_WEBHOOK_URL
  if (hook) {
    try {
      const res = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file, content: doc }),
        redirect: 'follow'
      })
      const text = await res.text()
      if (res.ok) console.log(`Google Drive: документ «${file}» обновлён`)
      else console.error(`Google Drive: HTTP ${res.status} ${text.slice(0, 150)}`)
    } catch (e) {
      console.error('Google Drive upload failed:', e.message)
    }
  }

  // 8) чистим Storage: в Supabase держим только текущий месячный документ
  //    (полная история остаётся на Google Drive; старые месяцы здесь не нужны)
  try {
    const listRes = await api(`/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 100 })
    })
    if (listRes.ok) {
      const objects = await listRes.json()
      const stale = objects.filter(o => o.name !== file)
      for (const o of stale) {
        const del = await api(`/storage/v1/object/${BUCKET}/${encodeURIComponent(o.name)}`, { method: 'DELETE' })
        console.log(`Storage cleanup: ${o.name} → ${del.ok ? 'удалён' : 'HTTP ' + del.status}`)
      }
    }
  } catch (e) {
    console.error('Storage cleanup failed:', e.message)
  }
}

run().catch(e => { console.error('Archive failed:', e.message); process.exit(1) })
