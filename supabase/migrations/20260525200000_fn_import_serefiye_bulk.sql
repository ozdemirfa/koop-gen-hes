-- Sprint followup-deps-perf-cleanup (2026-05-25)
-- ============================================================================
-- fn_import_serefiye_bulk — CSV import N+1 → tek RPC
-- ----------------------------------------------------------------------------
-- Eski davranis: proje.service.importSerefiye for-loop'unda her satir icin
-- UPDATE statement. 1000 satir = 1000 round-trip. docs/performance.md'de
-- "darbogaz" olarak listelenen iki perf hotspot'undan biri.
--
-- Yeni davranis: jsonb array parametresi ile tek SQL statement. UPDATE ...
-- FROM jsonb_to_recordset(...) WHERE patterniyle Postgres single-pass.
-- 1000 satir icin: 1 round-trip + 1 query plan.
--
-- Return: updated_count, failed_count (eslesmeyen daire_no), total_input.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_import_serefiye_bulk(
  p_proje_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_updated int;
  v_failed int;
BEGIN
  -- Input validation
  IF p_proje_id IS NULL THEN
    RAISE EXCEPTION 'proje_id zorunlu' USING ERRCODE = 'P0001';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows jsonb array olmali' USING ERRCODE = 'P0001';
  END IF;

  v_total := jsonb_array_length(p_rows);

  -- Tek statement UPDATE ... FROM ile bulk apply. jsonb_to_recordset her
  -- satiri tip-li column'lara cevirir. Eslesmeyen daire_no'lar update'lenmez
  -- (failed_count icin total - updated farki ile hesaplanir).
  WITH new_data AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS x(
      daire_no text,
      kat int,
      yon text,
      m2 numeric,
      oda_sayisi text,
      serefiye_orani numeric
    )
  )
  UPDATE public.serefiye_tablosu st
  SET
    kat = nd.kat,
    yon = nd.yon,
    m2 = nd.m2,
    oda_sayisi = nd.oda_sayisi,
    serefiye_orani = COALESCE(nd.serefiye_orani, 1.0)
  FROM new_data nd
  WHERE st.proje_id = p_proje_id
    AND st.daire_no = nd.daire_no;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_failed := GREATEST(v_total - v_updated, 0);

  RETURN jsonb_build_object(
    'updated', v_updated,
    'failed', v_failed,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_import_serefiye_bulk(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_import_serefiye_bulk(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION fn_import_serefiye_bulk(uuid, jsonb) IS
  'Sprint followup-deps-perf-cleanup — Serefiye CSV import tek-RPC. 1000 satir 1 round-trip; eski for-loop perf hotspot.';
