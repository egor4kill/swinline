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
-- Раздел 9 — серверные RPC админ-панели (admin_*).
-- Раздел 10 — ОБЩИЙ ДВИЖОК ХРЯК-КРЭША + серверная экономика игр:
--            общие раунды (crash_rounds/crash_secrets/crash_bets), лужи,
--            колесо, плинко, ежедневки, free-money и спорт-ставки —
--            все операции с балансом выполняет только сервер.
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
-- SVINLINE/SWINLINE: раздел 10 — общий движок Крэша + серверная экономика игр
-- (запускается через Management API; источник истины — scripts/supabase_security_setup.sql)

-- 10.1 CRASH: раунды (публично, без точки краша до момента краша)
CREATE TABLE IF NOT EXISTS public.crash_rounds (
  id bigint PRIMARY KEY,
  start_at timestamptz NOT NULL,
  betting_seconds int NOT NULL DEFAULT 6,
  crashed boolean NOT NULL DEFAULT false,
  crash_point numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crash_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crash_rounds_select_all ON public.crash_rounds;
CREATE POLICY crash_rounds_select_all ON public.crash_rounds FOR SELECT USING (true);

-- секретные точки краша: клиентам недоступны (политик нет)
CREATE TABLE IF NOT EXISTS public.crash_secrets (
  round_id bigint PRIMARY KEY REFERENCES public.crash_rounds(id) ON DELETE CASCADE,
  point numeric(10,2) NOT NULL
);
ALTER TABLE public.crash_secrets ENABLE ROW LEVEL SECURITY;

-- общие ставки на раунд: видят все
CREATE TABLE IF NOT EXISTS public.crash_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id bigint NOT NULL REFERENCES public.crash_rounds(id),
  user_id uuid NOT NULL,
  username text NOT NULL,
  avatar text,
  stake numeric NOT NULL,
  auto_cashout numeric,
  cashed_out_mul numeric,
  win_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crash_bets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crash_bets_select_all ON public.crash_bets;
CREATE POLICY crash_bets_select_all ON public.crash_bets FOR SELECT USING (true);
CREATE UNIQUE INDEX IF NOT EXISTS crash_bets_one_per_user ON public.crash_bets (round_id, user_id);

-- 10.2 формулы (зеркало src/crashLogic.ts)
CREATE OR REPLACE FUNCTION public.crash_mult(p_t double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 1.0 + 0.06 * p_t + 0.022 * power(p_t, 1.8)
$$;

CREATE OR REPLACE FUNCTION public.crash_flight_seconds(p_point double precision)
RETURNS double precision LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_lo double precision := 0;
  v_hi double precision := 300;
  v_mid double precision;
  v_i integer;
BEGIN
  FOR v_i IN 1..80 LOOP
    v_mid := (v_lo + v_hi) / 2;
    IF public.crash_mult(v_mid) >= p_point THEN v_hi := v_mid; ELSE v_lo := v_mid; END IF;
  END LOOP;
  RETURN v_hi;
END $$;

CREATE OR REPLACE FUNCTION public.crash_gen_point()
RETURNS numeric LANGUAGE plpgsql VOLATILE AS $$
DECLARE v_r double precision := random();
BEGIN
  IF v_r < 0.03 THEN RETURN 1.00; END IF;
  RETURN round(least(25.0, greatest(1.01, 0.96 / (1.0 - v_r * 0.96)))::numeric, 2);
END $$;

-- авто-выводы закончившегося раунда (идемпотентно)
CREATE OR REPLACE FUNCTION public.crash_settle_round(p_round bigint)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_point numeric;
  v_count integer := 0;
BEGIN
  SELECT point INTO v_point FROM public.crash_secrets WHERE round_id = p_round;
  IF v_point IS NULL THEN RETURN 0; END IF;
  WITH cashed AS (
    UPDATE public.crash_bets
    SET cashed_out_mul = auto_cashout, win_amount = round(stake * auto_cashout, 2)
    WHERE round_id = p_round AND cashed_out_mul IS NULL
      AND auto_cashout IS NOT NULL AND auto_cashout <= v_point
    RETURNING user_id, win_amount
  ), credited AS (
    UPDATE public.profiles p SET bal = p.bal + c.total, updated_at = now()
    FROM (SELECT user_id, sum(win_amount) AS total FROM cashed GROUP BY user_id) c
    WHERE p.id = c.user_id
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM cashed;
  RETURN v_count;
END $$;

-- цепочка раундов: гарантирует актуальный раунд, рассчитывает закончившиеся
CREATE OR REPLACE FUNCTION public.crash_ensure_current()
RETURNS public.crash_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.crash_rounds%rowtype;
  v_secret numeric;
  v_end timestamptz;
  v_start timestamptz;
  v_i integer := 0;
BEGIN
  LOOP
    v_i := v_i + 1;
    IF v_i > 100 THEN RAISE EXCEPTION 'crash_ensure_current: loop limit'; END IF;

    SELECT * INTO v_round FROM public.crash_rounds ORDER BY id DESC LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.crash_rounds (id, start_at) VALUES (1, now()) ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.crash_secrets (round_id, point) VALUES (1, public.crash_gen_point()) ON CONFLICT (round_id) DO NOTHING;
      CONTINUE;
    END IF;

    SELECT point INTO v_secret FROM public.crash_secrets WHERE round_id = v_round.id;

    IF v_secret IS NULL THEN
      -- раунд без секета (крайний случай обрыва вставки) — чиним и продолжаем
      INSERT INTO public.crash_secrets (round_id, point) VALUES (v_round.id, public.crash_gen_point()) ON CONFLICT (round_id) DO NOTHING;
      CONTINUE;
    END IF;

    IF NOT v_round.crashed AND now() >= v_round.start_at + make_interval(secs => v_round.betting_seconds) THEN
      IF public.crash_mult(extract(epoch FROM (now() - v_round.start_at - make_interval(secs => v_round.betting_seconds)))) >= v_secret THEN
        UPDATE public.crash_rounds SET crashed = true, crash_point = v_secret WHERE id = v_round.id AND NOT crashed;
        v_round.crashed := true;
        v_round.crash_point := v_secret;
        PERFORM public.crash_settle_round(v_round.id);
      END IF;
    END IF;

    v_end := v_round.start_at + make_interval(secs => v_round.betting_seconds + public.crash_flight_seconds(v_secret::double precision) + 3.2);

    IF now() < v_end THEN
      RETURN v_round;
    END IF;

    PERFORM public.crash_settle_round(v_round.id);

    IF now() >= v_end + make_interval(secs => 60) THEN
      v_start := now();
    ELSE
      v_start := v_end;
    END IF;

    INSERT INTO public.crash_rounds (id, start_at) VALUES (v_round.id + 1, v_start) ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.crash_secrets (round_id, point) VALUES (v_round.id + 1, public.crash_gen_point()) ON CONFLICT (round_id) DO NOTHING;
  END LOOP;
END $$;

-- опрос состояния клиентами
CREATE OR REPLACE FUNCTION public.crash_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_round public.crash_rounds%rowtype;
BEGIN
  v_round := public.crash_ensure_current();
  RETURN jsonb_build_object(
    'id', v_round.id,
    'start_at', v_round.start_at,
    'betting_seconds', v_round.betting_seconds,
    'crashed', v_round.crashed,
    'crash_point', v_round.crash_point,
    'now', now()
  );
END $$;

CREATE OR REPLACE FUNCTION public.crash_place_bet(p_round bigint, p_stake numeric, p_auto numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.crash_rounds%rowtype;
  v_bal numeric;
  v_username text;
  v_avatar text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_round FROM public.crash_rounds WHERE id = p_round;
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF now() < v_round.start_at OR now() >= v_round.start_at + make_interval(secs => v_round.betting_seconds) THEN
    RAISE EXCEPTION 'Приём ставок на этот раунд закрыт';
  END IF;
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  IF p_auto IS NOT NULL AND p_auto < 1.05 THEN RAISE EXCEPTION 'Авто-вывод — не меньше x1.05'; END IF;
  SELECT bal, username, avatar INTO v_bal, v_username, v_avatar FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽ на балансе'; END IF;
  UPDATE public.profiles SET bal = bal - p_stake, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.crash_bets (round_id, user_id, username, avatar, stake, auto_cashout)
    VALUES (p_round, auth.uid(), v_username, v_avatar, p_stake, p_auto);
  RETURN jsonb_build_object('bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.crash_cancel_bet(p_round bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.crash_rounds%rowtype;
  v_bet public.crash_bets%rowtype;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_bet FROM public.crash_bets WHERE round_id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Ставки на этот раунд нет'; END IF;
  IF v_bet.cashed_out_mul IS NOT NULL THEN RAISE EXCEPTION 'Вывод уже сделан'; END IF;
  SELECT * INTO v_round FROM public.crash_rounds WHERE id = p_round;
  IF now() >= v_round.start_at + make_interval(secs => v_round.betting_seconds) THEN
    RAISE EXCEPTION 'Раунд уже стартовал — отменить нельзя';
  END IF;
  DELETE FROM public.crash_bets WHERE id = v_bet.id;
  UPDATE public.profiles SET bal = bal + v_bet.stake, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  RETURN jsonb_build_object('bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.crash_cashout(p_round bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.crash_rounds%rowtype;
  v_secret numeric;
  v_bet public.crash_bets%rowtype;
  v_elapsed double precision;
  v_mul numeric;
  v_win numeric;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_bet FROM public.crash_bets WHERE round_id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Ставки на этот раунд нет'; END IF;
  IF v_bet.cashed_out_mul IS NOT NULL THEN RAISE EXCEPTION 'Вывод уже сделан'; END IF;
  SELECT * INTO v_round FROM public.crash_rounds WHERE id = p_round;
  SELECT point INTO v_secret FROM public.crash_secrets WHERE round_id = p_round;
  v_elapsed := extract(epoch FROM (now() - (v_round.start_at + make_interval(secs => v_round.betting_seconds))));
  IF v_elapsed < 0 THEN RAISE EXCEPTION 'Раунд ещё не стартовал'; END IF;
  IF public.crash_mult(v_elapsed) >= v_secret THEN
    UPDATE public.crash_rounds SET crashed = true, crash_point = v_secret WHERE id = p_round AND NOT crashed;
    PERFORM public.crash_settle_round(p_round);
    RAISE EXCEPTION 'Ракета уже упала — вывод невозможен';
  END IF;
  v_mul := round(least(public.crash_mult(v_elapsed), v_secret)::numeric, 2);
  v_win := round(v_bet.stake * v_mul, 2);
  UPDATE public.crash_bets SET cashed_out_mul = v_mul, win_amount = v_win WHERE id = v_bet.id;
  UPDATE public.profiles SET bal = bal + v_win, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  RETURN jsonb_build_object('mul', v_mul, 'win', v_win, 'bal', v_bal);
END $$;

-- 10.3 колесо (16 секторов — зеркало SECTORS из src/wheelLogic.ts)
CREATE OR REPLACE FUNCTION public.wheel_spin()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_idx integer;
  v_mul numeric;
  v_muls numeric[] := ARRAY[0,0.5,0,1.2,0,0.5,0,1.2,0,0.5,0,1.0,0,0.5,0,10];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < 100 THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;
  v_idx := floor(random() * array_length(v_muls, 1))::int;
  v_mul := v_muls[v_idx + 1];
  UPDATE public.profiles
    SET bal = bal - 100 + round(100 * v_mul, 2), updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  RETURN jsonb_build_object('sector', v_idx, 'mul', v_mul, 'win', round(100 * v_mul, 2), 'bal', v_bal);
END $$;

-- 10.4 плинко (таблицы — зеркало TABLES из src/plinkoLogic.ts)
CREATE OR REPLACE FUNCTION public.plinko_drop(p_stake numeric, p_risk text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_slot integer := 0;
  v_i integer;
  v_mul numeric;
  v_low  numeric[] := ARRAY[6.6,3.3,1.9,1.3,1.1,1,0.5,1,1.1,1.3,1.9,3.3,6.6];
  v_mid  numeric[] := ARRAY[21,6.5,2.8,1.4,1,0.8,0.5,0.8,1,1.4,2.8,6.5,21];
  v_high numeric[] := ARRAY[65,15,4.2,1.9,0.9,0.6,0.3,0.6,0.9,1.9,4.2,15,65];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  IF p_risk NOT IN ('low', 'mid', 'high') THEN RAISE EXCEPTION 'Неизвестный уровень риска'; END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;
  FOR v_i IN 1..12 LOOP
    IF random() < 0.5 THEN v_slot := v_slot + 1; END IF;
  END LOOP;
  v_mul := CASE p_risk
    WHEN 'low' THEN v_low[v_slot + 1]
    WHEN 'mid' THEN v_mid[v_slot + 1]
    ELSE v_high[v_slot + 1]
  END;
  UPDATE public.profiles
    SET bal = bal - p_stake + round(p_stake * v_mul, 2), updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  RETURN jsonb_build_object('slot', v_slot, 'mul', v_mul, 'win', round(p_stake * v_mul, 2), 'bal', v_bal);
END $$;

-- 10.5 грязевые лужи (раскладка скрыта на сервере)
CREATE TABLE IF NOT EXISTS public.puddles_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stake numeric NOT NULL,
  mines_count integer NOT NULL,
  opened integer[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'play',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.puddles_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS puddles_select_own ON public.puddles_rounds;
CREATE POLICY puddles_select_own ON public.puddles_rounds FOR SELECT USING (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS puddles_one_active ON public.puddles_rounds (user_id) WHERE status = 'play';

CREATE TABLE IF NOT EXISTS public.puddles_secrets (
  round_id uuid PRIMARY KEY REFERENCES public.puddles_rounds(id) ON DELETE CASCADE,
  mines integer[] NOT NULL
);
ALTER TABLE public.puddles_secrets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.puddles_multiplier(p_mines integer, p_opened integer)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_p double precision := 1.0;
  v_i integer;
BEGIN
  IF p_opened <= 0 THEN RETURN 1; END IF;
  FOR v_i IN 0..(p_opened - 1) LOOP
    v_p := v_p * (25.0 - v_i) / (25.0 - p_mines - v_i);
  END LOOP;
  RETURN floor(v_p * 0.97 * 100) / 100;
END $$;

CREATE OR REPLACE FUNCTION public.puddles_start(p_stake numeric, p_mines integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_id uuid;
  v_cells integer[] := ARRAY[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24];
  v_i integer; v_j integer; v_tmp integer;
  v_mines integer[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  IF p_mines < 1 OR p_mines > 24 THEN RAISE EXCEPTION 'Луж должно быть от 1 до 24'; END IF;
  IF EXISTS (SELECT 1 FROM public.puddles_rounds WHERE user_id = auth.uid() AND status = 'play') THEN
    RAISE EXCEPTION 'Сначала заверши текущий раунд';
  END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;
  FOR v_i IN REVERSE 24..1 LOOP
    v_j := floor(random() * (v_i + 1))::int;
    v_tmp := v_cells[v_i + 1]; v_cells[v_i + 1] := v_cells[v_j + 1]; v_cells[v_j + 1] := v_tmp;
  END LOOP;
  v_mines := v_cells[1:p_mines];
  UPDATE public.profiles SET bal = bal - p_stake, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.puddles_rounds (user_id, stake, mines_count) VALUES (auth.uid(), p_stake, p_mines) RETURNING id INTO v_id;
  INSERT INTO public.puddles_secrets (round_id, mines) VALUES (v_id, v_mines);
  RETURN jsonb_build_object('round_id', v_id, 'bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.puddles_pick(p_round uuid, p_cell integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.puddles_rounds%rowtype;
  v_mines integer[];
  v_opened integer[];
  v_mul numeric;
  v_win numeric;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_round FROM public.puddles_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раунд уже завершён'; END IF;
  IF p_cell < 0 OR p_cell > 24 THEN RAISE EXCEPTION 'Клетка за пределами поля'; END IF;
  IF p_cell = ANY (v_round.opened) THEN RAISE EXCEPTION 'Клетка уже открыта'; END IF;
  SELECT mines INTO v_mines FROM public.puddles_secrets WHERE round_id = p_round;

  IF p_cell = ANY (v_mines) THEN
    UPDATE public.puddles_rounds SET status = 'lost' WHERE id = p_round;
    RETURN jsonb_build_object('hit', true, 'mines', v_mines, 'opened', v_round.opened);
  END IF;

  UPDATE public.puddles_rounds SET opened = opened || p_cell WHERE id = p_round RETURNING opened INTO v_opened;

  IF array_length(v_opened, 1) >= 25 - v_round.mines_count THEN
    v_mul := public.puddles_multiplier(v_round.mines_count, array_length(v_opened, 1));
    v_win := round(v_round.stake * v_mul, 2);
    UPDATE public.puddles_rounds SET status = 'cashed' WHERE id = p_round;
    UPDATE public.profiles SET bal = bal + v_win, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
    RETURN jsonb_build_object('hit', false, 'opened', v_opened, 'auto_cashed', true, 'mul', v_mul, 'win', v_win, 'bal', v_bal, 'mines', v_mines);
  END IF;

  RETURN jsonb_build_object('hit', false, 'opened', v_opened);
END $$;

CREATE OR REPLACE FUNCTION public.puddles_cash(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.puddles_rounds%rowtype;
  v_mines integer[];
  v_mul numeric;
  v_win numeric;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_round FROM public.puddles_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раунд уже завершён'; END IF;
  IF array_length(v_round.opened, 1) < 1 THEN RAISE EXCEPTION 'Сначала открой хотя бы одну клетку'; END IF;
  SELECT mines INTO v_mines FROM public.puddles_secrets WHERE round_id = p_round;
  v_mul := public.puddles_multiplier(v_round.mines_count, array_length(v_round.opened, 1));
  v_win := round(v_round.stake * v_mul, 2);
  UPDATE public.puddles_rounds SET status = 'cashed' WHERE id = p_round;
  UPDATE public.profiles SET bal = bal + v_win, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  RETURN jsonb_build_object('mul', v_mul, 'win', v_win, 'bal', v_bal, 'mines', v_mines);
END $$;

-- 10.6 ежедневные награды (сервер, а не localStorage)
CREATE TABLE IF NOT EXISTS public.daily_claims (
  user_id uuid PRIMARY KEY,
  streak integer NOT NULL DEFAULT 0,
  last_claim date NOT NULL
);
ALTER TABLE public.daily_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_select_own ON public.daily_claims;
CREATE POLICY daily_select_own ON public.daily_claims FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.claim_daily(p_today date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.daily_claims%rowtype;
  v_streak integer;
  v_reward numeric;
  v_bal numeric;
  v_rewards numeric[] := ARRAY[500,600,800,1000,1300,1700,3000];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  IF p_today IS NULL OR p_today < current_date - 1 OR p_today > current_date + 1 THEN
    RAISE EXCEPTION 'Некорректная дата';
  END IF;
  SELECT * INTO v_row FROM public.daily_claims WHERE user_id = auth.uid();
  IF v_row.user_id IS NOT NULL AND v_row.last_claim = p_today THEN
    RAISE EXCEPTION 'Награда на сегодня уже забрана';
  END IF;
  IF v_row.user_id IS NOT NULL AND v_row.last_claim = p_today - 1 THEN
    v_streak := v_row.streak + 1;
  ELSE
    v_streak := 1;
  END IF;
  v_reward := v_rewards[((v_streak - 1) % 7) + 1];
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  INSERT INTO public.daily_claims (user_id, streak, last_claim) VALUES (auth.uid(), v_streak, p_today)
    ON CONFLICT (user_id) DO UPDATE SET streak = v_streak, last_claim = p_today;
  UPDATE public.profiles SET bal = bal + v_reward, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  RETURN jsonb_build_object('reward', v_reward, 'day', v_streak, 'bal', v_bal);
END $$;

-- 10.7 бесплатное «Начислить» (кулдаун и лимит проверяет сервер)
CREATE TABLE IF NOT EXISTS public.free_money (
  user_id uuid PRIMARY KEY,
  last_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.free_money ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS free_money_select_own ON public.free_money;
CREATE POLICY free_money_select_own ON public.free_money FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.self_add_free(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  IF p_amount NOT IN (5000, 25000, 50000, 250000, 1000000) THEN
    RAISE EXCEPTION 'Недопустимая сумма начисления';
  END IF;
  IF EXISTS (SELECT 1 FROM public.free_money WHERE user_id = auth.uid() AND last_at > now() - interval '2.5 seconds') THEN
    RAISE EXCEPTION 'Подождите пару секунд перед следующим начислением';
  END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal >= 100000 THEN RAISE EXCEPTION 'Баланс уже превышает 100 000 SV₽ — начисление не требуется'; END IF;
  UPDATE public.profiles SET bal = bal + p_amount, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.free_money (user_id, last_at) VALUES (auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE SET last_at = now();
  RETURN jsonb_build_object('bal', v_bal);
END $$;

-- 10.8 спорт-ставка и сброс
CREATE OR REPLACE FUNCTION public.place_sports_bet(p_event text, p_outcome integer, p_stake numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.events%rowtype;
  v_bal numeric;
  v_username text;
  v_pick text;
  v_odds numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'Событие не найдено'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'Приём ставок на это событие закрыт'; END IF;
  IF p_outcome IS NULL OR p_outcome < 0 OR p_outcome >= jsonb_array_length(v_event.data->'out') THEN
    RAISE EXCEPTION 'Некорректный исход';
  END IF;
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  SELECT bal, username INTO v_bal, v_username FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽ на балансе'; END IF;
  v_pick := v_event.data->'out'->p_outcome->>0;
  v_odds := (v_event.data->'out'->p_outcome->>1)::numeric;
  UPDATE public.profiles SET bal = bal - p_stake, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.bets (user_id, username, event_id, match_title, pick, pick_name, odds, stake, status)
    VALUES (auth.uid(), v_username, p_event, coalesce(v_event.data->>'title', p_event), v_pick, v_pick, v_odds, p_stake, 'pending');
  RETURN jsonb_build_object('bal', v_bal, 'pick', v_pick, 'odds', v_odds);
END $$;

CREATE OR REPLACE FUNCTION public.self_reset_balance()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти'; END IF;
  UPDATE public.profiles SET bal = 10000, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден'; END IF;
  RETURN jsonb_build_object('bal', v_bal);
END $$;

-- 10.9 admin_settle_bets v2: теперь ещё и начисляет балансы победителям/возвратам
CREATE OR REPLACE FUNCTION public.admin_settle_bets(p_event text, p_winner integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_win_pick text;
  v_count integer;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может рассчитывать события';
  END IF;
  IF p_winner IS NOT NULL THEN
    SELECT data->'out'->p_winner->>0 INTO v_win_pick FROM public.events WHERE id = p_event;
    IF v_win_pick IS NULL THEN RAISE EXCEPTION 'Событие или исход не найдены'; END IF;
    WITH won AS (
      UPDATE public.bets SET status = 'won', payout = round(stake * odds, 2)
      WHERE event_id = p_event AND status = 'pending' AND coalesce(pick, pick_name) = v_win_pick
      RETURNING user_id, payout
    ), lost AS (
      UPDATE public.bets SET status = 'lost', payout = 0
      WHERE event_id = p_event AND status = 'pending' AND coalesce(pick, pick_name) <> v_win_pick
      RETURNING user_id
    ), credited AS (
      UPDATE public.profiles p SET bal = p.bal + w.total, updated_at = now()
      FROM (SELECT user_id, sum(payout) AS total FROM won GROUP BY user_id) w
      WHERE p.id = w.user_id
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM won) + (SELECT count(*) FROM lost) INTO v_count;
  ELSE
    WITH refunded AS (
      UPDATE public.bets SET status = 'refund', payout = stake
      WHERE event_id = p_event AND status = 'pending'
      RETURNING user_id, payout
    ), credited AS (
      UPDATE public.profiles p SET bal = p.bal + r.total, updated_at = now()
      FROM (SELECT user_id, sum(payout) AS total FROM refunded GROUP BY user_id) r
      WHERE p.id = r.user_id
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM refunded;
  END IF;
  RETURN v_count;
END $$;

-- 10.10 realtime для общих раундов и ставок крэша
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.crash_rounds; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.crash_bets; EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END;
END $$;

-- 10.11 права на клиентские RPC
GRANT EXECUTE ON FUNCTION
  public.crash_state(),
  public.crash_place_bet(bigint, numeric, numeric),
  public.crash_cancel_bet(bigint),
  public.crash_cashout(bigint),
  public.wheel_spin(),
  public.plinko_drop(numeric, text),
  public.puddles_start(numeric, integer),
  public.puddles_pick(uuid, integer),
  public.puddles_cash(uuid),
  public.claim_daily(date),
  public.self_add_free(numeric),
  public.place_sports_bet(text, integer, numeric),
  public.self_reset_balance()
TO authenticated, anon;

-- ====================================================================
-- 11. АРХИВ ИСТОРИИ ИГР (новое): в БД хранятся только последние 10 попыток
--     каждой игры. Всё старшее archive_take() удаляет и отдаёт архиватору
--     (scripts/archive_history.mjs, запуск из .github/workflows/archive.yml
--     каждые 15 минут), который складывает это в красивый Markdown-документ
--     в приватном бакете Storage «history» (game-history-ГГГГ-ММ.md).
--     Вызывать archive_take может только сервисный ключ.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.game_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  game text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attempts_select_own ON public.game_attempts;

CREATE POLICY attempts_select_own ON public.game_attempts FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.wheel_spin()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_idx integer;
  v_mul numeric;
  v_muls numeric[] := ARRAY[0,0.5,0,1.2,0,0.5,0,1.2,0,0.5,0,1.0,0,0.5,0,10];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < 100 THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;
  v_idx := floor(random() * array_length(v_muls, 1))::int;
  v_mul := v_muls[v_idx + 1];
  UPDATE public.profiles
    SET bal = bal - 100 + round(100 * v_mul, 2), updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'wheel', jsonb_build_object('stake', 100, 'sector', v_idx, 'mul', v_mul, 'win', round(100 * v_mul, 2)));
  RETURN jsonb_build_object('sector', v_idx, 'mul', v_mul, 'win', round(100 * v_mul, 2), 'bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.plinko_drop(p_stake numeric, p_risk text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_slot integer := 0;
  v_i integer;
  v_mul numeric;
  v_low  numeric[] := ARRAY[6.6,3.3,1.9,1.3,1.1,1,0.5,1,1.1,1.3,1.9,3.3,6.6];
  v_mid  numeric[] := ARRAY[21,6.5,2.8,1.4,1,0.8,0.5,0.8,1,1.4,2.8,6.5,21];
  v_high numeric[] := ARRAY[65,15,4.2,1.9,0.9,0.6,0.3,0.6,0.9,1.9,4.2,15,65];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  IF p_risk NOT IN ('low', 'mid', 'high') THEN RAISE EXCEPTION 'Неизвестный уровень риска'; END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;
  FOR v_i IN 1..12 LOOP
    IF random() < 0.5 THEN v_slot := v_slot + 1; END IF;
  END LOOP;
  v_mul := CASE p_risk
    WHEN 'low' THEN v_low[v_slot + 1]
    WHEN 'mid' THEN v_mid[v_slot + 1]
    ELSE v_high[v_slot + 1]
  END;
  UPDATE public.profiles
    SET bal = bal - p_stake + round(p_stake * v_mul, 2), updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'plinko', jsonb_build_object('stake', p_stake, 'risk', p_risk, 'slot', v_slot, 'mul', v_mul, 'win', round(p_stake * v_mul, 2)));
  RETURN jsonb_build_object('slot', v_slot, 'mul', v_mul, 'win', round(p_stake * v_mul, 2), 'bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.puddles_pick(p_round uuid, p_cell integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.puddles_rounds%rowtype;
  v_mines integer[];
  v_opened integer[];
  v_mul numeric;
  v_win numeric;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_round FROM public.puddles_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раунд уже завершён'; END IF;
  IF p_cell < 0 OR p_cell > 24 THEN RAISE EXCEPTION 'Клетка за пределами поля'; END IF;
  IF p_cell = ANY (v_round.opened) THEN RAISE EXCEPTION 'Клетка уже открыта'; END IF;
  SELECT mines INTO v_mines FROM public.puddles_secrets WHERE round_id = p_round;

  IF p_cell = ANY (v_mines) THEN
    UPDATE public.puddles_rounds SET status = 'lost' WHERE id = p_round;
    INSERT INTO public.game_attempts (user_id, game, result)
      VALUES (auth.uid(), 'puddles', jsonb_build_object('stake', v_round.stake, 'mines', v_round.mines_count, 'opened', array_length(v_round.opened, 1), 'outcome', 'lost'));
    RETURN jsonb_build_object('hit', true, 'mines', v_mines, 'opened', v_round.opened);
  END IF;

  UPDATE public.puddles_rounds SET opened = opened || p_cell WHERE id = p_round RETURNING opened INTO v_opened;

  IF array_length(v_opened, 1) >= 25 - v_round.mines_count THEN
    v_mul := public.puddles_multiplier(v_round.mines_count, array_length(v_opened, 1));
    v_win := round(v_round.stake * v_mul, 2);
    UPDATE public.puddles_rounds SET status = 'cashed' WHERE id = p_round;
    UPDATE public.profiles SET bal = bal + v_win, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
    INSERT INTO public.game_attempts (user_id, game, result)
      VALUES (auth.uid(), 'puddles', jsonb_build_object('stake', v_round.stake, 'mines', v_round.mines_count, 'opened', array_length(v_opened, 1), 'outcome', 'cashed', 'mul', v_mul, 'win', v_win));
    RETURN jsonb_build_object('hit', false, 'opened', v_opened, 'auto_cashed', true, 'mul', v_mul, 'win', v_win, 'bal', v_bal, 'mines', v_mines);
  END IF;

  RETURN jsonb_build_object('hit', false, 'opened', v_opened);
END $$;

CREATE OR REPLACE FUNCTION public.puddles_cash(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.puddles_rounds%rowtype;
  v_mines integer[];
  v_mul numeric;
  v_win numeric;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_round FROM public.puddles_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раунд уже завершён'; END IF;
  IF array_length(v_round.opened, 1) < 1 THEN RAISE EXCEPTION 'Сначала открой хотя бы одну клетку'; END IF;
  SELECT mines INTO v_mines FROM public.puddles_secrets WHERE round_id = p_round;
  v_mul := public.puddles_multiplier(v_round.mines_count, array_length(v_round.opened, 1));
  v_win := round(v_round.stake * v_mul, 2);
  UPDATE public.puddles_rounds SET status = 'cashed' WHERE id = p_round;
  UPDATE public.profiles SET bal = bal + v_win, updated_at = now() WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'puddles', jsonb_build_object('stake', v_round.stake, 'mines', v_round.mines_count, 'opened', array_length(v_round.opened, 1), 'outcome', 'cashed', 'mul', v_mul, 'win', v_win));
  RETURN jsonb_build_object('mul', v_mul, 'win', v_win, 'bal', v_bal, 'mines', v_mines);
END $$;

CREATE OR REPLACE FUNCTION public.archive_take()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max bigint;
  v_rounds jsonb;
  v_bets jsonb;
  v_attempts jsonb;
  v_puddles jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Архиватор доступен только сервисному ключу';
  END IF;

  -- 1) Крэш: раунды старше последних 10 (сначала их ставки, потом сами раунды)
  SELECT coalesce(max(id), 0) INTO v_max FROM public.crash_rounds;
  WITH del_bets AS (
    DELETE FROM public.crash_bets WHERE round_id <= v_max - 10
    RETURNING round_id, username, stake, auto_cashout, cashed_out_mul, win_amount
  )
  SELECT coalesce(jsonb_agg(to_jsonb(del_bets)), '[]'::jsonb) INTO v_bets FROM del_bets;
  WITH del_rounds AS (
    DELETE FROM public.crash_rounds WHERE id <= v_max - 10
    RETURNING id, start_at, crash_point
  )
  SELECT coalesce(jsonb_agg(to_jsonb(del_rounds) ORDER BY id), '[]'::jsonb) INTO v_rounds FROM del_rounds;

  -- 2) Попытки колесо/плинко/лужи: старше 10 на игрока по каждой игре
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id, game ORDER BY id DESC) AS rn
    FROM public.game_attempts
  ), del AS (
    DELETE FROM public.game_attempts a USING ranked r
    WHERE r.id = a.id AND r.rn > 10
    RETURNING a.user_id, a.game, a.result, a.created_at
  )
  SELECT coalesce(jsonb_agg(to_jsonb(del) ORDER BY created_at), '[]'::jsonb) INTO v_attempts FROM del;

  -- 3) Завершённые раунды луж: старше 10 на игрока
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.puddles_rounds WHERE status <> 'play'
  ), del AS (
    DELETE FROM public.puddles_rounds p USING ranked r
    WHERE r.id = p.id AND r.rn > 10
    RETURNING p.user_id, p.stake, p.mines_count, p.opened, p.status, p.created_at
  )
  SELECT coalesce(jsonb_agg(to_jsonb(del) ORDER BY created_at), '[]'::jsonb) INTO v_puddles FROM del;

  RETURN jsonb_build_object(
    'crash_rounds', v_rounds,
    'crash_bets', v_bets,
    'attempts', v_attempts,
    'puddles', v_puddles
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.archive_take() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.archive_take() TO service_role;
