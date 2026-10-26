-- ====================================================================
-- SVINLINE: Row Level Security (RLS) & Database Hardening Script
-- Execute in Supabase Dashboard -> SQL Editor:
-- https://supabase.com/dashboard/project/<твой-project-ref>/sql
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

-- ====================================================================
-- 12. БЛОКИРОВКА НА СЕРВЕРЕ + СПИСОК ИГРОКОВ ДЛЯ АДМИНКИ (новое).
--     assert_not_blocked() теперь вызывается во всех игровых RPC
--     (ставки/колесо/плинко/лужи/ежедневка/free-money/спорт) — заблокированный
--     не может играть даже прямыми вызовами API. Возврат своих денег
--     (отмена/вывод/забрать) не блокируется.
--     admin_list_players() отдаёт владельцу все профили со ставками —
--     панель «Слежка за игроками» показывает всех, а не только себя.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.assert_not_blocked()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_blocked) THEN
    RAISE EXCEPTION 'Ваш аккаунт заблокирован администратором';
  END IF;
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
  PERFORM public.assert_not_blocked();
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
  PERFORM public.assert_not_blocked();
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
  PERFORM public.assert_not_blocked();
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
  PERFORM public.assert_not_blocked();
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
  PERFORM public.assert_not_blocked();
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

CREATE OR REPLACE FUNCTION public.self_add_free(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
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
  PERFORM public.assert_not_blocked();
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

CREATE OR REPLACE FUNCTION public.admin_list_players()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может смотреть список игроков';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at), '[]'::jsonb)
    FROM (
      SELECT p.id, p.username, p.avatar, p.bal, p.is_blocked, p.created_at,
             (SELECT count(*) FROM public.bets b WHERE b.user_id = p.id) AS bets_count,
             (SELECT jsonb_agg(jsonb_build_object(
                       'id', b.id, 'event_id', b.event_id, 'match_title', b.match_title,
                       'pick', b.pick, 'pick_name', b.pick_name, 'odds', b.odds,
                       'stake', b.stake, 'status', b.status, 'payout', b.payout,
                       'created_at', b.created_at) ORDER BY b.created_at DESC)
              FROM (SELECT * FROM public.bets WHERE user_id = p.id ORDER BY created_at DESC LIMIT 20) b
             ) AS recent_bets
      FROM public.profiles p
    ) t
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_players() TO authenticated, anon;

-- ====================================================================
-- 13. КУРС РУБЛЯ v2 (новое): ОБЩАЯ БИРЖЕВАЯ ЛЕНТА для всех игроков.
--     Цена хранится в ruble_prices по секундам: лента идёт всегда
--     (pg_cron дотягивает её на 5 минут вперёд каждые 10 секунд),
--     не сбрасывается при перезаходе и одинакова у всех.
--     Будущие тики скрыты RLS (tick_at <= now()) — «заглянуть вперёд» нельзя.
--     Ставка: рубль через 30 секунд после ставки против цены на момент
--     ставки. Угадал направление — x1.95 (RTP 97.5%), «флэт» — в пользу
--     заведения. Формулы шага — зеркало src/rubleLogic.ts.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.ruble_prices (
  tick_at timestamptz PRIMARY KEY,
  price numeric NOT NULL
);
ALTER TABLE public.ruble_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ruble_prices_select_past ON public.ruble_prices;
CREATE POLICY ruble_prices_select_past
ON public.ruble_prices FOR SELECT
USING (tick_at <= now());

-- Дотянуть ленту до указанного момента (по умолчанию +15 минут — запас на задержки крона).
-- Идемпотентна (ON CONFLICT), сама подчищает ленту старше двух часов.
CREATE OR REPLACE FUNCTION public.ruble_ensure(p_until timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last timestamptz;
  v_price numeric;
  v_cur timestamptz;
  v_until timestamptz := coalesce(p_until, now() + interval '15 minutes');
BEGIN
  SELECT tick_at, price INTO v_last, v_price
    FROM public.ruble_prices ORDER BY tick_at DESC LIMIT 1;
  IF v_last IS NULL THEN
    v_last := date_trunc('second', now());
    v_price := 100;
    INSERT INTO public.ruble_prices (tick_at, price) VALUES (v_last, v_price)
      ON CONFLICT (tick_at) DO NOTHING;
  END IF;
  v_cur := v_last + interval '1 second';
  WHILE v_cur <= v_until LOOP
    v_price := round((v_price * (1 + (random() * 2 - 1) * 0.006) + (100 - v_price) * 0.02)::numeric, 2);
    INSERT INTO public.ruble_prices (tick_at, price) VALUES (v_cur, v_price)
      ON CONFLICT (tick_at) DO NOTHING;
    v_cur := v_cur + interval '1 second';
  END LOOP;
  DELETE FROM public.ruble_prices WHERE tick_at < now() - interval '2 hours';
END $$;

CREATE OR REPLACE FUNCTION public.ruble_predict(p_side text, p_stake numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_tick timestamptz;
  v_at numeric;
  v_future numeric;
  v_dir text;
  v_win boolean;
  v_mul numeric;
  v_payout numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF p_side NOT IN ('up', 'down') THEN RAISE EXCEPTION 'Ставка только «вверх» или «вниз»'; END IF;
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;

  PERFORM public.ruble_ensure(now() + interval '45 seconds');
  v_tick := date_trunc('second', now());
  SELECT price INTO v_at FROM public.ruble_prices WHERE tick_at = v_tick;
  IF v_at IS NULL THEN
    SELECT price INTO v_at FROM public.ruble_prices
      WHERE tick_at < v_tick ORDER BY tick_at DESC LIMIT 1;
  END IF;
  SELECT price INTO v_future FROM public.ruble_prices
    WHERE tick_at = v_tick + interval '30 seconds';
  IF v_at IS NULL OR v_future IS NULL THEN
    RAISE EXCEPTION 'Лента ещё не готова — попробуй через секунду';
  END IF;

  v_dir := CASE WHEN v_future > v_at THEN 'up' WHEN v_future < v_at THEN 'down' ELSE 'flat' END;
  v_win := (p_side = 'up' AND v_dir = 'up') OR (p_side = 'down' AND v_dir = 'down');
  v_mul := CASE WHEN v_win THEN 1.95 ELSE 0 END;
  v_payout := round(p_stake * v_mul, 2);

  UPDATE public.profiles
    SET bal = bal - p_stake + v_payout, updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'ruble', jsonb_build_object(
      'stake', p_stake, 'side', p_side, 'start', v_at, 'final', v_future,
      'dir', v_dir, 'mul', v_mul, 'win', v_payout));

  RETURN jsonb_build_object('start', v_at, 'final', v_future,
    'resolve_ms', (extract(epoch FROM (v_tick + interval '30 seconds')) * 1000)::bigint,
    'dir', v_dir, 'win', v_win, 'mul', v_mul, 'payout', v_payout, 'bal', v_bal);
END $$;

-- Лента в реалтайме: новые тики прилетают подписчикам сами
DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'ruble_prices') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ruble_prices;
  END IF;
END $pub$;

GRANT EXECUTE ON FUNCTION public.ruble_predict(text, numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ruble_ensure(timestamptz) TO authenticated, anon, service_role;

-- Фоновый ход ленты: каждые 10 секунд дотягиваем будущие тики
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $cron$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ruble-tape') THEN
    PERFORM cron.schedule('ruble-tape', '*/10 * * * * *', $job$ SELECT public.ruble_ensure() $job$);
  END IF;
END $cron$;

-- ====================================================================
-- 14. НАСТОЯЩЕЕ КАЗИНО (новое): Хряк-пот, VIP-уровни, кэшбэк, лента выигрышей.
--     casino_take(p_stake) зовётся ставочными RPC (колесо/плинко/лужи/курс):
--     копит оборот в profiles.total_wagered, кладёт 1% ставки в джекпот и
--     с шансом 1/3000 ссыпает весь горшок счастливчику. Вызвать casino_take
--     напрямую нельзя (EXECUTE отозван) — только через игровые RPC.
--     vip_level/claim_cashback/recent_wins — зеркало src/casinoLogic.ts.
--     Определения wheel_spin/plinko_drop/puddles_start/ruble_predict ниже
--     перекрывают версии из секций 10 и 13 (скрипт идемпотентен).
-- ====================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_wagered numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.casino_jackpot (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  pot numeric NOT NULL DEFAULT 50000,
  last_winner text,
  last_win numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.casino_jackpot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jackpot_read_all ON public.casino_jackpot;
CREATE POLICY jackpot_read_all ON public.casino_jackpot FOR SELECT USING (true);
INSERT INTO public.casino_jackpot (id, pot) VALUES (true, 50000) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cashback_claims (
  user_id uuid PRIMARY KEY,
  last_claim date NOT NULL
);
ALTER TABLE public.cashback_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.vip_level(p_wagered numeric)
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_wagered >= 5000000 THEN 4
    WHEN p_wagered >= 1000000 THEN 3
    WHEN p_wagered >= 250000 THEN 2
    WHEN p_wagered >= 50000 THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.casino_take(p_stake numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_pot numeric;
  v_hit numeric := 0;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('jackpot', 0);
  END IF;
  UPDATE public.profiles SET total_wagered = total_wagered + p_stake WHERE id = auth.uid();
  UPDATE public.casino_jackpot
    SET pot = pot + round(p_stake * 0.01, 2), updated_at = now()
    WHERE id RETURNING pot INTO v_pot;
  IF random() < 1.0 / 3000 THEN
    SELECT username INTO v_name FROM public.profiles WHERE id = auth.uid();
    v_hit := v_pot;
    UPDATE public.casino_jackpot
      SET pot = 50000, last_winner = v_name, last_win = v_hit, updated_at = now()
      WHERE id;
    UPDATE public.profiles SET bal = bal + v_hit, updated_at = now()
      WHERE id = auth.uid();
    INSERT INTO public.game_attempts (user_id, game, result)
      VALUES (auth.uid(), 'jackpot', jsonb_build_object('win', v_hit));
  END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  SELECT pot INTO v_pot FROM public.casino_jackpot WHERE id;
  RETURN jsonb_build_object('jackpot', v_hit, 'bal', v_bal, 'pot', v_pot);
END $$;

REVOKE EXECUTE ON FUNCTION public.casino_take(numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_cashback()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claim record;
  v_loss numeric;
  v_level integer;
  v_pct numeric;
  v_pay numeric;
  v_bal numeric;
  v_wagered numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_claim FROM public.cashback_claims WHERE user_id = auth.uid();
  IF v_claim.user_id IS NOT NULL AND v_claim.last_claim >= current_date THEN
    RAISE EXCEPTION 'Кэшбэк уже забран сегодня — приходи завтра';
  END IF;
  -- вчерашний чистый проигрыш по ставочным играм (крэш считается отдельно)
  SELECT coalesce(sum((result->>'stake')::numeric), 0)
       - coalesce(sum(coalesce(result->>'win', '0')::numeric), 0)
    INTO v_loss
  FROM public.game_attempts
  WHERE user_id = auth.uid()
    AND created_at >= current_date - interval '1 day'
    AND created_at < current_date
    AND game IN ('wheel', 'plinko', 'puddles', 'ruble');
  IF coalesce(v_loss, 0) < 10 THEN
    RAISE EXCEPTION 'Вчера ты не проиграл достаточно — кэшбэка нет (и это хорошо)';
  END IF;
  SELECT total_wagered INTO v_wagered FROM public.profiles WHERE id = auth.uid();
  v_level := public.vip_level(v_wagered);
  v_pct := 3 + v_level;
  v_pay := round(v_loss * v_pct / 100.0, 2);
  UPDATE public.profiles SET bal = bal + v_pay, updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.cashback_claims (user_id, last_claim) VALUES (auth.uid(), current_date)
    ON CONFLICT (user_id) DO UPDATE SET last_claim = current_date;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'cashback', jsonb_build_object(
      'win', v_pay, 'loss', v_loss, 'level', v_level, 'pct', v_pct));
  RETURN jsonb_build_object('win', v_pay, 'loss', v_loss, 'level', v_level,
    'levelName', (ARRAY['Бессовестный','Хряк','Свин-магнат','Барон','Свиновладыка'])[v_level + 1],
    'pct', v_pct, 'bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.recent_wins()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(t ORDER BY t.at DESC), '[]'::jsonb)
    FROM (
      SELECT p.username, a.game, (a.result->>'win')::numeric AS win, a.created_at AS at
      FROM (
        SELECT user_id, game, result, created_at
        FROM public.game_attempts
        ORDER BY id DESC LIMIT 300
      ) a JOIN public.profiles p ON p.id = a.user_id
      WHERE coalesce((a.result->>'win')::numeric, 0) > 0
      LIMIT 15
    ) t
  );
END $$;

GRANT EXECUTE ON FUNCTION public.claim_cashback() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.recent_wins() TO authenticated, anon;
GRANT SELECT ON public.casino_jackpot TO anon, authenticated;

-- Ставочные RPC с казино-интеграцией (перекрывают определения из секций 10/13).
CREATE OR REPLACE FUNCTION public.wheel_spin()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_idx integer;
  v_mul numeric;
  v_muls numeric[] := ARRAY[0,0.5,0,1.2,0,0.5,0,1.2,0,0.5,0,1.0,0,0.5,0,10];
  v_casino jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
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
  v_casino := public.casino_take(100);
  v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
  RETURN jsonb_build_object('sector', v_idx, 'mul', v_mul, 'win', round(100 * v_mul, 2), 'bal', v_bal,
    'jackpot', coalesce(v_casino->>'jackpot', '0'));
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
  v_casino jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
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
  v_casino := public.casino_take(p_stake);
  v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
  RETURN jsonb_build_object('slot', v_slot, 'mul', v_mul, 'win', round(p_stake * v_mul, 2), 'bal', v_bal,
    'jackpot', coalesce(v_casino->>'jackpot', '0'));
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
  v_casino jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
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
  v_casino := public.casino_take(p_stake);
  v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
  RETURN jsonb_build_object('round_id', v_id, 'bal', v_bal, 'jackpot', coalesce(v_casino->>'jackpot', '0'));
END $$;

CREATE OR REPLACE FUNCTION public.ruble_predict(p_side text, p_stake numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_tick timestamptz;
  v_at numeric;
  v_future numeric;
  v_dir text;
  v_win boolean;
  v_mul numeric;
  v_payout numeric;
  v_casino jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF p_side NOT IN ('up', 'down') THEN RAISE EXCEPTION 'Ставка только «вверх» или «вниз»'; END IF;
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;

  PERFORM public.ruble_ensure(now() + interval '45 seconds');
  v_tick := date_trunc('second', now());
  SELECT price INTO v_at FROM public.ruble_prices WHERE tick_at = v_tick;
  IF v_at IS NULL THEN
    SELECT price INTO v_at FROM public.ruble_prices
      WHERE tick_at < v_tick ORDER BY tick_at DESC LIMIT 1;
  END IF;
  SELECT price INTO v_future FROM public.ruble_prices
    WHERE tick_at = v_tick + interval '30 seconds';
  IF v_at IS NULL OR v_future IS NULL THEN
    RAISE EXCEPTION 'Лента ещё не готова — попробуй через секунду';
  END IF;

  v_dir := CASE WHEN v_future > v_at THEN 'up' WHEN v_future < v_at THEN 'down' ELSE 'flat' END;
  v_win := (p_side = 'up' AND v_dir = 'up') OR (p_side = 'down' AND v_dir = 'down');
  v_mul := CASE WHEN v_win THEN 1.95 ELSE 0 END;
  v_payout := round(p_stake * v_mul, 2);

  UPDATE public.profiles
    SET bal = bal - p_stake + v_payout, updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'ruble', jsonb_build_object(
      'stake', p_stake, 'side', p_side, 'start', v_at, 'final', v_future,
      'dir', v_dir, 'mul', v_mul, 'win', v_payout));
  v_casino := public.casino_take(p_stake);
  v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);

  RETURN jsonb_build_object('start', v_at, 'final', v_future,
    'resolve_ms', (extract(epoch FROM (v_tick + interval '30 seconds')) * 1000)::bigint,
    'dir', v_dir, 'win', v_win, 'mul', v_mul, 'payout', v_payout, 'bal', v_bal,
    'jackpot', coalesce(v_casino->>'jackpot', '0'));
END $$;

NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- 15. ХРЮК-БЛЭКДЖЕК (новое): серверная колода, скрытая карта дилера
--     (bj_secrets без SELECT-политики), deal/hit/double/stand, блэкджек 3:2,
--     push = возврат, дабл на двух картах (ровно одна карта и автостоп).
--     Раунды живы в БД — перезагрузка страницы не теряет раздачу.
--     Участает в кэшбэке (вместе с wheel/plinko/puddles/ruble)
--     и в ретеншне (последние 10 раздач на игрока).
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.bj_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stake numeric NOT NULL,
  doubled boolean NOT NULL DEFAULT false,
  player_cards integer[] NOT NULL DEFAULT '{}',
  dealer_visible integer NOT NULL,
  status text NOT NULL DEFAULT 'play',  -- play | won | lost | push | blackjack
  payout numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bj_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bj_select_own ON public.bj_rounds;
CREATE POLICY bj_select_own ON public.bj_rounds FOR SELECT USING (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS bj_one_active ON public.bj_rounds (user_id) WHERE status = 'play';

CREATE TABLE IF NOT EXISTS public.bj_secrets (
  round_id uuid PRIMARY KEY REFERENCES public.bj_rounds(id) ON DELETE CASCADE,
  dealer_cards integer[] NOT NULL
);
ALTER TABLE public.bj_secrets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bj_hand_value(p_cards integer[])
RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_total integer := 0;
  v_aces integer := 0;
  c integer;
  r integer;
BEGIN
  IF p_cards IS NULL THEN RETURN 0; END IF;
  FOREACH c IN ARRAY p_cards LOOP
    r := c % 13;
    IF r = 12 THEN v_total := v_total + 11; v_aces := v_aces + 1;
    ELSIF r >= 9 THEN v_total := v_total + 10;
    ELSE v_total := v_total + r + 2; END IF;
  END LOOP;
  WHILE v_total > 21 AND v_aces > 0 LOOP
    v_total := v_total - 10; v_aces := v_aces - 1;
  END LOOP;
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION public.bj_is_blackjack(p_cards integer[])
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_length(p_cards, 1), 0) = 2 AND public.bj_hand_value(p_cards) = 21
$$;

CREATE OR REPLACE FUNCTION public.bj_draw(p_taken integer[])
RETURNS integer
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_card integer;
  v_tries integer := 0;
BEGIN
  LOOP
    v_card := floor(random() * 52)::int;
    v_tries := v_tries + 1;
    IF NOT (v_card = ANY (p_taken)) OR v_tries > 200 THEN RETURN v_card; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.bj_deal(p_stake numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric;
  v_taken integer[] := '{}';
  v_player integer[];
  v_dealer integer[];
  v_card integer;
  v_round uuid;
  v_player_bj boolean;
  v_dealer_bj boolean;
  v_payout numeric := 0;
  v_status text := 'play';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF p_stake < 10 THEN RAISE EXCEPTION 'Минимальная ставка — 10 SV₽'; END IF;
  IF EXISTS (SELECT 1 FROM public.bj_rounds WHERE user_id = auth.uid() AND status = 'play') THEN
    RAISE EXCEPTION 'Сначала доиграй текущую раздачу';
  END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Профиль не найден — войдите заново'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Недостаточно SV₽! Нажмите «+ Начислить SV₽».'; END IF;

  UPDATE public.profiles SET bal = bal - p_stake, updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  PERFORM public.casino_take(p_stake);

  FOR i IN 1..4 LOOP
    v_card := public.bj_draw(v_taken);
    v_taken := v_taken || v_card;
    IF i IN (1, 3) THEN v_player := v_player || v_card; ELSE v_dealer := v_dealer || v_card; END IF;
  END LOOP;
  v_player_bj := public.bj_is_blackjack(v_player);
  v_dealer_bj := public.bj_is_blackjack(v_dealer);

  IF v_player_bj AND v_dealer_bj THEN
    v_status := 'push'; v_payout := p_stake;
  ELSIF v_player_bj THEN
    v_status := 'blackjack'; v_payout := round(p_stake * 2.5, 2);
  ELSIF v_dealer_bj THEN
    v_status := 'lost'; v_payout := 0;
  END IF;

  INSERT INTO public.bj_rounds (user_id, stake, player_cards, dealer_visible, status, payout)
    VALUES (auth.uid(), p_stake, v_player, v_dealer[1], v_status, v_payout)
    RETURNING id INTO v_round;
  INSERT INTO public.bj_secrets (round_id, dealer_cards) VALUES (v_round, v_dealer);

  IF v_payout > 0 THEN
    UPDATE public.profiles SET bal = bal + v_payout, updated_at = now()
      WHERE id = auth.uid() RETURNING bal INTO v_bal;
  END IF;
  IF v_status <> 'play' THEN
    INSERT INTO public.game_attempts (user_id, game, result)
      VALUES (auth.uid(), 'blackjack', jsonb_build_object(
        'stake', p_stake, 'doubled', false, 'player', public.bj_hand_value(v_player),
        'dealer', public.bj_hand_value(v_dealer), 'outcome', v_status, 'win', v_payout));
  END IF;
  RETURN jsonb_build_object('round_id', v_round, 'player_cards', to_jsonb(v_player),
    'dealer_visible', v_dealer[1], 'player_value', public.bj_hand_value(v_player),
    'status', v_status, 'payout', v_payout, 'bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.bj_hit(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.bj_rounds%rowtype;
  v_dealer integer[];
  v_taken integer[];
  v_card integer;
  v_value integer;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_round FROM public.bj_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раздача уже завершена'; END IF;
  SELECT dealer_cards INTO v_dealer FROM public.bj_secrets WHERE round_id = p_round;
  v_taken := v_round.player_cards || v_dealer;
  v_card := public.bj_draw(v_taken);
  UPDATE public.bj_rounds SET player_cards = player_cards || v_card
    WHERE id = p_round RETURNING player_cards INTO v_round.player_cards;
  v_value := public.bj_hand_value(v_round.player_cards);
  IF v_value > 21 THEN
    UPDATE public.bj_rounds SET status = 'lost', payout = 0 WHERE id = p_round;
    INSERT INTO public.game_attempts (user_id, game, result)
      VALUES (auth.uid(), 'blackjack', jsonb_build_object(
        'stake', v_round.stake * (CASE WHEN v_round.doubled THEN 2 ELSE 1 END),
        'doubled', v_round.doubled, 'player', v_value,
        'dealer', public.bj_hand_value(v_dealer), 'outcome', 'lost', 'win', 0));
  END IF;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  RETURN jsonb_build_object('player_cards', to_jsonb(v_round.player_cards),
    'player_value', v_value, 'bust', v_value > 21, 'bal', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.bj_double(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.bj_rounds%rowtype;
  v_bal numeric;
  v_extra numeric;
  v_dealer integer[];
  v_card integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_round FROM public.bj_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раздача уже завершена'; END IF;
  IF coalesce(array_length(v_round.player_cards, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'Дабл только на первых двух картах';
  END IF;
  IF v_round.doubled THEN RAISE EXCEPTION 'Дабл уже сделан'; END IF;
  v_extra := v_round.stake;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  IF v_bal IS NULL OR v_bal < v_extra THEN RAISE EXCEPTION 'Недостаточно SV₽ для дабла'; END IF;
  UPDATE public.profiles SET bal = bal - v_extra, updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  UPDATE public.bj_rounds SET doubled = true WHERE id = p_round;
  UPDATE public.profiles SET total_wagered = total_wagered + v_extra, updated_at = now() WHERE id = auth.uid();
  PERFORM public.casino_take(v_extra);
  -- стандартное правило дабла: ровно одна карта, затем автостоп
  SELECT dealer_cards INTO v_dealer FROM public.bj_secrets WHERE round_id = p_round;
  v_card := public.bj_draw(v_round.player_cards || v_dealer);
  UPDATE public.bj_rounds SET player_cards = player_cards || v_card WHERE id = p_round;
  RETURN public.bj_stand(p_round);
END $$;

CREATE OR REPLACE FUNCTION public.bj_stand(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.bj_rounds%rowtype;
  v_dealer integer[];
  v_taken integer[];
  v_pval integer;
  v_dval integer;
  v_stake_total numeric;
  v_payout numeric;
  v_status text;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_round FROM public.bj_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раздача уже завершена'; END IF;
  SELECT dealer_cards INTO v_dealer FROM public.bj_secrets WHERE round_id = p_round;
  v_taken := v_round.player_cards || v_dealer;
  WHILE public.bj_hand_value(v_dealer) < 17 LOOP
    v_dealer := v_dealer || public.bj_draw(v_taken);
    v_taken := v_taken || v_dealer[array_upper(v_dealer, 1)];
  END LOOP;
  UPDATE public.bj_secrets SET dealer_cards = v_dealer WHERE round_id = p_round;

  v_pval := public.bj_hand_value(v_round.player_cards);
  v_dval := public.bj_hand_value(v_dealer);
  v_stake_total := v_round.stake * (CASE WHEN v_round.doubled THEN 2 ELSE 1 END);

  IF v_pval > 21 THEN
    v_status := 'lost'; v_payout := 0;
  ELSIF v_dval > 21 OR v_pval > v_dval THEN
    v_status := 'won'; v_payout := round(v_stake_total * 2, 2);
  ELSIF v_pval = v_dval THEN
    v_status := 'push'; v_payout := v_stake_total;
  ELSE
    v_status := 'lost'; v_payout := 0;
  END IF;

  UPDATE public.bj_rounds SET status = v_status, payout = v_payout WHERE id = p_round;
  IF v_payout > 0 THEN
    UPDATE public.profiles SET bal = bal + v_payout, updated_at = now()
      WHERE id = auth.uid() RETURNING bal INTO v_bal;
  ELSE
    SELECT bal INTO v_bal FROM public.profiles WHERE id = auth.uid();
  END IF;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'blackjack', jsonb_build_object(
      'stake', v_stake_total, 'doubled', v_round.doubled, 'player', v_pval,
      'dealer', v_dval, 'outcome', v_status, 'win', v_payout));
  RETURN jsonb_build_object('player_cards', to_jsonb(v_round.player_cards),
    'dealer_cards', to_jsonb(v_dealer), 'player_value', v_pval, 'dealer_value', v_dval,
    'status', v_status, 'payout', v_payout, 'bal', v_bal);
END $$;

-- Кэшбэк: блэкджек тоже участвует в проигрыше вчерашнего дня
CREATE OR REPLACE FUNCTION public.claim_cashback()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claim record;
  v_loss numeric;
  v_level integer;
  v_pct numeric;
  v_pay numeric;
  v_bal numeric;
  v_wagered numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_claim FROM public.cashback_claims WHERE user_id = auth.uid();
  IF v_claim.user_id IS NOT NULL AND v_claim.last_claim >= current_date THEN
    RAISE EXCEPTION 'Кэшбэк уже забран сегодня — приходи завтра';
  END IF;
  SELECT coalesce(sum((result->>'stake')::numeric), 0)
       - coalesce(sum(coalesce(result->>'win', '0')::numeric), 0)
    INTO v_loss
  FROM public.game_attempts
  WHERE user_id = auth.uid()
    AND created_at >= current_date - interval '1 day'
    AND created_at < current_date
    AND game IN ('wheel', 'plinko', 'puddles', 'ruble', 'blackjack');
  IF coalesce(v_loss, 0) < 10 THEN
    RAISE EXCEPTION 'Вчера ты не проиграл достаточно — кэшбэка нет (и это хорошо)';
  END IF;
  SELECT total_wagered INTO v_wagered FROM public.profiles WHERE id = auth.uid();
  v_level := public.vip_level(v_wagered);
  v_pct := 3 + v_level;
  v_pay := round(v_loss * v_pct / 100.0, 2);
  UPDATE public.profiles SET bal = bal + v_pay, updated_at = now()
    WHERE id = auth.uid() RETURNING bal INTO v_bal;
  INSERT INTO public.cashback_claims (user_id, last_claim) VALUES (auth.uid(), current_date)
    ON CONFLICT (user_id) DO UPDATE SET last_claim = current_date;
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'cashback', jsonb_build_object(
      'win', v_pay, 'loss', v_loss, 'level', v_level, 'pct', v_pct));
  RETURN jsonb_build_object('win', v_pay, 'loss', v_loss, 'level', v_level,
    'levelName', (ARRAY['Бессовестный','Хряк','Свин-магнат','Барон','Свиновладыка'])[v_level + 1],
    'pct', v_pct, 'bal', v_bal);
END $$;

-- Ретеншн: архиватор дополнительно чистит завершённые раздачи
-- (версия archive_take из секции 11 расширена блоком bj_rounds)
CREATE OR REPLACE FUNCTION public.archive_take()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max bigint;
  v_rounds jsonb;
  v_bets jsonb;
  v_attempts jsonb;
  v_puddles jsonb;
  v_bj jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Архиватор доступен только сервисному ключу';
  END IF;

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

  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id, game ORDER BY id DESC) AS rn
    FROM public.game_attempts
  ), del AS (
    DELETE FROM public.game_attempts a USING ranked r
    WHERE r.id = a.id AND r.rn > 10
    RETURNING a.user_id, a.game, a.result, a.created_at
  )
  SELECT coalesce(jsonb_agg(to_jsonb(del) ORDER BY created_at), '[]'::jsonb) INTO v_attempts FROM del;

  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.puddles_rounds WHERE status <> 'play'
  ), del AS (
    DELETE FROM public.puddles_rounds p USING ranked r
    WHERE r.id = p.id AND r.rn > 10
    RETURNING p.user_id, p.stake, p.mines_count, p.opened, p.status, p.created_at
  )
  SELECT coalesce(jsonb_agg(to_jsonb(del) ORDER BY created_at), '[]'::jsonb) INTO v_puddles FROM del;

  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.bj_rounds WHERE status <> 'play'
  ), del AS (
    DELETE FROM public.bj_rounds b USING ranked r
    WHERE r.id = b.id AND r.rn > 10
    RETURNING b.user_id, b.stake, b.doubled, b.status, b.payout, b.created_at
  )
  SELECT coalesce(jsonb_agg(to_jsonb(del) ORDER BY created_at), '[]'::jsonb) INTO v_bj FROM del;

  RETURN jsonb_build_object(
    'crash_rounds', v_rounds, 'crash_bets', v_bets, 'attempts', v_attempts,
    'puddles', v_puddles, 'blackjack', v_bj
  );
END $$;

GRANT EXECUTE ON FUNCTION
  public.bj_deal(numeric),
  public.bj_hit(uuid),
  public.bj_double(uuid),
  public.bj_stand(uuid)
TO authenticated, anon;

-- ====================================================================
-- 16. ШАХТА (Minecraft): привязка аккаунта, занос алмазной руды,
--     вывод обратно на сервер, конвертация в SV₽ и игра «Алмазная жила».
--
--     Рудой распоряжается только сервер: клиентские RPC проверяют
--     auth.uid(), плагин ходит сервисным ключом (mc_plugin_*).
--     Рудный баланс — отдельная валюта АР: mc_accounts.ore (целые единицы),
--     1 АР = 1 блок алмазной руды. С profiles.bal не смешивается.
--     Конвертация АР ↔ SV₽ — явная операция.
--
--     Экономика по умолчанию:
--       1 руда → 250 SV₽, 1 руда ← 300 SV₽ (спред 20%),
--       вывод от 5 руды, игра: 18% обвал, глубина до 30.
--       Множитель считается как RTP / 0.82^глубина, поэтому возврат
--       на любой глубине одинаковый (~97.6%), а не тает с каждым шагом. ====================================================================

CREATE TABLE IF NOT EXISTS public.mc_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ore_to_sv numeric NOT NULL DEFAULT 250,
  sv_to_ore numeric NOT NULL DEFAULT 300,
  min_withdraw integer NOT NULL DEFAULT 5,
  dig_bust numeric NOT NULL DEFAULT 0.18,
  dig_rtp numeric NOT NULL DEFAULT 0.9758,
  dig_max_depth integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.mc_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.mc_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mc_config_read ON public.mc_config;
CREATE POLICY mc_config_read ON public.mc_config FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.mc_links (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  mc_uuid uuid NOT NULL UNIQUE,
  mc_name text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mc_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mc_links_select_own ON public.mc_links;
CREATE POLICY mc_links_select_own ON public.mc_links FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.mc_link_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
ALTER TABLE public.mc_link_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.mc_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ore integer NOT NULL DEFAULT 0 CHECK (ore >= 0),  -- баланс АР, 1 = 1 алмазная руда
  deposited integer NOT NULL DEFAULT 0,
  withdrawn integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mc_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mc_accounts_select_own ON public.mc_accounts;
CREATE POLICY mc_accounts_select_own ON public.mc_accounts FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.mc_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount integer NOT NULL,
  ore_after integer NOT NULL,
  sv_delta numeric NOT NULL DEFAULT 0,
  nonce text UNIQUE,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mc_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mc_ledger_select_own ON public.mc_ledger;
CREATE POLICY mc_ledger_select_own ON public.mc_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS mc_ledger_user_idx ON public.mc_ledger (user_id, id DESC);

CREATE TABLE IF NOT EXISTS public.mc_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  mc_uuid uuid NOT NULL,
  mc_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
ALTER TABLE public.mc_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mc_withdrawals_select_own ON public.mc_withdrawals;
CREATE POLICY mc_withdrawals_select_own ON public.mc_withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS mc_withdrawals_pending_idx
  ON public.mc_withdrawals (user_id, created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.mc_dig_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stake integer NOT NULL CHECK (stake > 0),
  depth integer NOT NULL DEFAULT 0,
  mult numeric(14, 4) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'play' CHECK (status IN ('play', 'cashed', 'busted')),
  payout integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mc_dig_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mc_dig_select_own ON public.mc_dig_rounds;
CREATE POLICY mc_dig_select_own ON public.mc_dig_rounds FOR SELECT USING (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS mc_dig_one_active
  ON public.mc_dig_rounds (user_id) WHERE status = 'play';

-- --------------------------------------------------------------------
-- 16.1 Служебные проверки
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mc_require_service()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Доступно только Minecraft-серверу';
  END IF;
END $$;

-- Держим журнал руды ограниченным: последние 200 операций на игрока.
CREATE OR REPLACE FUNCTION public.mc_prune_ledger(p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY id DESC) AS rn
    FROM public.mc_ledger WHERE user_id = p_user
  )
  DELETE FROM public.mc_ledger l USING ranked r
    WHERE l.id = r.id AND r.rn > 200;
END $$;

-- --------------------------------------------------------------------
-- 16.2 Клиентские RPC
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mc_create_link_code()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_exp timestamptz;
  v_ok boolean := false;
  i integer;
  j integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF EXISTS (SELECT 1 FROM public.mc_links WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Minecraft-аккаунт уже привязан';
  END IF;

  DELETE FROM public.mc_link_codes
    WHERE user_id = auth.uid() AND used_at IS NULL;

  v_exp := now() + interval '10 minutes';
  FOR i IN 1..5 LOOP
    v_code := '';
    FOR j IN 1..6 LOOP
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.mc_link_codes (code, user_id, expires_at)
        VALUES (v_code, auth.uid(), v_exp);
      v_ok := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  IF NOT v_ok THEN RAISE EXCEPTION 'Не удалось создать код, попробуй ещё раз'; END IF;
  RETURN jsonb_build_object('code', v_code, 'expires_at', v_exp);
END $$;

CREATE OR REPLACE FUNCTION public.mc_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conf public.mc_config%rowtype;
  v_link public.mc_links%rowtype;
  v_acc public.mc_accounts%rowtype;
  v_round jsonb;
  v_pending jsonb;
BEGIN
  SELECT * INTO v_conf FROM public.mc_config WHERE id;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'authed', false, 'linked', false, 'ore', 0,
      'unit', 'АР', 'ore_per_unit', 1,
      'rate_to_sv', v_conf.ore_to_sv, 'rate_from_sv', v_conf.sv_to_ore,
      'min_withdraw', v_conf.min_withdraw,
      'bust_chance', v_conf.dig_bust, 'rtp', v_conf.dig_rtp,
      'max_depth', v_conf.dig_max_depth,
      'pending', '[]'::jsonb, 'round', NULL);
  END IF;

  SELECT * INTO v_link FROM public.mc_links WHERE user_id = v_uid;
  INSERT INTO public.mc_accounts (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_acc FROM public.mc_accounts WHERE user_id = v_uid;

  SELECT to_jsonb(r) INTO v_round
    FROM (
      SELECT id, stake, depth, mult, status, payout, created_at
      FROM public.mc_dig_rounds
      WHERE user_id = v_uid AND status = 'play'
      ORDER BY created_at DESC LIMIT 1
    ) r;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'amount', w.amount, 'created_at', w.created_at
         ) ORDER BY w.created_at), '[]'::jsonb)
    INTO v_pending
    FROM public.mc_withdrawals w
    WHERE w.user_id = v_uid AND w.status = 'pending';

  RETURN jsonb_build_object(
    'authed', true,
    'linked', v_link.user_id IS NOT NULL,
    'mc_name', v_link.mc_name,
    'mc_uuid', v_link.mc_uuid,
    'ore', coalesce(v_acc.ore, 0),
    'unit', 'АР', 'ore_per_unit', 1,
    'deposited', coalesce(v_acc.deposited, 0),
    'withdrawn', coalesce(v_acc.withdrawn, 0),
    'rate_to_sv', v_conf.ore_to_sv,
    'rate_from_sv', v_conf.sv_to_ore,
    'min_withdraw', v_conf.min_withdraw,
    'bust_chance', v_conf.dig_bust,
    'rtp', v_conf.dig_rtp,
    'max_depth', v_conf.dig_max_depth,
    'pending', v_pending,
    'round', v_round);
END $$;

CREATE OR REPLACE FUNCTION public.mc_unlink()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mc_links WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Minecraft-аккаунт не привязан';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mc_withdrawals
             WHERE user_id = auth.uid() AND status = 'pending') THEN
    RAISE EXCEPTION 'Сначала дождись выдачи руды на сервере';
  END IF;
  DELETE FROM public.mc_links WHERE user_id = auth.uid();
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.mc_withdraw_ore(p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conf public.mc_config%rowtype;
  v_link public.mc_links%rowtype;
  v_ore integer;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_conf FROM public.mc_config WHERE id;
  SELECT * INTO v_link FROM public.mc_links WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Сначала привяжи Minecraft: /sw link КОД'; END IF;
  IF p_amount IS NULL OR p_amount < v_conf.min_withdraw THEN
    RAISE EXCEPTION 'Минимум для вывода — % руды', v_conf.min_withdraw;
  END IF;

  UPDATE public.mc_accounts
    SET ore = ore - p_amount, withdrawn = withdrawn + p_amount, updated_at = now()
    WHERE user_id = auth.uid() AND ore >= p_amount
    RETURNING ore INTO v_ore;
  IF NOT FOUND THEN RAISE EXCEPTION 'Недостаточно алмазной руды'; END IF;

  INSERT INTO public.mc_withdrawals (user_id, amount, mc_uuid, mc_name)
    VALUES (auth.uid(), p_amount, v_link.mc_uuid, v_link.mc_name)
    RETURNING id INTO v_id;

  INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, meta)
    VALUES (auth.uid(), 'withdraw', -p_amount, v_ore,
            jsonb_build_object('withdrawal_id', v_id));
  PERFORM public.mc_prune_ledger(auth.uid());

  RETURN jsonb_build_object('ok', true, 'ore', v_ore, 'withdrawal_id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.mc_convert(p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conf public.mc_config%rowtype;
  v_ore integer;
  v_bal numeric;
  v_sv numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_conf FROM public.mc_config WHERE id;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Укажи количество руды'; END IF;

  UPDATE public.mc_accounts
    SET ore = ore - p_amount, updated_at = now()
    WHERE user_id = auth.uid() AND ore >= p_amount
    RETURNING ore INTO v_ore;
  IF NOT FOUND THEN RAISE EXCEPTION 'Недостаточно алмазной руды'; END IF;

  v_sv := p_amount * v_conf.ore_to_sv;
  UPDATE public.profiles
    SET bal = bal + v_sv, updated_at = now()
    WHERE id = auth.uid()
    RETURNING bal INTO v_bal;

  INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, sv_delta, meta)
    VALUES (auth.uid(), 'convert', -p_amount, v_ore, v_sv,
            jsonb_build_object('rate', v_conf.ore_to_sv));
  PERFORM public.mc_prune_ledger(auth.uid());

  RETURN jsonb_build_object('ok', true, 'ore', v_ore, 'bal', v_bal, 'sv', v_sv);
END $$;

CREATE OR REPLACE FUNCTION public.mc_buy_ore(p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conf public.mc_config%rowtype;
  v_cost numeric;
  v_bal numeric;
  v_ore integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_conf FROM public.mc_config WHERE id;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Укажи количество руды'; END IF;

  v_cost := p_amount * v_conf.sv_to_ore;
  UPDATE public.profiles
    SET bal = bal - v_cost, updated_at = now()
    WHERE id = auth.uid() AND bal >= v_cost
    RETURNING bal INTO v_bal;
  IF NOT FOUND THEN RAISE EXCEPTION 'Недостаточно SV₽'; END IF;

  INSERT INTO public.mc_accounts (user_id, ore) VALUES (auth.uid(), p_amount)
    ON CONFLICT (user_id) DO UPDATE
      SET ore = mc_accounts.ore + p_amount, updated_at = now()
    RETURNING ore INTO v_ore;

  INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, sv_delta, meta)
    VALUES (auth.uid(), 'buy', p_amount, v_ore, -v_cost,
            jsonb_build_object('rate', v_conf.sv_to_ore));
  PERFORM public.mc_prune_ledger(auth.uid());

  RETURN jsonb_build_object('ok', true, 'ore', v_ore, 'bal', v_bal, 'cost', v_cost);
END $$;

CREATE OR REPLACE FUNCTION public.mc_dig_start(p_stake integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ore integer;
  v_id uuid;
  v_round public.mc_dig_rounds%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'Ставка должна быть целым числом руды'; END IF;
  IF EXISTS (SELECT 1 FROM public.mc_dig_rounds WHERE user_id = auth.uid() AND status = 'play') THEN
    RAISE EXCEPTION 'Сначала заверши текущий спуск';
  END IF;

  UPDATE public.mc_accounts
    SET ore = ore - p_stake, updated_at = now()
    WHERE user_id = auth.uid() AND ore >= p_stake
    RETURNING ore INTO v_ore;
  IF NOT FOUND THEN RAISE EXCEPTION 'Недостаточно алмазной руды'; END IF;

  INSERT INTO public.mc_dig_rounds (user_id, stake)
    VALUES (auth.uid(), p_stake) RETURNING id INTO v_id;

  INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, meta)
    VALUES (auth.uid(), 'dig_stake', -p_stake, v_ore,
            jsonb_build_object('round_id', v_id));
  PERFORM public.mc_prune_ledger(auth.uid());

  SELECT * INTO v_round FROM public.mc_dig_rounds WHERE id = v_id;
  RETURN jsonb_build_object(
    'round', to_jsonb(v_round), 'ore', v_ore,
    'potential', p_stake);
END $$;

CREATE OR REPLACE FUNCTION public.mc_dig_step(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conf public.mc_config%rowtype;
  v_round public.mc_dig_rounds%rowtype;
  v_depth integer;
  v_mult numeric;
  v_ore integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_conf FROM public.mc_config WHERE id;

  SELECT * INTO v_round FROM public.mc_dig_rounds
    WHERE id = p_round AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Спуск не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Спуск уже завершён'; END IF;
  IF v_round.depth >= v_conf.dig_max_depth THEN
    RAISE EXCEPTION 'Глубже некуда — забирай %', floor(v_round.stake * v_round.mult)::int;
  END IF;

  IF random() < v_conf.dig_bust THEN
    UPDATE public.mc_dig_rounds
      SET status = 'busted', payout = 0
      WHERE id = p_round;
    SELECT ore INTO v_ore FROM public.mc_accounts WHERE user_id = auth.uid();
    PERFORM public.mc_prune_ledger(auth.uid());
    WITH ranked AS (
      SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
      FROM public.mc_dig_rounds WHERE user_id = auth.uid() AND status <> 'play'
    )
    DELETE FROM public.mc_dig_rounds d USING ranked r
      WHERE d.id = r.id AND r.rn > 20;
    RETURN jsonb_build_object(
      'busted', true, 'depth', v_round.depth, 'mult', v_round.mult,
      'payout', 0, 'ore', v_ore);
  END IF;

  v_depth := v_round.depth + 1;
  v_mult := round(v_conf.dig_rtp / power(1 - v_conf.dig_bust, v_depth), 4);
  UPDATE public.mc_dig_rounds
    SET depth = v_depth, mult = v_mult
    WHERE id = p_round;

  SELECT ore INTO v_ore FROM public.mc_accounts WHERE user_id = auth.uid();
  RETURN jsonb_build_object(
    'busted', false, 'depth', v_depth, 'mult', v_mult,
    'potential', floor(v_round.stake * v_mult)::int, 'ore', v_ore);
END $$;

CREATE OR REPLACE FUNCTION public.mc_dig_cashout(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.mc_dig_rounds%rowtype;
  v_payout integer;
  v_ore integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();

  SELECT * INTO v_round FROM public.mc_dig_rounds
    WHERE id = p_round AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Спуск не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Спуск уже завершён'; END IF;

  v_payout := floor(v_round.stake * v_round.mult)::int;
  UPDATE public.mc_dig_rounds
    SET status = 'cashed', payout = v_payout
    WHERE id = p_round;

  UPDATE public.mc_accounts
    SET ore = ore + v_payout, updated_at = now()
    WHERE user_id = auth.uid()
    RETURNING ore INTO v_ore;

  INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, meta)
    VALUES (auth.uid(), 'dig_win', v_payout, v_ore,
            jsonb_build_object('round_id', p_round, 'stake', v_round.stake,
                               'depth', v_round.depth, 'mult', v_round.mult));
  PERFORM public.mc_prune_ledger(auth.uid());
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.mc_dig_rounds WHERE user_id = auth.uid() AND status <> 'play'
  )
  DELETE FROM public.mc_dig_rounds d USING ranked r
    WHERE d.id = r.id AND r.rn > 20;

  RETURN jsonb_build_object(
    'ok', true, 'payout', v_payout, 'ore', v_ore,
    'depth', v_round.depth, 'mult', v_round.mult);
END $$;

-- --------------------------------------------------------------------
-- 16.3 RPC для Minecraft-плагина (только service_role)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mc_plugin_ping()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mc_require_service();
  RETURN jsonb_build_object('ok', true, 'time', now(), 'version', '1.0.0');
END $$;

CREATE OR REPLACE FUNCTION public.mc_plugin_link(p_code text, p_uuid uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code public.mc_link_codes%rowtype;
  v_ore integer;
BEGIN
  PERFORM public.mc_require_service();
  IF p_uuid IS NULL THEN RAISE EXCEPTION 'Не передан UUID игрока'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Не передан ник игрока'; END IF;

  -- Два одновременных кода на один Minecraft-аккаунт не должны оба сработать.
  PERFORM pg_advisory_xact_lock(hashtext('mc_link:' || p_uuid));

  SELECT * INTO v_code FROM public.mc_link_codes
    WHERE code = upper(trim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Код неверный или истёк'; END IF;
  IF v_code.used_at IS NOT NULL THEN RAISE EXCEPTION 'Код уже использован'; END IF;
  IF v_code.expires_at < now() THEN RAISE EXCEPTION 'Код истёк — создай новый на сайте'; END IF;

  IF EXISTS (SELECT 1 FROM public.mc_links
             WHERE mc_uuid = p_uuid AND user_id <> v_code.user_id) THEN
    RAISE EXCEPTION 'Этот Minecraft-аккаунт уже привязан к другому игроку';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mc_links
             WHERE user_id = v_code.user_id AND mc_uuid <> p_uuid) THEN
    RAISE EXCEPTION 'Аккаунт сайта уже привязан к другому Minecraft-профилю';
  END IF;

  UPDATE public.mc_link_codes SET used_at = now() WHERE code = v_code.code;

  INSERT INTO public.mc_links (user_id, mc_uuid, mc_name)
    VALUES (v_code.user_id, p_uuid, left(trim(p_name), 32))
    ON CONFLICT (user_id) DO UPDATE
      SET mc_uuid = excluded.mc_uuid,
          mc_name = excluded.mc_name,
          linked_at = now();

  INSERT INTO public.mc_accounts (user_id) VALUES (v_code.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT ore INTO v_ore FROM public.mc_accounts WHERE user_id = v_code.user_id;

  RETURN jsonb_build_object(
    'ok', true, 'user_id', v_code.user_id,
    'mc_name', left(trim(p_name), 32), 'ore', v_ore);
END $$;

CREATE OR REPLACE FUNCTION public.mc_plugin_sync(p_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.mc_links%rowtype;
  v_ore integer;
  v_withdrawals jsonb;
BEGIN
  PERFORM public.mc_require_service();
  SELECT * INTO v_link FROM public.mc_links WHERE mc_uuid = p_uuid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  INSERT INTO public.mc_accounts (user_id) VALUES (v_link.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT ore INTO v_ore FROM public.mc_accounts WHERE user_id = v_link.user_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'amount', w.amount, 'created_at', w.created_at
         ) ORDER BY w.created_at), '[]'::jsonb)
    INTO v_withdrawals
    FROM (
      SELECT id, amount, created_at FROM public.mc_withdrawals
      WHERE user_id = v_link.user_id AND status = 'pending'
      ORDER BY created_at LIMIT 20
    ) w;

  RETURN jsonb_build_object(
    'linked', true, 'user_id', v_link.user_id,
    'mc_name', v_link.mc_name, 'ore', v_ore,
    'withdrawals', v_withdrawals);
END $$;

CREATE OR REPLACE FUNCTION public.mc_plugin_deposit(p_uuid uuid, p_amount integer, p_nonce text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.mc_links%rowtype;
  v_ore integer;
BEGIN
  PERFORM public.mc_require_service();
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Количество руды должно быть больше нуля'; END IF;
  IF p_nonce IS NULL OR length(p_nonce) < 8 THEN RAISE EXCEPTION 'Некорректный nonce операции'; END IF;

  SELECT * INTO v_link FROM public.mc_links WHERE mc_uuid = p_uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Сначала привяжи аккаунт: /sw link КОД'; END IF;

  -- Один и тот же nonce не может зачислить руду дважды (повтор после обрыва сети).
  PERFORM pg_advisory_xact_lock(hashtext('mc_deposit:' || p_nonce));

  IF EXISTS (SELECT 1 FROM public.mc_ledger WHERE nonce = p_nonce) THEN
    SELECT ore INTO v_ore FROM public.mc_accounts WHERE user_id = v_link.user_id;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'ore', v_ore);
  END IF;

  INSERT INTO public.mc_accounts (user_id) VALUES (v_link.user_id)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.mc_accounts
    SET ore = ore + p_amount, deposited = deposited + p_amount, updated_at = now()
    WHERE user_id = v_link.user_id
    RETURNING ore INTO v_ore;

  INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, nonce, meta)
    VALUES (v_link.user_id, 'deposit', p_amount, v_ore, p_nonce,
            jsonb_build_object('mc_name', v_link.mc_name));
  PERFORM public.mc_prune_ledger(v_link.user_id);

  RETURN jsonb_build_object(
    'ok', true, 'duplicate', false, 'ore', v_ore,
    'user_id', v_link.user_id);
END $$;

CREATE OR REPLACE FUNCTION public.mc_plugin_withdraw_claim(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_w public.mc_withdrawals%rowtype;
BEGIN
  PERFORM public.mc_require_service();
  SELECT * INTO v_w FROM public.mc_withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Заявка на вывод не найдена'; END IF;
  IF v_w.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'status', v_w.status);
  END IF;

  UPDATE public.mc_withdrawals
    SET status = 'delivered', delivered_at = now()
    WHERE id = p_id;

  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.mc_withdrawals WHERE user_id = v_w.user_id AND status <> 'pending'
  )
  DELETE FROM public.mc_withdrawals w USING ranked r
    WHERE w.id = r.id AND r.rn > 50;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'delivered', 'amount', v_w.amount,
    'user_id', v_w.user_id, 'mc_uuid', v_w.mc_uuid, 'mc_name', v_w.mc_name);
END $$;

CREATE OR REPLACE FUNCTION public.mc_plugin_withdraw_fail(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_w public.mc_withdrawals%rowtype;
  v_ore integer;
BEGIN
  PERFORM public.mc_require_service();
  SELECT * INTO v_w FROM public.mc_withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Заявка на вывод не найдена'; END IF;
  IF v_w.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'status', v_w.status);
  END IF;

  UPDATE public.mc_withdrawals
    SET status = 'failed', note = left(coalesce(p_reason, 'delivery failed'), 200)
    WHERE id = p_id;

  UPDATE public.mc_accounts
    SET ore = ore + v_w.amount,
        withdrawn = greatest(withdrawn - v_w.amount, 0),
        updated_at = now()
    WHERE user_id = v_w.user_id
    RETURNING ore INTO v_ore;

  INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, meta)
    VALUES (v_w.user_id, 'withdraw_refund', v_w.amount, v_ore,
            jsonb_build_object('withdrawal_id', p_id, 'reason', left(coalesce(p_reason, ''), 200)));
  PERFORM public.mc_prune_ledger(v_w.user_id);
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.mc_withdrawals WHERE user_id = v_w.user_id AND status <> 'pending'
  )
  DELETE FROM public.mc_withdrawals w USING ranked r
    WHERE w.id = r.id AND r.rn > 50;

  RETURN jsonb_build_object('ok', true, 'ore', v_ore);
END $$;

-- --------------------------------------------------------------------
-- 16.4 Права: клиентские RPC — игрокам, плагинные — только service_role
-- --------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.mc_require_service() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mc_prune_ledger(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.mc_plugin_ping(),
  public.mc_plugin_link(text, uuid, text),
  public.mc_plugin_sync(uuid),
  public.mc_plugin_deposit(uuid, integer, text),
  public.mc_plugin_withdraw_claim(uuid),
  public.mc_plugin_withdraw_fail(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.mc_plugin_ping(),
  public.mc_plugin_link(text, uuid, text),
  public.mc_plugin_sync(uuid),
  public.mc_plugin_deposit(uuid, integer, text),
  public.mc_plugin_withdraw_claim(uuid),
  public.mc_plugin_withdraw_fail(uuid, text)
TO service_role;

REVOKE ALL ON FUNCTION
  public.mc_create_link_code(),
  public.mc_status(),
  public.mc_unlink(),
  public.mc_withdraw_ore(integer),
  public.mc_convert(integer),
  public.mc_buy_ore(integer),
  public.mc_dig_start(integer),
  public.mc_dig_step(uuid),
  public.mc_dig_cashout(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.mc_create_link_code(),
  public.mc_status(),
  public.mc_unlink(),
  public.mc_withdraw_ore(integer),
  public.mc_convert(integer),
  public.mc_buy_ore(integer),
  public.mc_dig_start(integer),
  public.mc_dig_step(uuid),
  public.mc_dig_cashout(uuid)
TO authenticated;

-- Гостю показываем курсы и приглашение войти, но не его баланс.
GRANT EXECUTE ON FUNCTION public.mc_status() TO anon;

GRANT SELECT ON public.mc_config TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
