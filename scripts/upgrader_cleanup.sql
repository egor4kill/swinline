-- ====================================================================
-- 29. Чистка Upgrader после удаления яиц призыва и creative-only
--     предметов из upgrader_catalog. Применять после upgrader_catalog.sql.
-- ====================================================================

UPDATE public.upgrader_profiles p
SET inventory = coalesce((
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM (
        SELECT t.elem, t.ord
        FROM jsonb_array_elements(p.inventory) WITH ORDINALITY t(elem, ord)
        WHERE EXISTS (
          SELECT 1 FROM public.upgrader_catalog c
          WHERE c.id = t.elem->>'id'
        )
      ) kept
    ), '[]'::jsonb),
    history = coalesce((
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM (
        SELECT t.elem, t.ord
        FROM jsonb_array_elements(p.history) WITH ORDINALITY t(elem, ord)
        WHERE EXISTS (
          SELECT 1 FROM public.upgrader_catalog c
          WHERE c.id = t.elem->>'stake'
        )
        AND EXISTS (
          SELECT 1 FROM public.upgrader_catalog c
          WHERE c.id = t.elem->>'target'
        )
      ) kept
    ), '[]'::jsonb),
    updated_at = now();

DELETE FROM public.upgrader_attempts a
WHERE NOT EXISTS (
        SELECT 1 FROM public.upgrader_catalog c
        WHERE c.id = a.result->>'stake'
      )
   OR NOT EXISTS (
        SELECT 1 FROM public.upgrader_catalog c
        WHERE c.id = a.result->>'target'
      );

DELETE FROM public.game_attempts a
WHERE a.game = 'upgrader'
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.upgrader_catalog c
      WHERE c.id = a.result->>'stake'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.upgrader_catalog c
      WHERE c.id = a.result->>'target'
    )
  );

NOTIFY pgrst, 'reload schema';
