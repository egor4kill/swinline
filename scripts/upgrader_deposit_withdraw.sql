-- ====================================================================
-- Upgrader Deposit & Withdraw (Minecraft Server Bridge)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.upgrader_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mc_uuid uuid NOT NULL,
  mc_name text NOT NULL,
  item_id text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  durability numeric,
  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upgrader_withdrawals_player ON public.upgrader_withdrawals(mc_uuid, status);
ALTER TABLE public.upgrader_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upgrader_withdrawals_select_own ON public.upgrader_withdrawals;
CREATE POLICY upgrader_withdrawals_select_own ON public.upgrader_withdrawals FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON public.upgrader_withdrawals TO authenticated, anon;

-- Сбрасываем начальный тестовый инвентарь в пустой массив
CREATE OR REPLACE FUNCTION public._upgrader_initial_inventory()
RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT '[]'::jsonb
$fn$;

-- Очищаем текущие тестовые инвентари игроков
UPDATE public.upgrader_profiles
SET inventory = '[]'::jsonb,
    history = '[]'::jsonb;

-- Внесение предмета из Minecraft на сайт
CREATE OR REPLACE FUNCTION public.upgrader_plugin_deposit(
  p_mc_uuid uuid,
  p_mc_name text,
  p_item_id text,
  p_count integer,
  p_durability numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid;
  v_profile public.upgrader_profiles;
  v_inv jsonb;
  v_dest integer;
  v_item_id text := lower(trim(p_item_id));
  v_count integer := coalesce(p_count, 1);
  v_catalog_max integer := 64;
  v_slot text;
BEGIN
  IF v_count < 1 THEN
    RAISE EXCEPTION 'Некорректное количество (должно быть >= 1)';
  END IF;

  SELECT user_id INTO v_uid
    FROM public.mc_links
    WHERE mc_uuid = p_mc_uuid;

  IF v_uid IS NULL THEN
    SELECT user_id INTO v_uid
      FROM public.mc_links
      WHERE lower(mc_name) = lower(p_mc_name);
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Аккаунт Minecraft не привязан к сайту. Нажмите "Привязать" на сайте и введите /up link <код>';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.upgrader_catalog WHERE id = v_item_id) THEN
    INSERT INTO public.upgrader_catalog (id, name, value, max_count, rarity)
    VALUES (v_item_id, initcap(replace(v_item_id, '_', ' ')), 1, 64, 'common')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT coalesce(max_count, 64) INTO v_catalog_max
    FROM public.upgrader_catalog WHERE id = v_item_id;

  PERFORM public.server_discover_item(v_item_id, coalesce(p_mc_name, 'Игрок'));

  INSERT INTO public.upgrader_profiles (user_id, inventory, history)
  VALUES (v_uid, '[]'::jsonb, '[]'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_profile FROM public.upgrader_profiles WHERE user_id = v_uid FOR UPDATE;
  v_inv := coalesce(v_profile.inventory, '[]'::jsonb);

  IF p_durability IS NULL OR p_durability >= 1.0 THEN
    SELECT (t.ord - 1) INTO v_dest
      FROM jsonb_array_elements(v_inv) WITH ORDINALITY t(elem, ord)
      WHERE t.elem->>'id' = v_item_id
        AND t.elem->>'durability' IS NULL
        AND ((t.elem->>'count')::integer + v_count) <= v_catalog_max
      LIMIT 1;

    IF v_dest IS NOT NULL THEN
      v_inv := jsonb_set(
        v_inv,
        ARRAY[v_dest::text, 'count'],
        to_jsonb(((v_inv->v_dest)->>'count')::integer + v_count),
        false
      );
    ELSE
      v_slot := 's_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(gen_random_uuid()::text, 1, 6);
      v_inv := v_inv || jsonb_build_array(jsonb_build_object(
        'slot', v_slot,
        'id', v_item_id,
        'count', v_count
      ));
    END IF;
  ELSE
    v_slot := 's_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(gen_random_uuid()::text, 1, 6);
    v_inv := v_inv || jsonb_build_array(jsonb_build_object(
      'slot', v_slot,
      'id', v_item_id,
      'count', 1,
      'durability', round(p_durability, 3)
    ));
  END IF;

  UPDATE public.upgrader_profiles
    SET inventory = v_inv,
        updated_at = now()
    WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_uid,
    'item_id', v_item_id,
    'count', v_count,
    'mc_name', p_mc_name
  );
END $fn$;
GRANT EXECUTE ON FUNCTION public.upgrader_plugin_deposit(uuid, text, text, integer, numeric) TO authenticated, anon, service_role;

-- Вывод предмета с сайта в очередь выдачи в игре
CREATE OR REPLACE FUNCTION public.upgrader_withdraw(p_slot text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.upgrader_profiles;
  v_inv jsonb;
  v_idx integer;
  v_elem jsonb;
  v_item_id text;
  v_count integer;
  v_durability numeric;
  v_link public.mc_links%rowtype;
  v_withdrawal_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужно войти через Twitch';
  END IF;
  PERFORM public.assert_not_blocked();

  SELECT * INTO v_link FROM public.mc_links WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сначала привяжите Minecraft-аккаунт через команду /sw link <код>';
  END IF;

  SELECT * INTO v_profile FROM public.upgrader_profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND OR coalesce(v_profile.inventory, '[]'::jsonb) = '[]'::jsonb THEN
    RAISE EXCEPTION 'Инвентарь пуст';
  END IF;
  v_inv := v_profile.inventory;

  SELECT (t.ord - 1) INTO v_idx
    FROM jsonb_array_elements(v_inv) WITH ORDINALITY t(elem, ord)
    WHERE t.elem->>'slot' = p_slot
    LIMIT 1;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'Предмет не найден в инвентаре';
  END IF;

  v_elem := v_inv->v_idx;
  v_item_id := v_elem->>'id';
  v_count := coalesce((v_elem->>'count')::integer, 1);
  v_durability := (v_elem->>'durability')::numeric;

  IF v_count <= 1 THEN
    v_inv := v_inv - v_idx;
    v_count := 1;
  ELSE
    v_inv := jsonb_set(
      v_inv,
      ARRAY[v_idx::text, 'count'],
      to_jsonb(v_count - 1),
      false
    );
    v_count := 1;
  END IF;

  UPDATE public.upgrader_profiles
    SET inventory = v_inv,
        updated_at = now()
    WHERE user_id = v_uid;

  INSERT INTO public.upgrader_withdrawals (
    user_id, mc_uuid, mc_name, item_id, count, durability, status
  ) VALUES (
    v_uid, v_link.mc_uuid, v_link.mc_name, v_item_id, v_count, v_durability, 'pending'
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'item_id', v_item_id,
    'count', v_count,
    'inventory', v_inv
  );
END $fn$;
GRANT EXECUTE ON FUNCTION public.upgrader_withdraw(text) TO authenticated;

-- Получение сервером заявок на вывод для выдачи игроку
CREATE OR REPLACE FUNCTION public.upgrader_plugin_claim_withdrawals(p_mc_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_items jsonb;
BEGIN
  WITH claimed AS (
    UPDATE public.upgrader_withdrawals
    SET status = 'claimed',
        claimed_at = now()
    WHERE mc_uuid = p_mc_uuid AND status = 'pending'
    RETURNING id, item_id, count, durability
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'item_id', item_id,
    'count', count,
    'durability', durability
  )), '[]'::jsonb) INTO v_items
  FROM claimed;

  RETURN v_items;
END $fn$;
GRANT EXECUTE ON FUNCTION public.upgrader_plugin_claim_withdrawals(uuid) TO authenticated, anon, service_role;

-- Получение инвентаря игрока с сайта (для команды /up balance / /up inv)
CREATE OR REPLACE FUNCTION public.upgrader_plugin_get_inventory(p_mc_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid;
  v_profile public.upgrader_profiles;
BEGIN
  SELECT user_id INTO v_uid FROM public.mc_links WHERE mc_uuid = p_mc_uuid;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('linked', false, 'inventory', '[]'::jsonb);
  END IF;
  SELECT * INTO v_profile FROM public.upgrader_profiles WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'linked', true,
    'user_id', v_uid,
    'inventory', coalesce(v_profile.inventory, '[]'::jsonb)
  );
END $fn$;
GRANT EXECUTE ON FUNCTION public.upgrader_plugin_get_inventory(uuid) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
