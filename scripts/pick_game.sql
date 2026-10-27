-- ====================================================================
-- 22. «КИРКА» — башня из блоков с падающей киркой.
--     8 рядов по 3 блока, в каждом ряду скрыт 1 динамит. Игрок тыкает
--     блок в текущем ряду: алмаз — ряд пройден и множитель растёт,
--     динамит — взрыв и ставка сгорает. Забрать можно после любого ряда.
--     Расклад скрыт в pick_secrets (RLS без политик), деньги — только
--     через RPC. Валюты SV₽/АР, казино-пот подключён как в лужах.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.pick_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stake numeric NOT NULL,
  row integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'sv',
  status text NOT NULL DEFAULT 'play',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pick_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pick_select_own ON public.pick_rounds;
CREATE POLICY pick_select_own ON public.pick_rounds FOR SELECT USING (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS pick_one_active ON public.pick_rounds (user_id) WHERE status = 'play';

CREATE TABLE IF NOT EXISTS public.pick_secrets (
  round_id uuid PRIMARY KEY REFERENCES public.pick_rounds(id) ON DELETE CASCADE,
  bombs integer[] NOT NULL
);
ALTER TABLE public.pick_secrets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pick_multiplier(p_row integer)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_row <= 0 THEN RETURN 1; END IF;
  RETURN floor(power(1.5, p_row) * 0.97 * 100) / 100;
END $$;

CREATE OR REPLACE FUNCTION public.pick_start(p_stake numeric, p_currency text DEFAULT 'sv')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cur text := coalesce(p_currency, 'sv');
  v_bal numeric;
  v_id uuid;
  v_bombs integer[] := ARRAY[]::integer[];
  v_k integer;
  v_casino jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  PERFORM public.assert_not_blocked();
  IF v_cur NOT IN ('sv', 'ar') THEN RAISE EXCEPTION 'Валюта: sv или ar'; END IF;
  IF EXISTS (SELECT 1 FROM public.pick_rounds WHERE user_id = auth.uid() AND status = 'play') THEN
    RAISE EXCEPTION 'Сначала заверши текущий раунд';
  END IF;

  v_bal := public.game_debit(p_stake, v_cur);

  FOR v_k IN 1..8 LOOP
    v_bombs := v_bombs || floor(random() * 3)::int;
  END LOOP;

  INSERT INTO public.pick_rounds (user_id, stake, currency)
    VALUES (auth.uid(), p_stake, v_cur) RETURNING id INTO v_id;
  INSERT INTO public.pick_secrets (round_id, bombs) VALUES (v_id, v_bombs);

  IF v_cur = 'sv' THEN
    v_casino := public.casino_take(p_stake);
    v_bal := coalesce((v_casino->>'bal')::numeric, v_bal);
  END IF;

  RETURN jsonb_build_object(
    'round_id', v_id, 'bal', v_bal, 'currency', v_cur,
    'jackpot', coalesce(v_casino->>'jackpot', '0'));
END $$;

CREATE OR REPLACE FUNCTION public.pick_pick(p_round uuid, p_col integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.pick_rounds%rowtype;
  v_bombs integer[];
  v_row integer;
  v_mul numeric;
  v_win numeric;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_round FROM public.pick_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раунд уже завершён'; END IF;
  IF p_col < 0 OR p_col > 2 THEN RAISE EXCEPTION 'Колонка за пределами ряда'; END IF;
  IF v_round.row >= 8 THEN RAISE EXCEPTION 'Башня пройдена — забирай выигрыш'; END IF;
  SELECT bombs INTO v_bombs FROM public.pick_secrets WHERE round_id = p_round;

  v_row := v_round.row + 1;

  IF v_bombs[v_row] = p_col THEN
    UPDATE public.pick_rounds SET status = 'lost', row = v_row WHERE id = p_round;
    INSERT INTO public.game_attempts (user_id, game, result)
      VALUES (auth.uid(), 'pick', jsonb_build_object(
        'stake', v_round.stake, 'currency', v_round.currency,
        'rows', v_round.row, 'outcome', 'lost', 'col', p_col));
    RETURN jsonb_build_object('hit', true, 'bombs', v_bombs, 'row', v_row, 'col', p_col,
      'currency', v_round.currency);
  END IF;

  UPDATE public.pick_rounds SET row = v_row WHERE id = p_round;
  v_mul := public.pick_multiplier(v_row);

  IF v_row >= 8 THEN
    v_win := CASE WHEN v_round.currency = 'ar'
      THEN floor(v_round.stake * v_mul)
      ELSE round(v_round.stake * v_mul, 2) END;
    UPDATE public.pick_rounds SET status = 'cashed' WHERE id = p_round;
    v_bal := public.game_credit(v_win, v_round.currency);
    INSERT INTO public.game_attempts (user_id, game, result)
      VALUES (auth.uid(), 'pick', jsonb_build_object(
        'stake', v_round.stake, 'currency', v_round.currency,
        'rows', v_row, 'outcome', 'cashed', 'mul', v_mul, 'win', v_win, 'full', true));
    RETURN jsonb_build_object('hit', false, 'row', v_row, 'auto_cashed', true,
      'mul', v_mul, 'win', v_win, 'bal', v_bal, 'bombs', v_bombs,
      'currency', v_round.currency);
  END IF;

  RETURN jsonb_build_object('hit', false, 'row', v_row,
    'mul', v_mul, 'potential', round(v_round.stake * v_mul, 2),
    'currency', v_round.currency);
END $$;

CREATE OR REPLACE FUNCTION public.pick_cash(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.pick_rounds%rowtype;
  v_mul numeric;
  v_win numeric;
  v_bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Нужно войти через Twitch'; END IF;
  SELECT * INTO v_round FROM public.pick_rounds WHERE id = p_round AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Раунд не найден'; END IF;
  IF v_round.status <> 'play' THEN RAISE EXCEPTION 'Раунд уже завершён'; END IF;
  IF v_round.row < 1 THEN RAISE EXCEPTION 'Сначала разбей хотя бы один ряд'; END IF;

  v_mul := public.pick_multiplier(v_round.row);
  v_win := CASE WHEN v_round.currency = 'ar'
    THEN floor(v_round.stake * v_mul)
    ELSE round(v_round.stake * v_mul, 2) END;
  UPDATE public.pick_rounds SET status = 'cashed' WHERE id = p_round;
  v_bal := public.game_credit(v_win, v_round.currency);
  INSERT INTO public.game_attempts (user_id, game, result)
    VALUES (auth.uid(), 'pick', jsonb_build_object(
      'stake', v_round.stake, 'currency', v_round.currency,
      'rows', v_round.row, 'outcome', 'cashed', 'mul', v_mul, 'win', v_win));
  RETURN jsonb_build_object('mul', v_mul, 'win', v_win, 'bal', v_bal,
    'bombs', (SELECT bombs FROM public.pick_secrets WHERE round_id = p_round),
    'row', v_round.row, 'currency', v_round.currency);
END $$;

-- Продолжение незавершённого спуска после перезагрузки страницы
CREATE OR REPLACE FUNCTION public.pick_restore()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round public.pick_rounds%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_round FROM public.pick_rounds
    WHERE user_id = auth.uid() AND status = 'play'
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'round_id', v_round.id, 'stake', v_round.stake,
    'row', v_round.row, 'currency', v_round.currency);
END $$;

REVOKE ALL ON FUNCTION
  public.pick_start(numeric, text),
  public.pick_pick(uuid, integer),
  public.pick_cash(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.pick_start(numeric, text),
  public.pick_pick(uuid, integer),
  public.pick_cash(uuid),
  public.pick_restore()
TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
