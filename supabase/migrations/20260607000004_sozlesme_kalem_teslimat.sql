-- Migration: 20260607000004_sozlesme_kalem_teslimat.sql
-- Sprint: kurumsal-cari-revizyonlar (2026-06-07) — Rev 4
-- Description: Sözleşme iş kalemi bazında teslim edilen toplam miktar (onaylı/ödenmiş
--   hakedişlerden). Sözleşme detayında "Teslim Edilen" + "Kalan" sütunları için.
--   kalan = sozlesme_is_kalemleri.miktar - teslim_edilen → iş kalemi bazında basit
--   stok/miktar takibi. Yeni tablo yok; mevcut hakedis_kalemleri.bu_ay_miktar kullanılır.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_sozlesme_kalem_teslimat(
  p_sozlesme_id UUID,
  p_proje_id    UUID
)
RETURNS TABLE (is_kalemi_id UUID, teslim_edilen NUMERIC)
AS $$
  SELECT hk.is_kalemi_id, COALESCE(SUM(hk.bu_ay_miktar), 0) AS teslim_edilen
  FROM public.hakedis_kalemleri hk
  JOIN public.hakedisler h ON h.id = hk.hakedis_id
  WHERE h.sozlesme_id = p_sozlesme_id
    AND h.proje_id = p_proje_id
    AND h.durum IN ('onaylandi', 'odendi')
  GROUP BY hk.is_kalemi_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_sozlesme_kalem_teslimat(UUID, UUID) IS
  'Sözleşme iş kalemi bazında onaylı/ödenmiş hakedişlerden teslim edilen toplam '
  'miktar (SUM bu_ay_miktar). Kalan = sözleşme miktarı - teslim_edilen (serviste hesaplanır).';

COMMIT;
