-- Sprint followup-pipeline-cleanup-perf B4 (2026-05-25)
-- ============================================================================
-- fn_get_hakedis_detail — hakediş detay sayfası tek-round-trip RPC
-- ----------------------------------------------------------------------------
-- Eski davranis: hakedis.service.getById PostgREST select string'i 4+ seviye
-- nested resource embedding kullaniyor:
--   *, sozlesmeler(..., firmalar(unvan)),
--      hakedis_kalemleri(*, sozlesme_is_kalemleri(...)),
--      irsaliyeler!irsaliyeler_hakedis_id_fkey(..., irsaliye_kalemleri(...))
--
-- PostgREST nested resource embedding tek query'de yapilir ama:
-- - JSON kompozisyonu PostgREST tarafinda sirali; Postgres planner ile dogrudan
--   jsonb_agg ile daha iyi optimize edilebilir.
-- - Eklenen index'ler (Sprint qa-review-bugfix-faz3 Batch 4 FK index audit)
--   sayesinde JOIN'ler index-friendly.
-- - PL/pgSQL'de tek noktadan icerik kontrolu — maintenance kolaylasir.
--
-- Bu RPC: 1 INSERT'lik effort, ~aynı performans (mevcut postgres planner
-- nested select'i de iyi handle ediyor); asil kazanc: backend service kodunun
-- 1 satira inmesi + JSON shape'in DB tarafinda contract olarak yasamasi.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_get_hakedis_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT
    to_jsonb(h.*)
    || jsonb_build_object(
      'sozlesmeler', (
        SELECT to_jsonb(s.*)
          || jsonb_build_object(
            'firmalar',
            (SELECT to_jsonb(f.*) FROM firmalar f WHERE f.id = s.firma_id)
          )
        FROM sozlesmeler s
        WHERE s.id = h.sozlesme_id
      ),
      'hakedis_kalemleri', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(hk.*)
            || jsonb_build_object(
              'sozlesme_is_kalemleri',
              (
                SELECT to_jsonb(sik.*)
                FROM sozlesme_is_kalemleri sik
                WHERE sik.id = hk.sozlesme_is_kalemi_id
              )
            )
          ORDER BY hk.sira_no NULLS LAST, hk.created_at NULLS LAST
        )
        FROM hakedis_kalemleri hk
        WHERE hk.hakedis_id = h.id
      ), '[]'::jsonb),
      'irsaliyeler', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(i.*)
            || jsonb_build_object(
              'irsaliye_kalemleri',
              COALESCE((
                SELECT jsonb_agg(to_jsonb(ik.*) ORDER BY ik.created_at NULLS LAST)
                FROM irsaliye_kalemleri ik
                WHERE ik.irsaliye_id = i.id
              ), '[]'::jsonb)
            )
          ORDER BY i.teslim_tarihi DESC NULLS LAST
        )
        FROM irsaliyeler i
        WHERE i.hakedis_id = h.id
      ), '[]'::jsonb)
    )
    INTO v_result
  FROM hakedisler h
  WHERE h.id = p_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Hakedis bulunamadi' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_get_hakedis_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_hakedis_detail(uuid) TO authenticated;

COMMENT ON FUNCTION fn_get_hakedis_detail(uuid) IS
  'Sprint followup-pipeline-cleanup-perf — hakedis detay tek-round-trip RPC. Service hakedis.getById bunu cagirir; nested PostgREST select pattern yerine.';
