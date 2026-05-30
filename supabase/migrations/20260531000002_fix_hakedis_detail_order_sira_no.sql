-- Migration: 20260531000002_fix_hakedis_detail_order_sira_no.sql
-- Sprint: hotfix (2026-05-31)
-- Description: fn_get_hakedis_detail içinde ikinci phantom kolon düzeltilir.
--   hakedis_kalemleri'nde `sira_no` kolonu YOK (gerçek kolonlar: id, hakedis_id,
--   is_kalemi_id, onceki/bu_ay/toplam_miktar, birim_fiyat, *_tutar, created_at —
--   bkz 20260407130400). RPC `ORDER BY hk.sira_no NULLS LAST, hk.created_at ...`
--   diyordu → 42703 "column hk.sira_no does not exist" → 500.
--   20260531000001 ilk phantom kolonu (is_kalemi_id) düzeltti; bu migration
--   sıralamayı yalnız `hk.created_at`'e indirir (geçerli kolon).
--   Fonksiyon gövdesi 20260531000001 ile aynı; tek fark ORDER BY satırı.

CREATE OR REPLACE FUNCTION public.fn_get_hakedis_detail(
  p_id uuid,
  p_proje_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- IDOR pre-check: hakediş caller'in projesinde olmalı.
  IF NOT EXISTS (
    SELECT 1 FROM public.hakedisler WHERE id = p_id AND proje_id = p_proje_id
  ) THEN
    RAISE EXCEPTION 'Hakedis bulunamadi' USING ERRCODE = 'P0002';
  END IF;

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
                WHERE sik.id = hk.is_kalemi_id
              )
            )
          ORDER BY hk.created_at NULLS LAST
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
  WHERE h.id = p_id AND h.proje_id = p_proje_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Hakedis bulunamadi' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_hakedis_detail(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_hakedis_detail(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_hakedis_detail(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_get_hakedis_detail(uuid, uuid) IS
  'IDOR fix 2026-05-26 + kolon düzeltmeleri 2026-05-31: hk.is_kalemi_id + ORDER BY hk.created_at (önceki phantom kolonlar sozlesme_is_kalemi_id/sira_no 42703 500 veriyordu).';
