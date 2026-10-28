-- ====================================================================
-- 30. Убрать бесплатное пополнение баланса. Баланс можно только
--     терять/выигрывать в играх или получать от админа (admin_top_up).
--     self_add_free больше недоступен никому, включая владельца.
-- ====================================================================

-- Сама функция остаётся определением на случай старых клиентов,
-- но всегда завершается ошибкой: начисления больше не будет.
CREATE OR REPLACE FUNCTION public.self_add_free(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Пополнение баланса отключено';
END $$;

REVOKE ALL ON FUNCTION public.self_add_free(numeric) FROM PUBLIC, anon, authenticated;

-- Сброс к 10 000 оставляем: он забирает деньги, а не добавляет.
-- Но раньше он был открыт даже анонимам — закрываем входом.
REVOKE ALL ON FUNCTION public.self_reset_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_reset_balance() TO authenticated;

-- Баланс игрок сам менять не может ни кнопкой, ни прямым запросом:
-- bal и total_wagered становятся read-only для клиента.
-- ВАЖНО: внутри SECURITY DEFINER функции current_user всегда = postgres
-- (владелец функции), поэтому проверяем session_user: у REST-клиентов
-- это authenticator, у SQL-редактора/Management API — postgres.
CREATE OR REPLACE FUNCTION public.guard_profile_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user = 'postgres' THEN
    RETURN NEW;
  END IF;
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     OR NEW.bal IS DISTINCT FROM OLD.bal
     OR NEW.total_wagered IS DISTINCT FROM OLD.total_wagered THEN
    RAISE EXCEPTION 'privileged profile columns are read-only';
  END IF;
  RETURN NEW;
END;
$$;

-- Полный сброс балансов всех игроков к стартовым 10 000 SV₽.
-- АР не трогаем (алмазная руда привязана к заносу из Minecraft).
WITH reset AS (
  UPDATE public.profiles
    SET bal = 10000, updated_at = now()
    WHERE bal IS DISTINCT FROM 10000
  RETURNING id
)
INSERT INTO public.game_attempts (user_id, game, result)
SELECT id, 'admin', jsonb_build_object('reset', true, 'bal', 10000, 'at', now())
FROM reset;

DELETE FROM public.free_money;

NOTIFY pgrst, 'reload schema';
