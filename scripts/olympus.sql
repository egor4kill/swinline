-- ====================================================================
-- 25. «ОЛИМП»: 6×5, выплаты за 8+ одинаковых, каскады, шары-множители,
--     фриспины с накопительным множителем и покупка бонуса 100×.
--     Точное зеркало src/olympusLogic.ts: тот же mulberry32 (_bonanza_rnd)
--     и тот же порядок вызовов rnd, поэтому seed даёт один и тот же исход.
-- ====================================================================

-- одна клетка: символ по весам; если шар — ещё и значение множителя
CREATE OR REPLACE FUNCTION public._olympus_cell(INOUT state bigint, p_free boolean, OUT s int, OUT m numeric)
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_roll numeric;
  v_cum numeric := 0;
  v_total numeric := CASE WHEN p_free THEN 100.1 ELSE 95.9 END;
  v_id int[] := ARRAY[1,2,3,4,5,6,7,8,9,10,11];
  v_w numeric[] := ARRAY[4,5,7,8,10,12,14,16,18,1.1, CASE WHEN p_free THEN 5 ELSE 0.8 END];
  v_vals int[] := ARRAY[2,3,4,5,6,8,10,15,20,25,50,100,250,500,1000];
  v_vw numeric[] := ARRAY[40,24,14,10,5,3,2,1,0.5,0.25,0.12,0.05,0.02,0.008,0.002];
  v_i int;
  v_r double precision;
BEGIN
  SELECT c.state, c.rnd INTO state, v_r FROM public._bonanza_rnd(state) c;
  v_roll := v_r * v_total;
  s := 11;
  FOR v_i IN 1..11 LOOP
    v_cum := v_cum + v_w[v_i];
    IF v_roll < v_cum THEN s := v_id[v_i]; EXIT; END IF;
  END LOOP;
  m := 0;
  IF s = 11 THEN
    SELECT c.state, c.rnd INTO state, v_r FROM public._bonanza_rnd(state) c;
    v_roll := v_r * 99.95;
    v_cum := 0;
    m := 2;
    FOR v_i IN 1..15 LOOP
      v_cum := v_cum + v_vw[v_i];
      IF v_roll < v_cum THEN m := v_vals[v_i]; EXIT; END IF;
    END LOOP;
  END IF;
END $fn$;

-- симуляция одного вращения (серии каскадов)
CREATE OR REPLACE FUNCTION public._olympus_resolve(
  INOUT state bigint,
  p_bet numeric,
  p_bonus numeric,
  p_free boolean,
  p_phase text,
  p_spin int,
  OUT result jsonb
)
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_s int[] := array_fill(0, ARRAY[30]);
  v_m numeric[] := array_fill(0::numeric, ARRAY[30]);
  v_ns int[]; v_nm numeric[];
  v_keep_s int[]; v_keep_m numeric[];
  v_fresh_s int[]; v_fresh_m numeric[];
  v_merged_s int[]; v_merged_m numeric[];
  v_marked int[] := ARRAY[]::int[];
  v_wins jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_grid jsonb;
  v_frame jsonb;
  v_cell_s int; v_cell_m numeric;
  v_i int; v_j int; v_c int; v_r int; v_f int; v_k int;
  v_sym int; v_cnt int; v_amt numeric; v_total_win numeric;
  v_base numeric := 0;
  v_orb numeric;
  v_scatter int;
  v_next numeric;
  v_mult numeric;
  v_scatter_win numeric;
  v_awarded int;
  v_raw numeric;
  v_pay numeric[][] := ARRAY[
    ARRAY[10,25,50], ARRAY[2.5,10,25], ARRAY[2,5,15], ARRAY[1.5,2,12],
    ARRAY[1,1.5,10], ARRAY[0.8,1.2,8], ARRAY[0.5,1,5], ARRAY[0.4,0.9,4], ARRAY[0.25,0.75,2]
  ];
  v_scale constant numeric := 1.05;
BEGIN
  -- новое поле 6×5
  FOR v_c IN 0..5 LOOP
    FOR v_r IN 0..4 LOOP
      v_i := v_r * 6 + v_c + 1;
      SELECT c.state, c.s, c.m INTO state, v_cell_s, v_cell_m
        FROM public._olympus_cell(state, p_free) c;
      v_s[v_i] := v_cell_s;
      v_m[v_i] := v_cell_m;
    END LOOP;
  END LOOP;

  FOR v_k IN 1..200 LOOP
    -- поиск выплат за 8+ (все экземпляры символа на поле)
    v_wins := '[]'::jsonb;
    v_total_win := 0;
    v_marked := ARRAY[]::int[];
    FOR v_sym IN 1..9 LOOP
      v_cnt := 0;
      FOR v_i IN 1..30 LOOP
        IF v_s[v_i] = v_sym THEN v_cnt := v_cnt + 1; END IF;
      END LOOP;
      IF v_cnt >= 8 THEN
        v_amt := round(p_bet * v_pay[v_sym][CASE WHEN v_cnt >= 12 THEN 3 WHEN v_cnt >= 10 THEN 2 ELSE 1 END] * v_scale, 2);
        v_wins := v_wins || jsonb_build_object(
          's', v_sym, 'count', v_cnt, 'amount', v_amt,
          'indices', (SELECT jsonb_agg(g.x - 1) FROM generate_series(1, 30) g(x) WHERE v_s[g.x] = v_sym)
        );
        v_total_win := v_total_win + v_amt;
        FOR v_i IN 1..30 LOOP
          IF v_s[v_i] = v_sym THEN v_marked := v_marked || v_i; END IF;
        END LOOP;
      END IF;
    END LOOP;

    v_grid := (SELECT jsonb_agg(jsonb_build_object('s', v_s[g], 'm', v_m[g]) ORDER BY g)
               FROM generate_series(1, 30) g);
    v_orb := 0;
    v_scatter := 0;
    FOR v_i IN 1..30 LOOP
      v_orb := v_orb + v_m[v_i];
      IF v_s[v_i] = 10 THEN v_scatter := v_scatter + 1; END IF;
    END LOOP;
    v_frame := jsonb_build_object(
      'grid', v_grid, 'wins', v_wins, 'phase', p_phase, 'spin', p_spin,
      'mult', 1, 'orbSum', v_orb, 'scatterCount', v_scatter
    );
    v_steps := v_steps || v_frame;
    EXIT WHEN v_total_win = 0;

    v_base := v_base + v_total_win;

    -- каскад: убрать выигравшие символы, уронить, досыпать
    v_ns := array_fill(0, ARRAY[30]);
    v_nm := array_fill(0::numeric, ARRAY[30]);
    FOR v_c IN 0..5 LOOP
      v_keep_s := ARRAY[]::int[];
      v_keep_m := ARRAY[]::numeric[];
      FOR v_r IN 0..4 LOOP
        v_i := v_r * 6 + v_c + 1;
        IF NOT (v_i = ANY (v_marked)) THEN
          v_keep_s := v_keep_s || v_s[v_i];
          v_keep_m := v_keep_m || v_m[v_i];
        END IF;
      END LOOP;
      v_fresh_s := ARRAY[]::int[];
      v_fresh_m := ARRAY[]::numeric[];
      FOR v_f IN 1..(5 - coalesce(array_length(v_keep_s, 1), 0)) LOOP
        SELECT c.state, c.s, c.m INTO state, v_cell_s, v_cell_m
          FROM public._olympus_cell(state, p_free) c;
        v_fresh_s := v_fresh_s || v_cell_s;
        v_fresh_m := v_fresh_m || v_cell_m;
      END LOOP;
      v_merged_s := v_fresh_s || v_keep_s;
      v_merged_m := v_fresh_m || v_keep_m;
      FOR v_r IN 0..4 LOOP
        v_i := v_r * 6 + v_c + 1;
        v_ns[v_i] := v_merged_s[v_r + 1];
        v_nm[v_i] := v_merged_m[v_r + 1];
      END LOOP;
    END LOOP;
    v_s := v_ns;
    v_m := v_nm;
  END LOOP;

  -- итоги серии: шары и скаттеры считаются на финальном поле
  v_orb := 0;
  v_scatter := 0;
  FOR v_i IN 1..30 LOOP
    v_orb := v_orb + v_m[v_i];
    IF v_s[v_i] = 10 THEN v_scatter := v_scatter + 1; END IF;
  END LOOP;

  v_next := p_bonus;
  IF p_free AND v_base > 0 AND v_orb > 0 THEN v_next := v_next + v_orb; END IF;
  v_mult := CASE WHEN v_base > 0 AND v_orb > 0 THEN (CASE WHEN p_free THEN v_next ELSE v_orb END) ELSE 1 END;
  v_scatter_win := CASE
    WHEN NOT p_free AND v_scatter >= 4 THEN round(p_bet * (CASE WHEN v_scatter >= 6 THEN 100 WHEN v_scatter = 5 THEN 5 ELSE 3 END), 2)
    ELSE 0 END;
  v_awarded := CASE WHEN p_free THEN (CASE WHEN v_scatter >= 3 THEN 5 ELSE 0 END)
                    ELSE (CASE WHEN v_scatter >= 4 THEN 15 ELSE 0 END) END;
  v_raw := round(v_base * v_mult + v_scatter_win, 2);

  -- проставляем финальный множитель во все кадры
  v_steps := (SELECT jsonb_agg(jsonb_set(elem, '{mult}', to_jsonb(v_mult)) ORDER BY ord)
              FROM jsonb_array_elements(v_steps) WITH ORDINALITY t(elem, ord));

  result := jsonb_build_object(
    'steps', v_steps, 'base', round(v_base, 2), 'scatter_win', v_scatter_win,
    'orb_sum', v_orb, 'multiplier', v_mult, 'next_multiplier', v_next,
    'scatter_count', v_scatter, 'awarded', v_awarded, 'raw_win', v_raw);
END $fn$;

-- целый оплаченный раунд: база + возможные фриспины (или сразу бонус)
CREATE OR REPLACE FUNCTION public._olympus_run(p_seed bigint, p_buy boolean)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_state bigint := p_seed % 4294967296;
  v_res jsonb;
  v_base_steps jsonb := '[]'::jsonb;
  v_base_win numeric := 0;
  v_triggered boolean := false;
  v_free_steps jsonb := '[]'::jsonb;
  v_free_total numeric := 0;
  v_spins int := 15;
  v_cnt int := 0;
  v_persist numeric := 0;
  v_awarded int;
  v_add numeric;
  v_remaining numeric;
  v_capped boolean := false;
BEGIN
  IF NOT p_buy THEN
    SELECT r.state, r.result INTO v_state, v_res
      FROM public._olympus_resolve(v_state, 1, 0, false, 'base', 0) r;
    v_base_steps := v_res->'steps';
    v_base_win := (v_res->>'raw_win')::numeric;
    v_triggered := (v_res->>'awarded')::int >= 15;
  ELSE
    v_triggered := true;
  END IF;

  IF v_triggered THEN
    WHILE v_cnt < v_spins AND v_cnt < 200 LOOP
      v_cnt := v_cnt + 1;
      SELECT r.state, r.result INTO v_state, v_res
        FROM public._olympus_resolve(v_state, 1, v_persist, true, 'free', v_cnt) r;
      v_persist := (v_res->>'next_multiplier')::numeric;
      v_add := (v_res->>'raw_win')::numeric;
      v_add := least(v_add, greatest(0, 15000 - v_base_win - v_free_total));
      v_free_total := v_free_total + v_add;
      v_free_steps := v_free_steps || (v_res->'steps');
      v_awarded := (v_res->>'awarded')::int;
      IF v_awarded > 0 THEN v_spins := v_spins + v_awarded; END IF;
      IF v_base_win + v_free_total >= 15000 THEN
        v_capped := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'seed', v_state,
    'buy', p_buy,
    'base', jsonb_build_object('steps', v_base_steps, 'win', round(v_base_win, 2)),
    'free', jsonb_build_object('triggered', v_triggered, 'count', v_cnt,
      'steps', v_free_steps, 'total', round(v_free_total, 2)),
    'total', round(least(15000, v_base_win + v_free_total), 2),
    'capped', v_capped);
END $fn$;

-- ставка: списание, расчёт, начисление — атомарно
CREATE OR REPLACE FUNCTION public.olympus_spin(p_stake numeric, p_currency text DEFAULT 'sv', p_buy boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cur text := coalesce(p_currency, 'sv');
  v_cost numeric;
  v_seed bigint;
  v_run jsonb;
  v_total numeric;
  v_win numeric;
  v_bal numeric;
  v_casino jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF v_cur NOT IN ('sv', 'ar') THEN RAISE EXCEPTION 'Валюта: sv или ar'; END IF;

  v_cost := CASE WHEN p_buy THEN p_stake * 100 ELSE p_stake END;
  v_bal := public.game_debit(v_cost, v_cur);
  IF v_cur = 'sv' THEN
    v_casino := public.casino_take(v_cost);
    v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
  END IF;

  v_seed := floor(random() * 4294967296)::bigint;
  v_run := public._olympus_run(v_seed, p_buy);
  v_total := (v_run->>'total')::numeric;
  IF v_cur = 'ar' THEN
    v_win := floor(v_total * p_stake);
  ELSE
    v_win := round(v_total * p_stake, 2);
  END IF;
  IF v_win > 0 THEN
    v_bal := public.game_credit(v_win, v_cur);
  END IF;

  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'olympus', jsonb_build_object(
      'stake', p_stake, 'currency', v_cur, 'buy', p_buy,
      'cost', v_cost, 'win', v_win, 'total_x', v_total,
      'free', v_run->'free'->>'triggered', 'spins', v_run->'free'->>'count'));

  RETURN jsonb_build_object(
    'run', v_run, 'win', v_win, 'bal', v_bal, 'currency', v_cur,
    'cost', v_cost, 'buy', p_buy,
    'jackpot', coalesce(v_casino->>'jackpot', '0'));
END $$;

REVOKE ALL ON FUNCTION public._olympus_cell(bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._olympus_resolve(bigint, numeric, numeric, boolean, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._olympus_run(bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.olympus_spin(numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olympus_spin(numeric, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
