-- Helper function for plugin to preload discovered items
CREATE OR REPLACE FUNCTION public.get_server_discovered_items()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) FROM public.server_discovered_items;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_server_discovered_items() TO authenticated, anon, service_role;
NOTIFY pgrst, 'reload schema';
