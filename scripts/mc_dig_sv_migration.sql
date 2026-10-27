-- ====================================================================
-- «Шахта»: вторая валюта — обычные SV₽ (в дополнение к АР).
-- Применить один раз в SQL Editor после основной схемы.
-- Клиент включает выбор SV₽ только когда mc_status вернёт sv_enabled = true,
-- поэтому до применения этого файла сайт продолжает работать в АР.
-- ====================================================================

ALTER TABLE public.mc_dig_rounds
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ar';

DO $c$ BEGIN
  ALTER TABLE public.mc_dig_rounds
    ADD CONSTRAINT mc_dig_rounds_currency_check CHECK (currency IN ('sv', 'ar'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $c$;

-- Статус: отдаём оба баланса, валюту активного спуска и признак поддержки SV₽
CREATE OR REPLACE FUNCTION public.mc_status()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conf public.mc_config%rowtype;
  v_link public.mc_links%rowtype;
  v_acc public.mc_accounts%rowtype;
  v_bal numeric;
  v_round jsonb;
  v_pending jsonb;
BEGIN
  SELECT * INTO v_conf FROM public.mc_config WHERE id;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'authed', false, 'linked', false, 'ore', 0, 'sv_bal', 0,
      'sv_enabled', true,
      'unit', 'АР', 'ore_per_unit', 1,
      'min_withdraw', v_conf.min_withdraw,
      'bust_chance', v_conf.dig_bust, 'rtp', v_conf.dig_rtp,
      'max_depth', v_conf.dig_max_depth,
      'pending', '[]'::jsonb, 'round', NULL);
  END IF;

  SELECT * INTO v_link FROM public.mc_links WHERE user_id = v_uid;
  INSERT INTO public.mc_accounts (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_acc FROM public.mc_accounts WHERE user_id = v_uid;
  SELECT bal INTO v_bal FROM public.profiles WHERE id = v_uid;

  SELECT to_jsonb(r) INTO v_round
    FROM (
      SELECT id, stake, depth, mult, status, payout, currency, created_at
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
    'sv_bal', coalesce(v_bal, 0),
    'sv_enabled', true,
    'unit', 'АР', 'ore_per_unit', 1,
    'deposited', coalesce(v_acc.deposited, 0),
    'withdrawn', coalesce(v_acc.withdrawn, 0),
    'min_withdraw', v_conf.min_withdraw,
    'bust_chance', v_conf.dig_bust,
    'rtp', v_conf.dig_rtp,
    'max_depth', v_conf.dig_max_depth,
    'pending', v_pending,
    'round', v_round);
END $$;

DROP FUNCTION IF EXISTS public.mc_dig_start(integer);
DROP FUNCTION IF EXISTS public.mc_dig_start(integer, text);

CREATE OR REPLACE FUNCTION public.mc_dig_start(p_stake integer, p_currency text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cur text := CASE WHEN p_currency = 'sv' THEN 'sv' ELSE 'ar' END;
  v_id uuid;
  v_round public.mc_dig_rounds%rowtype;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF p_stake IS NULL OR p_stake < (CASE WHEN v_cur = 'ar' THEN 1 ELSE 10 END) THEN
    RAISE EXCEPTION 'Минимальная ставка — % %',
      CASE WHEN v_cur = 'ar' THEN 1 ELSE 10 END,
      CASE WHEN v_cur = 'ar' THEN 'АР' ELSE 'SV₽' END;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mc_dig_rounds WHERE user_id = auth.uid() AND status = 'play') THEN
    RAISE EXCEPTION 'Сначала заверши текущий спуск';
  END IF;

  v_bal := public.game_debit(p_stake::numeric, v_cur);

  INSERT INTO public.mc_dig_rounds (user_id, stake, currency)
    VALUES (auth.uid(), p_stake, v_cur) RETURNING id INTO v_id;

  IF v_cur = 'ar' THEN
    INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, meta)
      VALUES (auth.uid(), 'dig_stake', -p_stake, v_bal,
              jsonb_build_object('round_id', v_id, 'currency', v_cur));
    PERFORM public.mc_prune_ledger(auth.uid());
  END IF;

  SELECT * INTO v_round FROM public.mc_dig_rounds WHERE id = v_id;
  RETURN jsonb_build_object(
    'round', to_jsonb(v_round),
    'ore', public.game_balance('ar'),
    'sv_bal', public.game_balance('sv'),
    'currency', v_cur,
    'potential', p_stake);
END $$;

REVOKE ALL ON FUNCTION public.mc_dig_start(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mc_dig_start(integer, text) TO authenticated;

-- Совместимость со старым кэшированным клиентом: вызов с одной ставкой = АР
CREATE OR REPLACE FUNCTION public.mc_dig_start(p_stake integer)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mc_dig_start(p_stake, 'ar');
$$;

REVOKE ALL ON FUNCTION public.mc_dig_start(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mc_dig_start(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mc_dig_step(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conf public.mc_config%rowtype;
  v_round public.mc_dig_rounds%rowtype;
  v_depth integer;
  v_mult numeric;
  v_ore numeric;
  v_sv numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  SELECT * INTO v_conf FROM public.mc_config WHERE id;

  SELECT * INTO v_round FROM public.mc_dig_rounds
    WHERE id = p_round AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Спуск не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Спуск уже завершён'; END IF;
  IF v_round.depth >= v_conf.dig_max_depth THEN
    RAISE EXCEPTION 'Глубже некуда — забирай %', round(v_round.stake * v_round.mult, 2);
  END IF;

  IF random() < v_conf.dig_bust THEN
    UPDATE public.mc_dig_rounds
      SET status = 'busted', payout = 0
      WHERE id = p_round;
    v_ore := public.game_balance('ar');
    v_sv := public.game_balance('sv');
    PERFORM public.mc_prune_ledger(auth.uid());
    WITH ranked AS (
      SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
      FROM public.mc_dig_rounds WHERE user_id = auth.uid() AND status <> 'play'
    )
    DELETE FROM public.mc_dig_rounds d USING ranked r
      WHERE d.id = r.id AND r.rn > 20;
    RETURN jsonb_build_object(
      'busted', true, 'depth', v_round.depth, 'mult', v_round.mult,
      'payout', 0, 'ore', v_ore, 'sv_bal', v_sv, 'currency', v_round.currency);
  END IF;

  v_depth := v_round.depth + 1;
  v_mult := round(v_conf.dig_rtp / power(1 - v_conf.dig_bust, v_depth), 4);
  UPDATE public.mc_dig_rounds
    SET depth = v_depth, mult = v_mult
    WHERE id = p_round;

  v_ore := public.game_balance('ar');
  v_sv := public.game_balance('sv');
  RETURN jsonb_build_object(
    'busted', false, 'depth', v_depth, 'mult', v_mult,
    'potential', round(v_round.stake * v_mult, 2),
    'ore', v_ore, 'sv_bal', v_sv, 'currency', v_round.currency);
END $$;

CREATE OR REPLACE FUNCTION public.mc_dig_cashout(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.mc_dig_rounds%rowtype;
  v_payout numeric;
  v_cur text;
  v_ore numeric;
  v_sv numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();

  SELECT * INTO v_round FROM public.mc_dig_rounds
    WHERE id = p_round AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Спуск не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Спуск уже завершён'; END IF;

  v_cur := coalesce(v_round.currency, 'ar');
  v_payout := round(v_round.stake * v_round.mult, 2);
  UPDATE public.mc_dig_rounds
    SET status = 'cashed', payout = v_payout
    WHERE id = p_round;

  IF v_cur = 'ar' THEN
    UPDATE public.mc_accounts
      SET ore = ore + v_payout, updated_at = now()
      WHERE user_id = auth.uid()
      RETURNING ore INTO v_ore;

    INSERT INTO public.mc_ledger (user_id, kind, amount, ore_after, meta)
      VALUES (auth.uid(), 'dig_win', v_payout, v_ore,
              jsonb_build_object('round_id', p_round, 'stake', v_round.stake,
                                 'depth', v_round.depth, 'mult', v_round.mult,
                                 'currency', v_cur));
    PERFORM public.mc_prune_ledger(auth.uid());
  ELSE
    PERFORM public.game_credit(v_payout, 'sv');
  END IF;

  v_ore := public.game_balance('ar');
  v_sv := public.game_balance('sv');

  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM public.mc_dig_rounds WHERE user_id = auth.uid() AND status <> 'play'
  )
  DELETE FROM public.mc_dig_rounds d USING ranked r
    WHERE d.id = r.id AND r.rn > 20;

  RETURN jsonb_build_object(
    'ok', true, 'payout', v_payout, 'ore', v_ore, 'sv_bal', v_sv,
    'currency', v_cur, 'depth', v_round.depth, 'mult', v_round.mult);
END $$;

NOTIFY pgrst, 'reload schema';
