-- ====================================================================
-- 23. «БОНАНЗА»: 6 барабанов Megaways (2–7 рядов), каскады, GOLD-бонус.
--     Точное зеркало src/bonanzaLogic.ts: тот же mulberry32 (seed → state)
--     и тот же порядок вызовов rnd — при одном seed исходы совпадают.
--     Символы 1..10 (4 самоцвета + 6 рангов), буквы G,O,L,D = 11..14
--     на барабанах 2..5. Сетка 6×7 (index = reel*7+row, row 0 — верх),
--     заполнены нижние heights[reel] клеток.
--     Выплата: pay(symbol, k) × PAY_SCALE × unit × ways, unit = ставка/20.
--     Бонус: 4 разные буквы → 10 фриспинов (+5 за ретриггер, кап 50),
--     множитель +1 за каждый каскад, без сброса, лимит 2000× ставки.
-- ====================================================================

-- эмуляция Math.imul: младшие 32 бита произведения (аргументы — unsigned 32)
CREATE OR REPLACE FUNCTION public._bonanza_imul(a bigint, b bigint)
RETURNS bigint
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_ah bigint := a >> 16;
  v_al bigint := a & 65535;
  v_bh bigint := b >> 16;
  v_bl bigint := b & 65535;
BEGIN
  RETURN (((v_ah * v_bl + v_al * v_bh) % 65536) * 65536 + v_al * v_bl) % 4294967296;
END $fn$;

-- mulberry32: один шаг ГПСЧ. state = x после инкремента, возвращает rnd [0..1).
CREATE OR REPLACE FUNCTION public._bonanza_rnd(INOUT state bigint, OUT rnd double precision)
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_t bigint;
  v_m bigint;
  v_t2 bigint;
BEGIN
  state := (state + 1831565813) % 4294967296; -- 0x6D2B79F5
  v_t := state # (state >> 15);
  v_m := public._bonanza_imul(v_t, 1 | state);
  v_t2 := ((v_m + public._bonanza_imul(v_m # (v_m >> 7), 61 | v_m)) % 4294967296) # v_m;
  rnd := ((v_t2 # (v_t2 >> 14))::double precision) / 4294967296.0;
END $fn$;

-- чистая симуляция: тот же алгоритм, что simulateBonanza(seed) в TS
CREATE OR REPLACE FUNCTION public._bonanza_run(p_seed bigint)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_x bigint := p_seed % 4294967296;
  v_rnd double precision;
  v_heights int[] := ARRAY[0,0,0,0,0,0];
  v_megaways bigint := 1;
  v_hw int[] := ARRAY[2,3,4,4,3,2]; -- высоты 2..7
  v_w_sym int[] := ARRAY[1,2,3,4,5,6,7,8,9,10];
  v_w_val int[] := ARRAY[2,3,4,5,12,11,10,9,8,7];
  v_w_total int := 71;
  v_pay numeric[][] := ARRAY[
    ARRAY[2,5,25,50], ARRAY[1.5,2,10,25], ARRAY[1,1.5,5,15], ARRAY[0.5,1,2,10],
    ARRAY[0.2,0.4,1,1.5], ARRAY[0.2,0.4,1,1.5], ARRAY[0.25,0.5,1.2,2],
    ARRAY[0.3,0.6,1.4,2.5], ARRAY[0.35,0.7,1.6,3], ARRAY[0.4,0.8,1.8,3.5]
  ];
  v_pay_scale constant numeric := 0.97;
  v_letter_chance constant double precision := 0.03;
  v_free_spins constant int := 10;
  v_free_retrigger constant int := 5;
  v_free_cap constant int := 50;
  v_bonus_cap constant numeric := 40000; -- юнитов = 2000× ставки

  v_grid bigint[] := ARRAY(SELECT 0::bigint FROM generate_series(1, 42));
  v_col bigint[];
  v_steps jsonb := '[]'::jsonb;
  v_free_steps jsonb := '[]'::jsonb;

  v_r int; v_row int; v_i int; v_e int; v_p int;
  v_s int; v_k int; v_cnt int; v_run int; v_ways bigint; v_start int;
  v_win numeric; v_mult int;
  v_marked bigint[];
  v_wins jsonb;
  v_w_json jsonb;
  v_letter_seen boolean[];
  v_letters int;
  v_base_win numeric := 0;
  v_free_total numeric := 0;
  v_free_triggered boolean := false;
  v_count int := 0;
  v_spins int := 0;
  v_out jsonb;
BEGIN
  -- высоты барабанов
  FOR v_r IN 0..5 LOOP
    SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
    v_i := floor(v_rnd * 18)::int; -- сумма весов высот = 18
    v_row := 0;
    FOR v_e IN 0..5 LOOP
      v_i := v_i - v_hw[v_e + 1];
      EXIT WHEN v_i < 0;
      v_row := v_row + 1;
    END LOOP;
    v_heights[v_r + 1] := 2 + LEAST(v_row, 5);
    v_megaways := v_megaways * v_heights[v_r + 1];
  END LOOP;

  -- ===== заполнение всей сетки (тот же порядок rnd, что fillGrid в TS) =====
  FOR v_r IN 0..5 LOOP
    FOR v_row IN (7 - v_heights[v_r + 1])..6 LOOP
      v_i := v_r * 7 + v_row + 1;
      IF v_r BETWEEN 1 AND 4 THEN
        SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
        IF v_rnd < v_letter_chance THEN
          v_grid[v_i] := 10 + v_r; -- буква 11..14
          CONTINUE;
        END IF;
      END IF;
      SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
      v_i := floor(v_rnd * v_w_total)::int;
      v_s := 10;
      FOR v_p IN 1..10 LOOP
        v_i := v_i - v_w_val[v_p];
        IF v_i < 0 THEN v_s := v_w_sym[v_p]; EXIT; END IF;
      END LOOP;
      v_grid[v_r * 7 + v_row + 1] := v_s;
    END LOOP;
  END LOOP;

  -- ===== базовая игра: множитель всегда 1, каскады его не растят =====
  FOR v_iter IN 1..60 LOOP
    v_wins := '[]'::jsonb;
    v_win := 0;
    FOR v_s IN 1..10 LOOP
      v_run := 0; v_ways := 1; v_start := 0;
      FOR v_r IN 0..6 LOOP
        v_cnt := 0;
        IF v_r < 6 THEN
          FOR v_row IN 0..6 LOOP
            IF v_grid[v_r * 7 + v_row + 1] = v_s THEN v_cnt := v_cnt + 1; END IF;
          END LOOP;
        END IF;
        IF v_r < 6 AND v_cnt > 0 THEN
          IF v_run = 0 THEN v_start := v_r; END IF;
          v_run := v_run + 1;
          v_ways := v_ways * v_cnt;
        ELSE
          IF v_run >= 3 THEN
            v_k := LEAST(v_run, 6);
            v_w_json := jsonb_build_object(
              's', v_s, 'k', v_k, 'ways', v_ways, 'start', v_start,
              'win', v_pay[v_s][v_k - 2] * v_pay_scale * v_ways);
            v_wins := v_wins || v_w_json;
            v_win := v_win + (v_w_json->>'win')::numeric;
          END IF;
          v_run := 0; v_ways := 1;
        END IF;
      END LOOP;
    END LOOP;

    v_out := jsonb_build_object('grid', to_jsonb(v_grid), 'wins', v_wins,
      'win', round(v_win, 2), 'mult', 1);
    v_steps := v_steps || v_out;
    EXIT WHEN v_win = 0;

    v_base_win := v_base_win + v_win;

    -- пометить выигравшие клетки (все экземпляры символа на барабанах сегмента)
    v_marked := ARRAY[]::bigint[];
    FOR v_s IN 1..10 LOOP
      v_run := 0; v_start := 0;
      FOR v_r IN 0..6 LOOP
        v_cnt := 0;
        IF v_r < 6 THEN
          FOR v_row IN 0..6 LOOP
            IF v_grid[v_r * 7 + v_row + 1] = v_s THEN v_cnt := v_cnt + 1; END IF;
          END LOOP;
        END IF;
        IF v_r < 6 AND v_cnt > 0 THEN
          IF v_run = 0 THEN v_start := v_r; END IF;
          v_run := v_run + 1;
        ELSE
          IF v_run >= 3 THEN
            FOR v_r IN v_start..(v_start + LEAST(v_run, 6) - 1) LOOP
              FOR v_row IN 0..6 LOOP
                v_i := v_r * 7 + v_row + 1;
                IF v_grid[v_i] = v_s THEN v_marked := v_marked || v_i; END IF;
              END LOOP;
            END LOOP;
          END IF;
          v_run := 0;
        END IF;
      END LOOP;
    END LOOP;

    -- уронить и досыпать
    FOR v_r IN 0..5 LOOP
      v_col := ARRAY[]::bigint[];
      FOR v_row IN 0..6 LOOP
        v_i := v_r * 7 + v_row + 1;
        IF v_grid[v_i] <> 0 AND NOT (v_i = ANY (v_marked)) THEN
          v_col := v_col || v_grid[v_i];
        END IF;
      END LOOP;
      FOR v_e IN 1..(v_heights[v_r + 1] - coalesce(array_length(v_col, 1), 0)) LOOP
        IF v_r BETWEEN 1 AND 4 THEN
          SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
          IF v_rnd < v_letter_chance THEN
            v_col := ARRAY[(10 + v_r)::bigint] || v_col;
            CONTINUE;
          END IF;
        END IF;
        SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
        v_i := floor(v_rnd * v_w_total)::int;
        v_s := 10;
        FOR v_p IN 1..10 LOOP
          v_i := v_i - v_w_val[v_p];
          IF v_i < 0 THEN v_s := v_w_sym[v_p]; EXIT; END IF;
        END LOOP;
        v_col := ARRAY[v_s::bigint] || v_col;
      END LOOP;
      FOR v_row IN 0..6 LOOP
        v_i := v_r * 7 + v_row + 1;
        IF v_row < 7 - v_heights[v_r + 1] THEN
          v_grid[v_i] := 0;
        ELSE
          v_grid[v_i] := v_col[v_row - (7 - v_heights[v_r + 1]) + 1];
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- буквы финальной сетки базовой игры
  v_letter_seen := ARRAY[false,false,false,false];
  FOR v_i IN 1..42 LOOP
    IF v_grid[v_i] BETWEEN 11 AND 14 THEN
      v_letter_seen[v_grid[v_i] - 10] := true;
    END IF;
  END LOOP;
  v_letters := (SELECT count(*) FROM unnest(v_letter_seen) AS b(value) WHERE b.value);

  -- ===== GOLD-бонус =====
  IF v_letters >= 4 THEN
    v_free_triggered := true;
    v_spins := v_free_spins;
    v_mult := 1;
    WHILE v_count < v_spins AND v_free_total < v_bonus_cap LOOP
      v_count := v_count + 1;

      -- новый фриспин: полная перезаправка сетки
      FOR v_r IN 0..5 LOOP
        FOR v_row IN (7 - v_heights[v_r + 1])..6 LOOP
          v_i := v_r * 7 + v_row + 1;
          IF v_r BETWEEN 1 AND 4 THEN
            SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
            IF v_rnd < v_letter_chance THEN
              v_grid[v_i] := 10 + v_r;
              CONTINUE;
            END IF;
          END IF;
          SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
          v_i := floor(v_rnd * v_w_total)::int;
          v_s := 10;
          FOR v_p IN 1..10 LOOP
            v_i := v_i - v_w_val[v_p];
            IF v_i < 0 THEN v_s := v_w_sym[v_p]; EXIT; END IF;
          END LOOP;
          v_grid[v_r * 7 + v_row + 1] := v_s;
        END LOOP;
      END LOOP;

      FOR v_iter IN 1..60 LOOP
        v_wins := '[]'::jsonb;
        v_win := 0;
        FOR v_s IN 1..10 LOOP
          v_run := 0; v_ways := 1; v_start := 0;
          FOR v_r IN 0..6 LOOP
            v_cnt := 0;
            IF v_r < 6 THEN
              FOR v_row IN 0..6 LOOP
                IF v_grid[v_r * 7 + v_row + 1] = v_s THEN v_cnt := v_cnt + 1; END IF;
              END LOOP;
            END IF;
            IF v_r < 6 AND v_cnt > 0 THEN
              IF v_run = 0 THEN v_start := v_r; END IF;
              v_run := v_run + 1;
              v_ways := v_ways * v_cnt;
            ELSE
              IF v_run >= 3 THEN
                v_k := LEAST(v_run, 6);
                v_w_json := jsonb_build_object(
                  's', v_s, 'k', v_k, 'ways', v_ways, 'start', v_start,
                  'win', v_pay[v_s][v_k - 2] * v_pay_scale * v_ways * v_mult);
                v_wins := v_wins || v_w_json;
                v_win := v_win + (v_w_json->>'win')::numeric;
              END IF;
              v_run := 0; v_ways := 1;
            END IF;
          END LOOP;
        END LOOP;

        v_out := jsonb_build_object('grid', to_jsonb(v_grid), 'wins', v_wins,
          'win', round(v_win, 2), 'mult', v_mult, 'spin', v_count);
        v_free_steps := v_free_steps || v_out;
        EXIT WHEN v_win = 0;

        v_free_total := v_free_total + v_win;

        v_marked := ARRAY[]::bigint[];
        FOR v_s IN 1..10 LOOP
          v_run := 0; v_start := 0;
          FOR v_r IN 0..6 LOOP
            v_cnt := 0;
            IF v_r < 6 THEN
              FOR v_row IN 0..6 LOOP
                IF v_grid[v_r * 7 + v_row + 1] = v_s THEN v_cnt := v_cnt + 1; END IF;
              END LOOP;
            END IF;
            IF v_r < 6 AND v_cnt > 0 THEN
              IF v_run = 0 THEN v_start := v_r; END IF;
              v_run := v_run + 1;
            ELSE
              IF v_run >= 3 THEN
                FOR v_r IN v_start..(v_start + LEAST(v_run, 6) - 1) LOOP
                  FOR v_row IN 0..6 LOOP
                    v_i := v_r * 7 + v_row + 1;
                    IF v_grid[v_i] = v_s THEN v_marked := v_marked || v_i; END IF;
                  END LOOP;
                END LOOP;
              END IF;
              v_run := 0;
            END IF;
          END LOOP;
        END LOOP;

        FOR v_r IN 0..5 LOOP
          v_col := ARRAY[]::bigint[];
          FOR v_row IN 0..6 LOOP
            v_i := v_r * 7 + v_row + 1;
            IF v_grid[v_i] <> 0 AND NOT (v_i = ANY (v_marked)) THEN
              v_col := v_col || v_grid[v_i];
            END IF;
          END LOOP;
          FOR v_e IN 1..(v_heights[v_r + 1] - coalesce(array_length(v_col, 1), 0)) LOOP
            IF v_r BETWEEN 1 AND 4 THEN
              SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
              IF v_rnd < v_letter_chance THEN
                v_col := ARRAY[(10 + v_r)::bigint] || v_col;
                CONTINUE;
              END IF;
            END IF;
            SELECT b.state, b.rnd INTO v_x, v_rnd FROM public._bonanza_rnd(v_x) AS b;
            v_i := floor(v_rnd * v_w_total)::int;
            v_s := 10;
            FOR v_p IN 1..10 LOOP
              v_i := v_i - v_w_val[v_p];
              IF v_i < 0 THEN v_s := v_w_sym[v_p]; EXIT; END IF;
            END LOOP;
            v_col := ARRAY[v_s::bigint] || v_col;
          END LOOP;
          FOR v_row IN 0..6 LOOP
            v_i := v_r * 7 + v_row + 1;
            IF v_row < 7 - v_heights[v_r + 1] THEN
              v_grid[v_i] := 0;
            ELSE
              v_grid[v_i] := v_col[v_row - (7 - v_heights[v_r + 1]) + 1];
            END IF;
          END LOOP;
        END LOOP;

        v_mult := v_mult + 1;
      END LOOP;

      -- ретриггер по буквам финальной сетки фриспина
      v_letter_seen := ARRAY[false,false,false,false];
      FOR v_i IN 1..42 LOOP
        IF v_grid[v_i] BETWEEN 11 AND 14 THEN
          v_letter_seen[v_grid[v_i] - 10] := true;
        END IF;
      END LOOP;
      IF (SELECT count(*) FROM unnest(v_letter_seen) AS b(value) WHERE b.value) >= 4 THEN
        v_spins := v_spins + v_free_retrigger;
      END IF;
    END LOOP;
    v_free_total := LEAST(v_free_total, v_bonus_cap);
  END IF;

  RETURN jsonb_build_object(
    'seed', v_x,
    'heights', to_jsonb(v_heights),
    'megaways', v_megaways,
    'base', jsonb_build_object('steps', v_steps, 'win', round(v_base_win, 2)),
    'letters', v_letters,
    'free', jsonb_build_object('triggered', v_free_triggered, 'count', v_count,
      'steps', v_free_steps, 'total', round(v_free_total, 2)),
    'total', round(v_base_win + v_free_total, 2));
END $fn$;

-- ставки: всё решает один атомарный вызов
CREATE OR REPLACE FUNCTION public.bonanza_spin(p_stake numeric, p_currency text DEFAULT 'sv')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cur text := coalesce(p_currency, 'sv');
  v_seed bigint;
  v_run jsonb;
  v_total_units numeric;
  v_win numeric;
  v_bal numeric;
  v_casino jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF v_cur NOT IN ('sv', 'ar') THEN RAISE EXCEPTION 'Валюта: sv или ar'; END IF;

  v_bal := public.game_debit(p_stake, v_cur);

  IF v_cur = 'sv' THEN
    v_casino := public.casino_take(p_stake);
    v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
  END IF;

  v_seed := floor(random() * 4294967296)::bigint;
  v_run := public._bonanza_run(v_seed);
  v_total_units := (v_run->>'total')::numeric;
  IF v_cur = 'ar' THEN
    v_win := floor(v_total_units * p_stake / 20.0);
  ELSE
    v_win := round(v_total_units * p_stake / 20.0, 2);
  END IF;

  IF v_win > 0 THEN
    v_bal := public.game_credit(v_win, v_cur);
  END IF;

  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'bonanza', jsonb_build_object(
      'stake', p_stake, 'currency', v_cur, 'megaways', v_run->>'megaways',
      'win', v_win, 'free', v_run->'free'->>'triggered',
      'free_count', v_run->'free'->>'count'));

  RETURN jsonb_build_object(
    'run', v_run, 'win', v_win, 'bal', v_bal, 'currency', v_cur,
    'jackpot', coalesce(v_casino->>'jackpot', '0'));
END $$;

REVOKE ALL ON FUNCTION public._bonanza_rnd(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._bonanza_run(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bonanza_spin(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonanza_spin(numeric, text) TO authenticated;
