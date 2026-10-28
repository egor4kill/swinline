-- ====================================================================
-- 28. Minecraft Upgrader на сайте: серверный инвентарь и броски.
--     Каталог цен — scripts/upgrader_catalog.sql.
--     Клиент (public/upgrader) только рисует; сервер решает и хранит.
--     Баланс для выживания:
--       1. Ставка строго 1 предмет, цель 1 предмет
--       2. Честный 100% RTP (без комиссии казино)
--       3. Защита от автокликеров (кулдаун 1.5 сек)
--       4. Каталог наград только из открытых игроками предметов (server_discovered_items)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.upgrader_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inventory jsonb NOT NULL DEFAULT '[]'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_upgrade_at timestamptz,
  last_reset_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.upgrader_attempts (
  request_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Таблица открытых на сервере предметов (World Discovery)
CREATE TABLE IF NOT EXISTS public.server_discovered_items (
  id text PRIMARY KEY REFERENCES public.upgrader_catalog(id) ON DELETE CASCADE,
  discovered_by text NOT NULL DEFAULT 'world',
  discovered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upgrader_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upgrader_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_discovered_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.upgrader_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.upgrader_attempts FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Public read discovered items" ON public.server_discovered_items;
CREATE POLICY "Public read discovered items" ON public.server_discovered_items FOR SELECT USING (true);
GRANT SELECT ON public.server_discovered_items TO authenticated, anon;

CREATE OR REPLACE FUNCTION public._upgrader_initial_inventory()
RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT '[{"slot":"s1","id":"iron_ingot","count":48},{"slot":"s2","id":"gold_ingot","count":16},{"slot":"s3","id":"diamond","count":8},{"slot":"s4","id":"emerald","count":12},{"slot":"s5","id":"iron_pickaxe","count":1,"durability":0.56},{"slot":"s6","id":"apple","count":16},{"slot":"s7","id":"ender_pearl","count":4},{"slot":"s8","id":"diamond_sword","count":1},{"slot":"s9","id":"golden_apple","count":3},{"slot":"s10","id":"oak_log","count":64},{"slot":"s11","id":"grass_block","count":32},{"slot":"s12","id":"netherite_ingot","count":1},{"slot":"s13","id":"ender_eye","count":8},{"slot":"s14","id":"amethyst_shard","count":24},{"slot":"s15","id":"redstone","count":64},{"slot":"s16","id":"lapis_lazuli","count":32},{"slot":"s17","id":"diamond_pickaxe","count":1},{"slot":"s18","id":"obsidian","count":16},{"slot":"s19","id":"experience_bottle","count":16},{"slot":"s20","id":"cooked_beef","count":32}]'::jsonb
$fn$;

CREATE OR REPLACE FUNCTION public.server_discover_item(p_id text, p_player text DEFAULT 'world')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.upgrader_catalog WHERE id = p_id) THEN
    RETURN false;
  END IF;
  INSERT INTO public.server_discovered_items (id, discovered_by, discovered_at)
  VALUES (p_id, coalesce(p_player, 'world'), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.server_discover_item(text, text) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.upgrader_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.upgrader_profiles;
  v_discovered jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужно войти через Twitch';
  END IF;
  PERFORM public.assert_not_blocked();

  INSERT INTO public.upgrader_profiles (user_id, inventory, history)
  VALUES (v_uid, public._upgrader_initial_inventory(), '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_profile FROM public.upgrader_profiles WHERE user_id = v_uid;

  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO v_discovered
  FROM public.server_discovered_items;

  RETURN jsonb_build_object(
    'inventory', v_profile.inventory,
    'history', v_profile.history,
    'discovered', v_discovered
  );
END $$;

CREATE OR REPLACE FUNCTION public.upgrader_upgrade(
  p_slot text,
  p_stake_count integer,
  p_target text,
  p_target_count integer,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.upgrader_profiles;
  v_inv jsonb;
  v_history jsonb;
  v_existing jsonb;
  v_idx integer;
  v_dest integer;
  v_source jsonb;
  v_source_id text;
  v_count integer;
  v_durability numeric;
  v_source_value numeric;
  v_target_value numeric;
  v_target_max integer;
  v_odds numeric;
  v_roll double precision;
  v_won boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужно войти через Twitch';
  END IF;
  PERFORM public.assert_not_blocked();

  IF p_request_id IS NULL OR length(p_request_id) < 8 OR length(p_request_id) > 100 THEN
    RAISE EXCEPTION 'Некорректный идентификатор попытки';
  END IF;
  IF p_slot IS NULL OR p_target IS NULL THEN
    RAISE EXCEPTION 'Не выбран предмет';
  END IF;

  -- БАЛАНС ВЫЖИВАНИЯ: СТРОГО 1 ПРЕДМЕТ
  IF p_stake_count IS NULL OR p_stake_count != 1 THEN
    RAISE EXCEPTION 'При апгрейде можно использовать только 1 предмет';
  END IF;
  IF p_target_count IS NULL OR p_target_count != 1 THEN
    RAISE EXCEPTION 'Награда может быть только в количестве 1 шт.';
  END IF;

  INSERT INTO public.upgrader_profiles (user_id, inventory, history)
  VALUES (v_uid, public._upgrader_initial_inventory(), '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_profile FROM public.upgrader_profiles WHERE user_id = v_uid FOR UPDATE;
  v_inv := v_profile.inventory;
  v_history := v_profile.history;

  -- ЗАЩИТА ОТ АВТОКЛИКЕРА: кулдаун 1.5 секунды между бросками
  IF v_profile.last_upgrade_at IS NOT NULL
     AND v_profile.last_upgrade_at > now() - interval '1.5 seconds' THEN
    RAISE EXCEPTION 'Слишком быстро! Подождите завершения попытки.';
  END IF;

  SELECT result INTO v_existing
    FROM public.upgrader_attempts
    WHERE request_id = p_request_id AND user_id = v_uid;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('inventory', v_inv, 'history', v_history, 'result', v_existing);
  END IF;
  IF EXISTS (SELECT 1 FROM public.upgrader_attempts WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'Запрос уже использован';
  END IF;

  SELECT (t.ord - 1) INTO v_idx
    FROM jsonb_array_elements(v_inv) WITH ORDINALITY t(elem, ord)
    WHERE t.elem->>'slot' = p_slot
    LIMIT 1;
  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'Слот не найден';
  END IF;
  v_source := v_inv->v_idx;
  v_count := coalesce((v_source->>'count')::integer, 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'В выбранном слоте нет предметов';
  END IF;

  v_source_id := v_source->>'id';
  SELECT value INTO v_source_value FROM public.upgrader_catalog WHERE id = v_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Неизвестный предмет ставки';
  END IF;
  v_durability := coalesce((v_source->>'durability')::numeric, 1);
  IF v_durability < 0 OR v_durability > 1 THEN
    RAISE EXCEPTION 'Некорректная прочность';
  END IF;

  -- WORLD DISCOVERY: предмет цели должен быть открыт на сервере
  IF NOT EXISTS (SELECT 1 FROM public.server_discovered_items WHERE id = p_target) THEN
    RAISE EXCEPTION 'Этот предмет ещё не был открыт ни одним игроком на сервере!';
  END IF;

  SELECT value, max_count INTO v_target_value, v_target_max
    FROM public.upgrader_catalog WHERE id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Неизвестная награда';
  END IF;

  -- ЧЕСТНЫЙ 100% RTP (без маржи казино): stake / target, максимум 100%
  v_odds := least(
    1.0::numeric,
    (v_source_value * v_durability) / v_target_value
  );
  v_roll := random();
  v_won := v_roll < v_odds;

  IF v_count = 1 THEN
    v_inv := v_inv - v_idx;
  ELSE
    v_inv := jsonb_set(
      v_inv,
      ARRAY[v_idx::text, 'count'],
      to_jsonb(v_count - 1),
      false
    );
  END IF;

  IF v_won THEN
    SELECT (t.ord - 1) INTO v_dest
      FROM jsonb_array_elements(v_inv) WITH ORDINALITY t(elem, ord)
      WHERE t.elem->>'id' = p_target
        AND t.elem->>'durability' IS NULL
        AND (t.elem->>'count')::integer + 1 <= v_target_max
      LIMIT 1;
    IF v_dest IS NOT NULL THEN
      v_inv := jsonb_set(
        v_inv,
        ARRAY[v_dest::text, 'count'],
        to_jsonb(((v_inv->v_dest)->>'count')::integer + 1),
        false
      );
    ELSE
      v_inv := v_inv || jsonb_build_array(jsonb_build_object(
        'slot', p_request_id,
        'id', p_target,
        'count', 1
      ));
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'id', p_request_id,
    'won', v_won,
    'roll', v_roll,
    'chance', v_odds,
    'stake', v_source_id,
    'stakeCount', 1,
    'target', p_target,
    'targetCount', 1,
    'at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  v_history := jsonb_build_array(v_result) || v_history;
  SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb) INTO v_history
    FROM (
      SELECT elem, ord
      FROM jsonb_array_elements(v_history) WITH ORDINALITY t(elem, ord)
      ORDER BY ord
      LIMIT 20
    ) s;

  UPDATE public.upgrader_profiles
    SET inventory = v_inv,
        history = v_history,
        last_upgrade_at = now(),
        updated_at = now()
    WHERE user_id = v_uid;

  INSERT INTO public.upgrader_attempts (request_id, user_id, result)
  VALUES (p_request_id, v_uid, v_result);

  INSERT INTO public.game_attempts (user_id, game, result)
  VALUES (v_uid, 'upgrader', v_result);

  RETURN jsonb_build_object('inventory', v_inv, 'history', v_history, 'result', v_result);
END $$;

CREATE OR REPLACE FUNCTION public.upgrader_reset()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.upgrader_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужно войти через Twitch';
  END IF;
  PERFORM public.assert_not_blocked();

  INSERT INTO public.upgrader_profiles (user_id, inventory, history)
  VALUES (v_uid, public._upgrader_initial_inventory(), '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_profile FROM public.upgrader_profiles WHERE user_id = v_uid FOR UPDATE;

  IF v_profile.last_reset_at IS NOT NULL
     AND v_profile.last_reset_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Сброс доступен раз в 24 часа';
  END IF;

  UPDATE public.upgrader_profiles
    SET inventory = public._upgrader_initial_inventory(),
        history = '[]'::jsonb,
        last_reset_at = now(),
        updated_at = now()
    WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'inventory', public._upgrader_initial_inventory(),
    'history', '[]'::jsonb
  );
END $$;

REVOKE ALL ON FUNCTION public._upgrader_initial_inventory() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upgrader_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upgrader_upgrade(text, integer, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upgrader_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upgrader_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrader_upgrade(text, integer, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrader_reset() TO authenticated;

NOTIFY pgrst, 'reload schema';
