-- ====================================================================
-- 24. КИБЕРСПОРТ: Twitch-каналы, подключаемые владельцем.
--     Владелец добавляет каналы — они идут публичным списком,
--     раздел «Киберспорт» показывает плеер выбранного канала.
--     Ставки — обычные события линии (категория «Кибер-Хряк»).
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.esports_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  title text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.esports_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS esports_streams_read ON public.esports_streams;
CREATE POLICY esports_streams_read ON public.esports_streams FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.esports_streams_list()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'channel', channel, 'title', title
  ) ORDER BY created_at), '[]'::jsonb)
  FROM public.esports_streams WHERE active;
$$;

CREATE OR REPLACE FUNCTION public.esports_add_stream(p_channel text, p_title text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_channel text := lower(btrim(p_channel));
  v_id uuid;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может подключать каналы';
  END IF;
  IF v_channel !~ '^[a-z0-9_]{3,25}$' THEN
    RAISE EXCEPTION 'Ник канала: 3-25 символов, латиница/цифры/_';
  END IF;
  IF (SELECT count(*) FROM public.esports_streams WHERE active) >= 6 THEN
    RAISE EXCEPTION 'Максимум 6 каналов — удали лишний';
  END IF;
  IF EXISTS (SELECT 1 FROM public.esports_streams WHERE channel = v_channel AND active) THEN
    RAISE EXCEPTION 'Канал уже подключён';
  END IF;
  INSERT INTO public.esports_streams (channel, title)
    VALUES (v_channel, left(btrim(coalesce(p_title, '')), 80))
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'channel', v_channel);
END $$;

CREATE OR REPLACE FUNCTION public.esports_remove_stream(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Только владелец платформы может отключать каналы';
  END IF;
  DELETE FROM public.esports_streams WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION public.esports_streams_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esports_streams_list() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.esports_add_stream(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esports_add_stream(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.esports_remove_stream(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esports_remove_stream(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
