-- ====================================================================
-- SVINLINE: Row Level Security (RLS) & Database Hardening Script
-- Execute in Supabase Dashboard -> SQL Editor:
-- https://supabase.com/dashboard/project/vkgzyeugrxxwlouqrxrh/sql
--
-- Goal: no client (anon/authenticated) can read other users' data.
-- ====================================================================

-- 1. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies on profiles/bets (including legacy permissive ones)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'bets')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3. PROFILES: each user can only read/insert/update their OWN row
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. BETS: each user can only read/insert their OWN bets.
--    No client UPDATE/DELETE at all (settlement only via service role).
CREATE POLICY "bets_select_own"
ON public.bets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "bets_insert_own"
ON public.bets FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 5. Guard privileged profile columns against privilege escalation.
--    Only service_role (and SQL editor) may change role/username/is_blocked.
CREATE OR REPLACE FUNCTION public.guard_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
    RAISE EXCEPTION 'privileged profile columns are read-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_columns ON public.profiles;
CREATE TRIGGER guard_profile_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_columns();

CREATE OR REPLACE FUNCTION public.guard_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  NEW.role := 'user';
  NEW.is_blocked := false;
  NEW.bal := 10000;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_insert ON public.profiles;
CREATE TRIGGER guard_profile_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_insert();

-- 6. Storage: keep public_data PRIVATE and deny clients entirely.
INSERT INTO storage.buckets (id, name, public)
VALUES ('public_data', 'public_data', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "public_data_deny_clients" ON storage.objects;
CREATE POLICY "public_data_deny_clients"
ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (bucket_id <> 'public_data')
WITH CHECK (bucket_id <> 'public_data');
