-- Sprint qa-review-bugfix-faz3 (2026-05-25, P1 #6 + perf)
-- ============================================================================
-- Firma bakiye batch hesabi
-- ----------------------------------------------------------------------------
-- Eski davranis (firma.service.ts:31-93): firma listesi her firmaya icin
-- Promise.all icinde 3 ayri DB sorgusu (cari_hareketler + hakedisler +
-- birikmis_teminatlar). 50 firma = 150+ sorgu (N+1). Ayrica catch block
-- sessiz {guncel_bakiye:0, toplam_teminat:0} donduruyordu → UI yanlis mali
-- tablo gosterirdi.
--
-- Bu RPC firma_ids array'i + tek proje_id parametresiyle tek sorguda tum
-- bakiyeleri hesaplar. Sonuc TABLE doner; service-layer Map'e cevirip
-- response'a merge eder.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_firma_bakiye_batch(
  p_firma_ids uuid[],
  p_proje_id uuid
)
RETURNS TABLE (
  firma_id uuid,
  toplam_odeme numeric,
  toplam_kdvli numeric,
  birikmis_teminat numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH firma_list AS (
    SELECT unnest(p_firma_ids) AS firma_id
  ),
  odemeler AS (
    SELECT
      ch.firma_id,
      ROUND(COALESCE(SUM(CASE WHEN ch.islem_turu IN ('giden_odeme', 'odeme') THEN ch.alacak END), 0), 2)
        AS toplam_odeme
    FROM (
      SELECT cari_hesaplar.firma_id, cari_hareketler.islem_turu, cari_hareketler.alacak
        FROM cari_hareketler
        JOIN cari_hesaplar ON cari_hesaplar.id = cari_hareketler.cari_hesap_id
       WHERE cari_hesaplar.firma_id = ANY(p_firma_ids)
         AND (p_proje_id IS NULL OR cari_hareketler.proje_id = p_proje_id)
    ) ch
    GROUP BY ch.firma_id
  ),
  hakedisler_t AS (
    SELECT
      s.firma_id,
      ROUND(COALESCE(SUM(
        COALESCE(h.hakedis_toplam, COALESCE(h.ara_toplam, 0) + COALESCE(h.kdv_tutar, 0))
      ), 0), 2) AS toplam_kdvli
    FROM hakedisler h
    JOIN sozlesmeler s ON s.id = h.sozlesme_id
    WHERE s.firma_id = ANY(p_firma_ids)
      AND h.durum IN ('onaylandi', 'odendi')
      AND (p_proje_id IS NULL OR h.proje_id = p_proje_id)
    GROUP BY s.firma_id
  ),
  teminatlar AS (
    SELECT
      bt.firma_id,
      ROUND(COALESCE(SUM(bt.birikmis_teminat), 0), 2) AS birikmis_teminat
    FROM birikmis_teminatlar bt
    WHERE bt.firma_id = ANY(p_firma_ids)
      AND (p_proje_id IS NULL OR bt.proje_id = p_proje_id)
    GROUP BY bt.firma_id
  )
  SELECT
    f.firma_id,
    COALESCE(o.toplam_odeme, 0)::numeric,
    COALESCE(h.toplam_kdvli, 0)::numeric,
    COALESCE(t.birikmis_teminat, 0)::numeric
  FROM firma_list f
  LEFT JOIN odemeler  o ON o.firma_id = f.firma_id
  LEFT JOIN hakedisler_t h ON h.firma_id = f.firma_id
  LEFT JOIN teminatlar t ON t.firma_id = f.firma_id;
$$;

REVOKE ALL ON FUNCTION fn_firma_bakiye_batch(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_firma_bakiye_batch(uuid[], uuid) TO authenticated;
