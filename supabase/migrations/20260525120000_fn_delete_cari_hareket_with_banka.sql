-- Sprint qa-review-bugfix-faz3 (2026-05-25, P1 #5)
-- ============================================================================
-- Cari hareket silme — atomik RPC
-- ----------------------------------------------------------------------------
-- Eski davranis (cariHesap.service.ts:206-241): iki ayri DELETE statement
--   1) DELETE FROM banka_hareketleri WHERE eslesen_cari_hareket_id = id
--   2) DELETE FROM cari_hareketler WHERE id = id
-- Transaction yoktu → birinci basariliysa + ikinci fail olursa orphan banka
-- hareketi kalmazdi ama tutarsizlik riski vardi. Code comment "Tam atomik
-- gerekirse RPC'ye tasinmali (P2 backlog)" itirafindaydi.
--
-- Bu RPC tek SQL transaction icinde calisir; herhangi bir adim fail olursa
-- tum operasyon rollback. Idempotent degil — once kayit varlik+kapali-mi
-- kontrolu yapilir; kapali ise P0001 yukseltilir (errorHandler.ts:113-119
-- bunu 400 + Turkce mesaja cevirir).
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_delete_cari_hareket_with_banka(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kaynak_tipi text;
  v_kaynak_id uuid;
BEGIN
  -- Existence + state kontrolu
  SELECT kaynak_tipi, kaynak_id
    INTO v_kaynak_tipi, v_kaynak_id
    FROM cari_hareketler
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cari hareket bulunamadi'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_kaynak_tipi IS NOT NULL AND v_kaynak_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Bu tahsilat bir aidat/hakedis ile eslesti ve dogrudan silinemez. Once hesap kapamayi geri alin.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Esleseni banka hareketini once sil (FK ON DELETE NO ACTION)
  DELETE FROM banka_hareketleri
   WHERE eslesen_cari_hareket_id = p_id;

  -- Cari hareketi sil
  DELETE FROM cari_hareketler
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_delete_cari_hareket_with_banka(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_delete_cari_hareket_with_banka(uuid) TO authenticated;
