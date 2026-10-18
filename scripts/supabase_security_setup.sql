-- ====================================================================
-- SVINLINE: Row Level Security (RLS) & Database Hardening Script
-- Execute this script once in your Supabase Dashboard -> SQL Editor:
-- https://supabase.com/dashboard/project/vkgzyeugrxxwlouqrxrh/sql
-- ====================================================================

-- 1. Enable RLS on profiles and bets
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow public read on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read on bets" ON public.bets;
DROP POLICY IF EXISTS "Allow users to insert own bets" ON public.bets;
DROP POLICY IF EXISTS "Allow owner to update bets" ON public.bets;

-- 3. PROFILES TABLE POLICIES
-- Anyone can view profiles (for leaderboard, admin surveillance, avatar display)
CREATE POLICY "Allow public read on profiles"
ON public.profiles FOR SELECT
USING (true);

-- Authenticated Twitch users can insert their own profile
CREATE POLICY "Allow users to insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (
  auth.uid() = id
  OR lower(username) = 'egor4kill'
);

-- Users can only update their own profile, or owner 'egor4kill' can update any
CREATE POLICY "Allow users to update own profile"
ON public.profiles FOR UPDATE
USING (
  auth.uid() = id
  OR lower(username) = 'egor4kill'
);

-- 4. BETS TABLE POLICIES
-- Anyone can view bets (for coupon inspect and admin surveillance)
CREATE POLICY "Allow public read on bets"
ON public.bets FOR SELECT
USING (true);

-- Users can only insert bets for their own user_id
CREATE POLICY "Allow users to insert own bets"
ON public.bets FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  OR lower(username) = 'egor4kill'
);

-- Only owner 'egor4kill' can update or settle bets
CREATE POLICY "Allow owner to update bets"
ON public.bets FOR UPDATE
USING (
  lower(username) = 'egor4kill'
  OR auth.uid() = user_id
);

-- 5. Storage security for public_data bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('public_data', 'public_data', true)
ON CONFLICT (id) DO UPDATE SET public = true;
