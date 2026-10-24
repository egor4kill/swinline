import { createClient } from '@supabase/supabase-js'

// Параметры берутся из переменных окружения (см. .env.example), в репозитории их нет.
// Это публичные по дизайну значения любого Supabase-приложения: они попадают в собранный
// бандл сайта, а данные защищает RLS на сервере (scripts/supabase_security_setup.sql).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

// Ник владельца платформы — автоматический ADMIN (работает через Twitch и GitHub)
export const ADMIN_USERNAME = (import.meta.env.VITE_ADMIN_USERNAME as string) || 'owner'
