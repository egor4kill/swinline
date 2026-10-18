import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vkgzyeugrxxwlouqrxrh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_1eokwuqOIML2Kh4ZgfzFWA_cCi3ULkM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

// Owner username who automatically gets full ADMIN role (works via Twitch and GitHub)
export const ADMIN_USERNAME = 'egor4kill'
export const ADMIN_GITHUB_USERNAME = ADMIN_USERNAME

// Supabase admin service key for fetching full registered user list in admin panel
const SUPABASE_SERVICE_KEY = typeof window !== 'undefined' && window.localStorage?.getItem('sv_admin_secret')
  ? window.localStorage.getItem('sv_admin_secret')!
  : (typeof atob === 'function' ? atob('***REMOVED_SECRET***=') : '')

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

