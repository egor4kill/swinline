-- ====================================================================
-- 26. «ОЛИМП» на сайте: серверная сессия, по-вращению, SV₽/АР.
--     Клиент (public/olympus) только рисует кадры; ставка, фриспины,
--     множитель и выплата живут здесь. Условных кредитов больше нет.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.olympus_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'sv' CHECK (currency IN ('sv', 'ar')),
  bet numeric(18,2) NOT NULL DEFAULT 10 CHECK (bet > 0),
  free integer NOT NULL DEFAULT 0 CHECK (free >= 0),
  bonus_multiplier numeric(18,2) NOT NULL DEFAULT 0 CHECK (bonus_multiplier >= 0),
  round_win numeric(18,2) NOT NULL DEFAULT 0 CHECK (round_win >= 0),
  bonus_win numeric(18,2) NOT NULL DEFAULT 0 CHECK (bonus_win >= 0),
  spin_no integer NOT NULL DEFAULT 0 CHECK (spin_no >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.olympus_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.olympus_sessions FROM PUBLIC, anon, authenticated;

-- состояние кошелька и бонуса для окна игры
CREATE OR REPLACE FUNCTION public.olympus_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_s public.olympus_sessions;
  v_sv numeric := 0;
  v_ar numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authed', false);
  END IF;

  SELECT * INTO v_s FROM public.olympus_sessions WHERE user_id = v_uid;
  SELECT coalesce(bal, 0) INTO v_sv FROM public.profiles WHERE id = v_uid;
  SELECT coalesce(ore, 0) INTO v_ar FROM public.mc_accounts WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'authed', true,
    'currency', coalesce(v_s.currency, 'sv'),
    'bet', coalesce(v_s.bet, 10),
    'free', coalesce(v_s.free, 0),
    'bonus_multiplier', coalesce(v_s.bonus_multiplier, 0),
    'round_win', coalesce(v_s.round_win, 0),
    'bonus_win', coalesce(v_s.bonus_win, 0),
    'sv_bal', v_sv,
    'ar_bal', v_ar,
    'min_sv', 10,
    'min_ar', 1
  );
END $$;

-- одно вращение: база или фриспин; сессия и кошелёк меняются здесь
CREATE OR REPLACE FUNCTION public.olympus_play(p_stake numeric, p_currency text DEFAULT 'sv')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur text;
  v_stake numeric;
  v_s public.olympus_sessions;
  v_is_free boolean;
  v_free integer;
  v_mult numeric;
  v_round_win numeric;
  v_bonus_win numeric;
  v_spin integer;
  v_seed bigint;
  v_state bigint;
  v_res jsonb;
  v_raw numeric;
  v_remaining numeric;
  v_win numeric;
  v_bal numeric;
  v_capped boolean := false;
  v_bonus_ended boolean := false;
  v_awarded integer;
  v_casino jsonb;
  v_jackpot numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужно войти через Twitch';
  END IF;
  PERFORM public.assert_not_blocked();
  IF p_currency IS NOT NULL AND p_currency NOT IN ('sv', 'ar') THEN
    RAISE EXCEPTION 'Валюта: sv или ar';
  END IF;

  SELECT * INTO v_s FROM public.olympus_sessions WHERE user_id = v_uid FOR UPDATE;
  v_free := coalesce(v_s.free, 0);
  v_mult := coalesce(v_s.bonus_multiplier, 0);
  v_round_win := coalesce(v_s.round_win, 0);
  v_bonus_win := coalesce(v_s.bonus_win, 0);
  v_spin := coalesce(v_s.spin_no, 0);
  v_is_free := v_free > 0;

  IF v_is_free THEN
    IF p_currency IS NOT NULL AND p_currency <> coalesce(v_s.currency, 'sv') THEN
      RAISE EXCEPTION 'Валюта зафиксирована до конца бонуса';
    END IF;
    v_cur := coalesce(v_s.currency, 'sv');
    v_stake := coalesce(v_s.bet, 10);
  ELSE
    v_cur := coalesce(p_currency, 'sv');
    IF p_stake IS NULL OR p_stake <= 0 THEN
      RAISE EXCEPTION 'Некорректная ставка';
    END IF;
    v_stake := p_stake;
    v_bal := public.game_debit(v_stake, v_cur);
    IF v_cur = 'sv' THEN
      v_casino := public.casino_take(v_stake);
      v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
      v_jackpot := coalesce((v_casino->>'jackpot')::numeric, 0);
    END IF;
    v_free := 0;
    v_mult := 0;
    v_round_win := 0;
    v_bonus_win := 0;
    v_spin := 0;
  END IF;

  v_seed := floor(random() * 4294967296)::bigint;
  v_state := v_seed % 4294967296;
  SELECT r.state, r.result INTO v_state, v_res
    FROM public._olympus_resolve(
      v_state,
      v_stake,
      v_mult,
      v_is_free,
      CASE WHEN v_is_free THEN 'free' ELSE 'base' END,
      CASE WHEN v_is_free THEN v_free ELSE 1 END
    ) r;

  v_raw := coalesce((v_res->>'raw_win')::numeric, 0);
  v_remaining := greatest(0, v_stake * 15000 - v_round_win);
  v_win := least(v_raw, v_remaining);
  IF v_win > 0 THEN
    v_bal := public.game_credit(v_win, v_cur);
  END IF;

  IF v_is_free THEN
    v_free := v_free - 1;
    v_round_win := v_round_win + v_win;
    v_bonus_win := v_bonus_win + v_win;
  ELSE
    v_round_win := v_win;
    v_bonus_win := 0;
  END IF;

  v_mult := coalesce((v_res->>'next_multiplier')::numeric, v_mult);
  v_awarded := coalesce((v_res->>'awarded')::integer, 0);
  IF v_awarded > 0 THEN
    v_free := v_free + v_awarded;
    IF NOT v_is_free THEN
      v_mult := 0;
      v_bonus_win := 0;
    END IF;
  END IF;

  v_capped := v_round_win >= v_stake * 15000;
  IF v_capped THEN
    v_free := 0;
  END IF;
  v_bonus_ended := v_is_free AND v_free = 0;
  v_spin := v_spin + 1;
  v_bal := coalesce(v_bal, public.game_balance(v_cur));

  INSERT INTO public.olympus_sessions
    (user_id, currency, bet, free, bonus_multiplier, round_win, bonus_win, spin_no, updated_at)
  VALUES
    (v_uid, v_cur, v_stake, v_free, v_mult, v_round_win, v_bonus_win, v_spin, now())
  ON CONFLICT (user_id) DO UPDATE SET
    currency = excluded.currency,
    bet = excluded.bet,
    free = excluded.free,
    bonus_multiplier = excluded.bonus_multiplier,
    round_win = excluded.round_win,
    bonus_win = excluded.bonus_win,
    spin_no = excluded.spin_no,
    updated_at = now();

  INSERT INTO public.game_attempts (user_id, game, result)
  VALUES (v_uid, 'olympus', jsonb_build_object(
    'stake', v_stake,
    'currency', v_cur,
    'free', v_is_free,
    'cost', CASE WHEN v_is_free THEN 0 ELSE v_stake END,
    'win', v_win,
    'free_left', v_free,
    'bonus_multiplier', v_mult
  ));

  RETURN jsonb_build_object(
    'steps', v_res->'steps',
    'base', v_res->'base',
    'win', v_win,
    'scatter_win', v_res->'scatter_win',
    'orb_sum', v_res->'orb_sum',
    'multiplier', v_res->'multiplier',
    'next_multiplier', v_res->'next_multiplier',
    'scatter_count', v_res->'scatter_count',
    'awarded', v_awarded,
    'is_free', v_is_free,
    'capped', v_capped,
    'bonus_ended', v_bonus_ended,
    'free', v_free,
    'bonus_multiplier', v_mult,
    'round_win', v_round_win,
    'bonus_win', v_bonus_win,
    'bal', v_bal,
    'currency', v_cur,
    'bet', v_stake,
    'cost', CASE WHEN v_is_free THEN 0 ELSE v_stake END,
    'jackpot', v_jackpot
  );
END $$;

-- покупка 15 фриспинов за 100× ставки; само вращение — отдельным вызовом
CREATE OR REPLACE FUNCTION public.olympus_buy(p_stake numeric, p_currency text DEFAULT 'sv')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cur text := coalesce(p_currency, 'sv');
  v_cost numeric;
  v_bal numeric;
  v_s public.olympus_sessions;
  v_casino jsonb;
  v_jackpot numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужно войти через Twitch';
  END IF;
  PERFORM public.assert_not_blocked();
  IF v_cur NOT IN ('sv', 'ar') THEN
    RAISE EXCEPTION 'Валюта: sv или ar';
  END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'Некорректная ставка';
  END IF;

  SELECT * INTO v_s FROM public.olympus_sessions WHERE user_id = v_uid FOR UPDATE;
  IF coalesce(v_s.free, 0) > 0 THEN
    RAISE EXCEPTION 'Бонус уже идёт';
  END IF;

  v_cost := p_stake * 100;
  v_bal := public.game_debit(v_cost, v_cur);
  IF v_cur = 'sv' THEN
    v_casino := public.casino_take(v_cost);
    v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
    v_jackpot := coalesce((v_casino->>'jackpot')::numeric, 0);
  END IF;

  INSERT INTO public.olympus_sessions
    (user_id, currency, bet, free, bonus_multiplier, round_win, bonus_win, spin_no, updated_at)
  VALUES (v_uid, v_cur, p_stake, 15, 0, 0, 0, 0, now())
  ON CONFLICT (user_id) DO UPDATE SET
    currency = excluded.currency,
    bet = excluded.bet,
    free = 15,
    bonus_multiplier = 0,
    round_win = 0,
    bonus_win = 0,
    spin_no = 0,
    updated_at = now();

  INSERT INTO public.game_attempts (user_id, game, result)
  VALUES (v_uid, 'olympus', jsonb_build_object(
    'buy', true,
    'stake', p_stake,
    'currency', v_cur,
    'cost', v_cost,
    'win', 0,
    'free_left', 15
  ));

  RETURN jsonb_build_object(
    'free', 15,
    'bal', v_bal,
    'currency', v_cur,
    'bet', p_stake,
    'cost', v_cost,
    'jackpot', v_jackpot
  );
END $$;

REVOKE ALL ON FUNCTION public.olympus_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.olympus_play(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.olympus_buy(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olympus_state() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.olympus_play(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.olympus_buy(numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
