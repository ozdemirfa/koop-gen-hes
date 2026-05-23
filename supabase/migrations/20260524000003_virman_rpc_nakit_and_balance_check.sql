-- Migration: 20260524000003_virman_rpc_nakit_and_balance_check.sql
-- Description: fn_create_virman_atomic'e 3 ekleme:
--   1. KAYNAK BAKİYE KONTROLÜ (insert'lerden önce, lock ile race-safe)
--      - banka_banka / banka_nakit → kaynak banka satırı FOR UPDATE + bakiye check
--      - nakit_banka → pg_advisory_xact_lock(proje) + nakit kasa SUM check
--      - Yetersizse RAISE EXCEPTION (P0001) → errorHandler.ts user-facing 400 döndürür.
--   2. NAKİT TARAFI CARİ_HAREKET KAYDI (mevcut bug)
--      - Önce sadece banka_hareketleri yazılıyordu; nakit tarafa hiçbir kayıt yok →
--        para "kayboluyor"/"yaratılıyor" (#3 kuralı).
--      - Artık banka_nakit virman 'virman_nakit_giris' (borç), nakit_banka virman
--        'virman_nakit_cikis' (alacak) olarak cari_hareketler'e yazılır.
--      - cari_hesap_id = NULL (virmanın cari hesabı yok); fn_dashboard_ozet LEFT JOIN
--        (20260524000002) bu satırı kasa toplamına dahil eder.
--   3. VIRMAN DELETE TRIGGER (orphan koruması)
--      - banka_hareketleri'nin virman_id FK CASCADE'i var; cari_hareketler için FK yok.
--      - BEFORE DELETE trigger ile cari_hareketler virman satırları silinir.
--
-- BAĞIMLILIKLAR: 20260524000001 (islem_turu CHECK), 20260524000002 (LEFT JOIN).

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_create_virman_atomic(
  p_data JSONB,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_proje_id UUID;
  v_kaynak_id UUID;
  v_hedef_id UUID;
  v_tipi TEXT;
  v_tutar NUMERIC(14, 2);
  v_tarih DATE;
  v_aciklama TEXT;
  v_virman_id UUID;
  v_gider_hareket_id UUID;
  v_gelir_hareket_id UUID;
  v_kaynak_bakiye NUMERIC(14, 2);
BEGIN
  v_proje_id := (p_data->>'proje_id')::UUID;
  v_kaynak_id := NULLIF(p_data->>'kaynak_hesap_id', '')::UUID;
  v_hedef_id := NULLIF(p_data->>'hedef_hesap_id', '')::UUID;
  v_tipi := p_data->>'virman_tipi';
  v_tutar := (p_data->>'tutar')::NUMERIC(14, 2);
  v_tarih := (p_data->>'tarih')::DATE;
  v_aciklama := p_data->>'aciklama';

  IF v_proje_id IS NULL THEN
    RAISE EXCEPTION 'proje_id zorunlu'
      USING ERRCODE = '23502', COLUMN = 'proje_id';
  END IF;
  IF v_tipi IS NULL THEN
    RAISE EXCEPTION 'virman_tipi zorunlu'
      USING ERRCODE = '23502', COLUMN = 'virman_tipi';
  END IF;
  IF v_tutar IS NULL OR v_tutar <= 0 THEN
    RAISE EXCEPTION 'tutar pozitif olmalı'
      USING ERRCODE = '22023', COLUMN = 'tutar';
  END IF;
  IF v_tarih IS NULL THEN
    RAISE EXCEPTION 'tarih zorunlu'
      USING ERRCODE = '23502', COLUMN = 'tarih';
  END IF;

  -- ============================================================
  -- 0. KAYNAK BAKİYE KONTROLÜ (lock + check)
  -- ============================================================
  IF v_tipi IN ('banka_banka', 'banka_nakit') THEN
    -- Kaynak banka satırını kilitle → eş zamanlı virman/ödeme bakiye-overflow olmasın.
    PERFORM 1 FROM public.banka_hesaplari WHERE id = v_kaynak_id FOR UPDATE;
    SELECT bakiye INTO v_kaynak_bakiye
      FROM public.fn_banka_hesaplari_with_bakiye(v_proje_id)
      WHERE id = v_kaynak_id;
    IF v_kaynak_bakiye IS NULL THEN
      RAISE EXCEPTION 'Kaynak banka hesabı bulunamadı'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_kaynak_bakiye < v_tutar THEN
      RAISE EXCEPTION 'Kaynak banka bakiyesi yetersiz (mevcut: % TL, talep: % TL)',
        v_kaynak_bakiye, v_tutar
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_tipi = 'nakit_banka' THEN
    -- Nakit kasa için satır kilidi yok (cari_hareketler aggregate). Advisory lock ile
    -- proje bazlı seri-leştirme yap.
    PERFORM pg_advisory_xact_lock(hashtext('nakit_kasa:' || v_proje_id::text));
    SELECT COALESCE(SUM(borc) - SUM(alacak), 0) INTO v_kaynak_bakiye
      FROM public.cari_hareketler
      WHERE proje_id = v_proje_id AND odeme_turu = 'nakit';
    IF v_kaynak_bakiye < v_tutar THEN
      RAISE EXCEPTION 'Nakit kasa bakiyesi yetersiz (mevcut: % TL, talep: % TL)',
        v_kaynak_bakiye, v_tutar
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ============================================================
  -- 1. Virman başlığını oluştur (CHECK constraint'ler tipi doğrular)
  -- ============================================================
  INSERT INTO public.virmanlar (
    proje_id, kaynak_hesap_id, hedef_hesap_id, virman_tipi,
    tutar, tarih, aciklama, created_by
  ) VALUES (
    v_proje_id, v_kaynak_id, v_hedef_id, v_tipi,
    v_tutar, v_tarih, v_aciklama, p_actor_id
  )
  RETURNING id INTO v_virman_id;

  -- ============================================================
  -- 2. Banka tarafı kayıtları (proje_id NOT NULL, 20260511000007)
  -- ============================================================
  IF v_kaynak_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      proje_id, banka_hesap_id, tarih, tutar, islem_tipi, aciklama, virman_id
    ) VALUES (
      v_proje_id, v_kaynak_id, v_tarih, v_tutar, 'gider',
      COALESCE('Virman (giden): ' || COALESCE(v_aciklama, ''), 'Virman (giden)'),
      v_virman_id
    )
    RETURNING id INTO v_gider_hareket_id;
  END IF;

  IF v_hedef_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      proje_id, banka_hesap_id, tarih, tutar, islem_tipi, aciklama, virman_id
    ) VALUES (
      v_proje_id, v_hedef_id, v_tarih, v_tutar, 'gelir',
      COALESCE('Virman (gelen): ' || COALESCE(v_aciklama, ''), 'Virman (gelen)'),
      v_virman_id
    )
    RETURNING id INTO v_gelir_hareket_id;
  END IF;

  -- ============================================================
  -- 3. NAKİT TARAFI cari_hareketler kaydı (bug fix — para kayboluyor/yaratılıyordu)
  -- ============================================================
  IF v_tipi = 'banka_nakit' THEN
    -- Bankadan kasaya giriş → kasa borç (artar)
    INSERT INTO public.cari_hareketler (
      proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
      tarih, borc, alacak, aciklama, kaynak_tipi, kaynak_id
    ) VALUES (
      v_proje_id, NULL, 'virman_nakit_giris', 'nakit', 'nakit',
      v_tarih, v_tutar, 0,
      COALESCE('Virman (banka→nakit): ' || COALESCE(v_aciklama, ''), 'Virman (banka→nakit)'),
      'virman', v_virman_id
    );
  ELSIF v_tipi = 'nakit_banka' THEN
    -- Kasadan bankaya çıkış → kasa alacak (azalır)
    INSERT INTO public.cari_hareketler (
      proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
      tarih, borc, alacak, aciklama, kaynak_tipi, kaynak_id
    ) VALUES (
      v_proje_id, NULL, 'virman_nakit_cikis', 'nakit', 'nakit',
      v_tarih, 0, v_tutar,
      COALESCE('Virman (nakit→banka): ' || COALESCE(v_aciklama, ''), 'Virman (nakit→banka)'),
      'virman', v_virman_id
    );
  END IF;

  RETURN jsonb_build_object(
    'virman_id', v_virman_id,
    'gider_hareket_id', v_gider_hareket_id,
    'gelir_hareket_id', v_gelir_hareket_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_virman_atomic IS
  '20260524000003: Bakiye kontrolü (lock + check) + nakit tarafı cari_hareketler INSERT + #3 bug fix (nakit kasa güncellenir).';

-- ============================================================
-- 4. VIRMAN DELETE TRIGGER — cari_hareketler virman satırlarını sil (orphan koruması)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_virman_delete_cleanup_cari()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.cari_hareketler
   WHERE kaynak_tipi = 'virman' AND kaynak_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_virman_delete_cari ON public.virmanlar;
CREATE TRIGGER trg_virman_delete_cari
  BEFORE DELETE ON public.virmanlar
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_virman_delete_cleanup_cari();

COMMENT ON FUNCTION public.fn_virman_delete_cleanup_cari IS
  '20260524000003: Virman silindiğinde cari_hareketler''deki virman satırlarını da temizle (banka_hareketleri FK CASCADE ile siliniyor, cari için FK yok).';

COMMIT;
