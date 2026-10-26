#!/usr/bin/env node
/**
 * Применяет только раздел 16 («Шахта») из общего SQL к живому проекту Supabase.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply_mc_sql.mjs
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=xxxx node scripts/apply_mc_sql.mjs
 *
 * Токен — личный Management API токен (https://supabase.com/dashboard/account/tokens),
 * НЕ service-role ключ. Без токена скрипт умеет только показать/сохранить SQL:
 *   node scripts/apply_mc_sql.mjs --print
 *   node scripts/apply_mc_sql.mjs --write mc_migration.sql
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const master = fs.readFileSync(path.join(here, 'supabase_security_setup.sql'), 'utf8')

const marker = '-- 16. ШАХТА'
const at = master.indexOf(marker)
if (at < 0) throw new Error('В supabase_security_setup.sql не найден раздел 16')
const start = master.lastIndexOf('-- ====', at)
const sql = master.slice(start)

if (process.argv.includes('--print')) {
  process.stdout.write(sql)
  process.exit(0)
}

const writeIdx = process.argv.indexOf('--write')
if (writeIdx > 0) {
  const dest = process.argv[writeIdx + 1]
  if (!dest) throw new Error('Укажи путь после --write')
  fs.writeFileSync(dest, sql)
  console.log(`SQL раздела 16 записан в ${dest}`)
  process.exit(0)
}

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF || 'vkgzyeugrxxwlouqrxrh'
if (!token) {
  console.error('Нет SUPABASE_ACCESS_TOKEN. Получи личный токен: https://supabase.com/dashboard/account/tokens')
  console.error('Затем: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply_mc_sql.mjs')
  console.error('Либо сохрани SQL и примени вручную: node scripts/apply_mc_sql.mjs --write mc_migration.sql')
  process.exit(1)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: sql })
})

const text = await res.text()
if (!res.ok) {
  console.error(`Ошибка Management API (HTTP ${res.status}):`)
  console.error(text.slice(0, 4000))
  process.exit(1)
}

console.log(`Раздел 16 применён к проекту ${ref}. PostgREST получил NOTIFY reload schema.`)
if (text.trim()) console.log(text.slice(0, 2000))
