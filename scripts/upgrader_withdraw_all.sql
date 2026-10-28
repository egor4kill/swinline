-- ====================================================================
-- Upgrader: вывод всех предметов одного типа + фиксы моста.
--   1. upgrader_withdraw_all(p_item_id) — выводит ВСЕ предметы одного
--      типа из инвентаря: стак железа целиком, а если стаков несколько —
--      все. Предметы с прочностью выводятся отдельными заявками по
--      группам прочности (в одном стаке Minecraft прочность не смешивают).
--   2. ФИКС deposit: INSERT в upgrader_catalog ссылался на колонки
--      name/rarity, которых в таблице нет — занос предмета, которого ещё
--      нет в каталоге, падал с ошибкой.
--   3. ФИКС доступов: плагинные RPC (deposit/claim/inventory/discovery)
--      были открыты всем — любой вошедший мог чужим mc_uuid забрать
--      чужие выводы (пометить claimed), подкинуть предметы в чужой
--      инвентарь или открыть весь каталог без игры. Теперь только
--      service_role (плагин ходит с сервисным ключом).
-- ====================================================================

-- 1. Вывод всех предметов одного типа
CREATE OR REPLACE FUNCTION public.upgrader_withdraw_all(p_item_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_item text := lower(trim(p_item_id));
  v_profile public.upgrader_profiles;
  v_inv jsonb;
  v_rest jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_ord integer;
  v_plain_count integer := 0;
  v_dur jsonb := '[]'::jsonb;  -- массив {durability, count}
  v_dur_idx integer;
  v_i integer;
  v_link public.mc_links%rowtype;
  v_total integer := 0;
  v_rows integer := 0;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужно войти через Twitch';
  END IF;
  PERFORM public.assert_not_blocked();
  IF v_item IS NULL OR v_item = '' THEN
    RAISE EXCEPTION 'Не выбран предмет';
  END IF;

  SELECT * INTO v_link FROM public.mc_links WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Сначала привяжите Minecraft-аккаунт через команду /sw link <код>';
  END IF;

  SELECT * INTO v_profile FROM public.upgrader_profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Инвентарь пуст';
  END IF;
  v_inv := coalesce(v_profile.inventory, '[]'::jsonb);

  FOR v_elem, v_ord IN
    SELECT elem, ord FROM jsonb_array_elements(v_inv) WITH ORDINALITY t(elem, ord)
  LOOP
    IF lower(v_elem->>'id') = v_item THEN
      v_total := v_total + coalesce((v_elem->>'count')::integer, 1);
      IF v_elem->>'durability' IS NULL THEN
        v_plain_count := v_plain_count + coalesce((v_elem->>'count')::integer, 1);
      ELSE
        -- группируем по прочности (после FOR переменная всегда NULL,
        -- поэтому ищем через отдельную переменную-флаг)
        v_dur_idx := NULL;
        FOR v_i IN 0 .. jsonb_array_length(v_dur) - 1 LOOP
          IF (v_dur->v_i->>'durability')::numeric = (v_elem->>'durability')::numeric THEN
            v_dur_idx := v_i;
            EXIT;
          END IF;
        END LOOP;
        IF v_dur_idx IS NULL THEN
          v_dur := v_dur || jsonb_build_array(jsonb_build_object(
            'durability', round((v_elem->>'durability')::numeric, 3),
            'count', 1
          ));
        ELSE
          v_dur := jsonb_set(v_dur, ARRAY[v_dur_idx::text, 'count'],
            to_jsonb((v_dur->v_dur_idx->>'count')::integer + 1), false);
        END IF;
      END IF;
    ELSE
      v_rest := v_rest || v_elem;
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Предмет не найден в инвентаре';
  END IF;

  UPDATE public.upgrader_profiles
    SET inventory = v_rest, updated_at = now()
    WHERE user_id = v_uid;

  -- обычные (без прочности) — одной заявкой с общим количеством
  IF v_plain_count > 0 THEN
    INSERT INTO public.upgrader_withdrawals (user_id, mc_uuid, mc_name, item_id, count, durability, status)
    VALUES (v_uid, v_link.mc_uuid, v_link.mc_name, v_item, v_plain_count, NULL, 'pending');
    v_rows := v_rows + 1;
  END IF;
  -- предметы с прочностью — заявка на каждую группу прочности
  FOR v_row IN
    SELECT a.elem->>'durability' AS durability, (a.elem->>'count')::integer AS count
    FROM jsonb_array_elements(v_dur) a(elem)
  LOOP
    INSERT INTO public.upgrader_withdrawals (user_id, mc_uuid, mc_name, item_id, count, durability, status)
    VALUES (v_uid, v_link.mc_uuid, v_link.mc_name, v_item, v_row.count, v_row.durability::numeric, 'pending');
    v_rows := v_rows + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', v_item,
    'count_total', v_total,
    'withdrawal_rows', v_rows,
    'inventory', v_rest
  );
END $fn$;
GRANT EXECUTE ON FUNCTION public.upgrader_withdraw_all(text) TO authenticated;
REVOKE ALL ON FUNCTION public.upgrader_withdraw_all(text) FROM PUBLIC, anon;

-- 2. ФИКС deposit: несуществующие колонки name/rarity
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
    -- значение 1 — консервативная оценка для неизвестного предмета
    INSERT INTO public.upgrader_catalog (id, value, max_count)
    VALUES (v_item_id, 1, 64)
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
REVOKE ALL ON FUNCTION public.upgrader_plugin_deposit(uuid, text, text, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrader_plugin_deposit(uuid, text, text, integer, numeric) TO service_role;

-- 3. ФИКС доступов: плагинные RPC — только сервисный ключ
REVOKE ALL ON FUNCTION public.upgrader_plugin_claim_withdrawals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrader_plugin_claim_withdrawals(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.upgrader_plugin_get_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrader_plugin_get_inventory(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.server_discover_item(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_discover_item(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
