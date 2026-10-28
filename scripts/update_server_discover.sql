-- Update server_discover_item to auto-register missing items into catalog
CREATE OR REPLACE FUNCTION public.server_discover_item(p_id text, p_player text DEFAULT 'world')
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clean text := lower(trim(p_id));
BEGIN
  IF v_clean IS NULL OR length(v_clean) = 0 THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.upgrader_catalog WHERE id = v_clean) THEN
    INSERT INTO public.upgrader_catalog (id, name, value, max_count, rarity)
    VALUES (v_clean, initcap(replace(v_clean, '_', ' ')), 1, 64, 'common')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.server_discovered_items (id, discovered_by, discovered_at)
  VALUES (v_clean, coalesce(p_player, 'world'), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.server_discover_item(text, text) TO authenticated, anon, service_role;
NOTIFY pgrst, 'reload schema';
