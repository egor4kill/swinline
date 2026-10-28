-- ====================================================================
-- Фикс: триггер guard_profile_columns блокировал ЛЕГАЛЬНЫЕ начисления.
-- claim_daily / game_credit / admin_* и т.д. обновляют profiles.bal
-- из SECURITY DEFINER RPC — а session_user у них тот же, что и у
-- прямого запроса клиента, поэтому триггер не может их различить и
-- блокировал всё, включая ежедневную награду и выплаты в играх.
--
-- Правильная защита: прямой UPDATE profiles клиенту не нужен
-- (клиент только SELECT и INSERT при первом входе) — закрываем его
-- политикой и правами, а триггер-страж снимаем целиком:
-- SECURITY DEFINER RPC идут от имени postgres (владельца таблицы)
-- и продолжают работать.
-- ====================================================================

DROP TRIGGER IF EXISTS guard_profile_columns ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- Триггер на INSERT оставляем: при первом входе клиентский upsert
-- получает ровно 10 000 SV₽ и роль user, какие поля ни передай.
-- (guard_profile_insert не трогаем — он работает корректно.)

-- Ежедневная награда: сброс серии к нулевому дню у всех игроков
DELETE FROM public.daily_claims;

-- Все ставки убраны из базы
DELETE FROM public.bets;

NOTIFY pgrst, 'reload schema';
