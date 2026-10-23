-- ====================================================================
-- SVINLINE: Row Level Security (RLS) & Database Hardening Script
-- Execute in Supabase Dashboard -> SQL Editor:
-- https://supabase.com/dashboard/project/vkgzyeugrxxwlouqrxrh/sql
--
-- Goal: no client (anon/authenticated) can read other users' data.
--
-- Разделы 1–6 — базовая защита (RLS profiles/bets, guard-триггеры, storage).
-- Раздел 7 — ОБЩАЯ ЛИНИЯ СОБЫТИЙ (таблица events): без неё события видит
--            только администратор в своём браузере.
-- Раздел 8 — guard на вставку ставок (только pending и только за себя).
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
--    Серверные RPC-функции (SECURITY DEFINER от postgres, раздел 9) тоже могут:
--    внутри них current_user = 'postgres'.
CREATE OR REPLACE FUNCTION public.guard_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;
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

-- ====================================================================
-- 7. SHARED EVENT LINE (новое): таблица events — общая линия для всех.
--    Без этого раздела сайт работает в локальном режиме (события видны
--    только администратору в его браузере). Выполни раздел — и линия
--    станет общей: создание/расчёт/отмена/удаление событий через Realtime
--    синхронизируются у всех игроков.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.events (
  id text PRIMARY KEY,
  data jsonb NOT NULL,                    -- объект события (название, кэфы, счёт и т.д.)
  status text NOT NULL DEFAULT 'open',    -- open | closed | done | cancel
  winner int,                             -- индекс победившего исхода (для done)
  owner_id uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Читать линию может кто угодно (включая гостей), писать — только владелец платформы
DROP POLICY IF EXISTS events_select_all ON public.events;
CREATE POLICY events_select_all
ON public.events FOR SELECT
USING (true);

DROP POLICY IF EXISTS events_write_owner ON public.events;
CREATE POLICY events_write_owner
ON public.events FOR ALL TO authenticated
USING (public.is_platform_owner())
WITH CHECK (public.is_platform_owner());

-- Владелец определяется по нику в profiles (регистр не важен).
-- Уникальный индекс ниже не даст создать второй профиль с ником egor4kill.
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(username) = 'egor4kill'
  );
$$;

-- Один ник — один профиль (защита от вставки фейкового 'egor4kill').
-- Если индекс падает из-за дублей — сначала почисти таблицу profiles от повторов.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
ON public.profiles (lower(username));

-- Realtime: события линии — всем игрокам; profiles/bets — для синхронизации
-- своего профиля и ставок между вкладками/устройствами (RLS отдаёт только свои строки)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.events; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bets; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;

-- ====================================================================
-- 8. BETS INSERT GUARD (новое): клиенты могут вставлять только корректные
--    pending-ставки за себя. Расчёт ставок — только сервисной ролью.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.guard_bet_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'bet user_id must match auth.uid()';
  END IF;
  IF coalesce(NEW.stake, 0) <= 0 THEN
    RAISE EXCEPTION 'bet stake must be positive';
  END IF;
  IF coalesce(NEW.odds, 0) <= 0 THEN
    RAISE EXCEPTION 'bet odds must be positive';
  END IF;
  NEW.status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_bet_insert ON public.bets;
CREATE TRIGGER guard_bet_insert
BEFORE INSERT ON public.bets
FOR EACH ROW EXECUTE FUNCTION public.guard_bet_insert();

-- ====================================================================
-- 9. ADMIN RPC (новое): серверные функции админ-панели.
--    Вызывать может только владелец платформы (is_platform_owner());
--    функции SECURITY DEFINER, поэтому RLS и guard-триггеры им не мешают.
--    Клиент вызывает их как supabase.rpc('admin_top_up', {...}) и т.д.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.admin_top_up(p_target uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может начислять баланс';
  END IF;
  UPDATE public.profiles SET bal = greatest(0, bal + p_amount), updated_at = now()
  WHERE id = p_target
  RETURNING bal INTO v_new;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_balance(p_target uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может обнулять баланс';
  END IF;
  UPDATE public.profiles SET bal = 0, updated_at = now()
  WHERE id = p_target
  RETURNING bal INTO v_new;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Игрок не найден';
  END IF;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_blocked(p_target uuid, p_blocked boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может блокировать игроков';
  END IF;
  IF p_target = auth.uid() THEN
    RAISE EXCEPTION 'Нельзя блокировать аккаунт владельца';
  END IF;
  UPDATE public.profiles SET is_blocked = p_blocked, updated_at = now()
  WHERE id = p_target AND lower(username) <> 'egor4kill';
  RETURN FOUND;
END;
$$;

-- Полное удаление игрока: ставки, профиль и аккаунт авторизации
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может удалять игроков';
  END IF;
  IF p_target = auth.uid() THEN
    RAISE EXCEPTION 'Нельзя удалить аккаунт владельца';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target AND lower(username) = 'egor4kill') THEN
    RAISE EXCEPTION 'Нельзя удалить аккаунт владельца';
  END IF;
  DELETE FROM public.bets WHERE user_id = p_target;
  DELETE FROM public.profiles WHERE id = p_target;
  DELETE FROM auth.users WHERE id = p_target;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Расчёт ставок события в базе: p_winner = индекс исхода (won/lost), NULL = отмена (refund)
CREATE OR REPLACE FUNCTION public.admin_settle_bets(p_event text, p_winner integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_win_pick text;
  v_count integer := 0;
  v_rows integer;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может рассчитывать события';
  END IF;
  IF p_winner IS NOT NULL THEN
    SELECT data->'out'->p_winner->>0 INTO v_win_pick FROM public.events WHERE id = p_event;
    IF v_win_pick IS NULL THEN
      RAISE EXCEPTION 'Событие или исход не найдены';
    END IF;
    UPDATE public.bets SET status = 'won', payout = round(stake * odds, 2)
    WHERE event_id = p_event AND status = 'pending' AND coalesce(pick, pick_name) = v_win_pick;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
    UPDATE public.bets SET status = 'lost', payout = 0
    WHERE event_id = p_event AND status = 'pending';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  ELSE
    UPDATE public.bets SET status = 'refund', payout = stake
    WHERE event_id = p_event AND status = 'pending';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.admin_top_up(uuid, numeric),
  public.admin_reset_balance(uuid),
  public.admin_set_blocked(uuid, boolean),
  public.admin_delete_user(uuid),
  public.admin_settle_bets(text, integer)
TO authenticated, anon;
