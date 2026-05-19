-- Migration: 20260521000001_fn_banka_hesaplari_with_bakiye.sql
-- Description: Sprint 20260520-perf / PR2 — N+1 fix
--
-- Sorun: `bankaHesap.service.ts:listHesaplar` her hesap için ayrı
-- `banka_hareketleri` SELECT atıyordu (Promise.all içinde 1 query/hesap).
-- 20 hesap → 21 query, network round-trip + DB connection overhead.
--
-- Çözüm: Tek RPC + LEFT JOIN ile bakiyeyi DB tarafında hesapla. PostgreSQL
-- aggregate (`SUM`) ve `GROUP BY` ile N hesabı tek query'de döner.
--
-- Index: `banka_hareketleri(banka_hesap_id, islem_tipi)` — RPC içindeki
-- JOIN + SUM operasyonu için kritik (büyük projelerde sequential scan'i
-- index scan'e çevirir).

BEGIN;

-- Composite index — proje bazlı sorgu zaten banka_hesap_id ile başlar,
-- islem_tipi ile filtre yapılır (gelir/gider toplamı için CASE).
CREATE INDEX IF NOT EXISTS idx_banka_hareketleri_hesap_tip
  ON public.banka_hareketleri(banka_hesap_id, islem_tipi);

-- RPC: fn_banka_hesaplari_with_bakiye
-- Tek query'de tüm hesapları + bakiyelerini döndürür.
-- bakiye = sum(gelir) - sum(gider) (LEFT JOIN ile hesap hareketleri olmasa da row döner).
CREATE OR REPLACE FUNCTION public.fn_banka_hesaplari_with_bakiye(p_proje_id UUID)
RETURNS TABLE (
  id UUID,
  proje_id UUID,
  banka_adi TEXT,
  sube TEXT,
  hesap_no TEXT,
  iban TEXT,
  aktif BOOLEAN,
  created_at TIMESTAMPTZ,
  bakiye NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    h.id,
    h.proje_id,
    h.banka_adi::TEXT,
    h.sube::TEXT,
    h.hesap_no::TEXT,
    h.iban::TEXT,
    h.aktif,
    h.created_at,
    COALESCE(
      SUM(
        CASE
          WHEN hr.islem_tipi = 'gelir' THEN hr.tutar
          WHEN hr.islem_tipi = 'gider' THEN -hr.tutar
          ELSE 0
        END
      ),
      0
    )::NUMERIC AS bakiye
  FROM public.banka_hesaplari h
  LEFT JOIN public.banka_hareketleri hr ON hr.banka_hesap_id = h.id
  WHERE h.proje_id = p_proje_id
  GROUP BY h.id
  ORDER BY h.banka_adi;
$$;

COMMENT ON FUNCTION public.fn_banka_hesaplari_with_bakiye IS
  'Sprint 20260520-perf / PR2: Tek query ile proje banka hesaplarını + bakiyeyi döndürür. N+1 fix.';

COMMIT;
