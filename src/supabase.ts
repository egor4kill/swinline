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

// GitHub username of the repository owner who automatically gets full ADMIN role
export const ADMIN_GITHUB_USERNAME = 'egor4kill'
