-- Migration: 20260514000002_drop_fatura_durum.sql
-- Description: faturalar.durum kolonu manuel takip alanıydı; ödeme/eşleştirme
-- otomatik trigger'ı olmadığı için anlamlı tek değer her zaman 'bekliyor' kalıyordu
-- ve kullanıcıyı yanıltıyordu. Finansal gerçek cari_hareketler üzerinden takip
-- ediliyor; bu alan UX'i temizlemek için tamamen kaldırılıyor.
--
-- Yapılan değişiklikler:
--  1. fn_create_fatura_atomic ve fn_update_fatura_atomic RPC'leri yeniden tanımlanır,
--     INSERT/UPDATE statement'larından durum ve fatura_durumu referansları kaldırılır.
--     ON CONFLICT predicate'i 20260514000001'de hizalanan formda korunur.
--  2. faturalar.durum kolonu drop edilir.
--  3. fatura_durumu enum'u drop edilir (artık referans yok).

BEGIN;

-- =====================================================================
-- 1. fn_create_fatura_atomic — durum parametresi/INSERT'i kaldırıldı
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_create_fatura_atomic(JSONB, JSONB, UUID);
CREATE OR REPLACE FUNCTION public.fn_create_fatura_atomic(
  p_master JSONB,
  p_kalemler JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_fatura_id UUID;
  v_ara_toplam NUMERIC := 0;
  v_kdv_tutar NUMERIC := 0;
  v_toplam_tutar NUMERIC := 0;
  v_master_kdv NUMERIC;
  v_cari_hesap_id UUID;
  v_result JSONB;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  v_master_kdv := COALESCE((p_master->>'kdv_orani')::NUMERIC, 20);

  IF p_kalemler IS NOT NULL AND jsonb_array_length(p_kalemler) > 0 THEN
    SELECT
      COALESCE(SUM(COALESCE((k->>'miktar')::NUMERIC, 0) * COALESCE((k->>'birim_fiyat')::NUMERIC, 0)), 0)
    INTO v_ara_toplam
    FROM jsonb_array_elements(p_kalemler) k;
  ELSE
    v_ara_toplam := COALESCE((p_master->>'ara_toplam')::NUMERIC, 0);
  END IF;

  v_kdv_tutar := ROUND(v_ara_toplam * v_master_kdv / 100.0, 2);
  v_toplam_tutar := ROUND(v_ara_toplam + v_kdv_tutar, 2);

  INSERT INTO public.faturalar (
    proje_id, firma_id, fatura_no, fatura_tipi, fatura_tarihi, vade_tarihi,
    ara_toplam, kdv_orani, kdv_tutar, toplam_tutar, aciklama, hakedis_id
  ) VALUES (
    NULLIF(p_master->>'proje_id', '')::UUID,
    (p_master->>'firma_id')::UUID,
    p_master->>'fatura_no',
    (p_master->>'fatura_tipi')::fatura_tipi,
    (p_master->>'fatura_tarihi')::DATE,
    NULLIF(p_master->>'vade_tarihi', '')::DATE,
    v_ara_toplam,
    v_master_kdv,
    v_kdv_tutar,
    v_toplam_tutar,
    p_master->>'aciklama',
    NULLIF(p_master->>'hakedis_id', '')::UUID
  ) RETURNING id INTO v_fatura_id;

  IF p_kalemler IS NOT NULL AND jsonb_array_length(p_kalemler) > 0 THEN
    INSERT INTO public.fatura_kalemleri (
      fatura_id, kalem_adi, birim, miktar, birim_fiyat, kdv_orani
    )
    SELECT
      v_fatura_id,
      k->>'kalem_adi',
      k->>'birim',
      COALESCE((k->>'miktar')::NUMERIC, 0),
      COALESCE((k->>'birim_fiyat')::NUMERIC, 0),
      COALESCE((k->>'kdv_orani')::NUMERIC, v_master_kdv)
    FROM jsonb_array_elements(p_kalemler) k;
  END IF;

  IF p_master->>'fatura_tipi' = 'gelen' AND p_master->>'firma_id' IS NOT NULL AND p_master->>'proje_id' IS NOT NULL THEN
    SELECT id INTO v_cari_hesap_id FROM public.cari_hesaplar
    WHERE proje_id = (p_master->>'proje_id')::UUID
      AND firma_id = (p_master->>'firma_id')::UUID
    LIMIT 1;

    IF v_cari_hesap_id IS NOT NULL THEN
      INSERT INTO public.cari_hareketler (
        proje_id, cari_hesap_id, islem_turu, borc, alacak, tarih,
        aciklama, belge_no, kaynak_tipi, kaynak_id
      ) VALUES (
        (p_master->>'proje_id')::UUID,
        v_cari_hesap_id,
        'fatura',
        v_toplam_tutar,
        0,
        (p_master->>'fatura_tarihi')::DATE,
        'Fatura: ' || (p_master->>'fatura_no'),
        p_master->>'fatura_no',
        'fatura',
        v_fatura_id
      )
      ON CONFLICT (kaynak_tipi, kaynak_id)
          WHERE kaynak_id IS NOT NULL
            AND kaynak_tipi IN ('aidat_kayit', 'gecikme_faizi', 'fatura')
      DO UPDATE SET
        proje_id = EXCLUDED.proje_id,
        cari_hesap_id = EXCLUDED.cari_hesap_id,
        islem_turu = EXCLUDED.islem_turu,
        borc = EXCLUDED.borc,
        alacak = EXCLUDED.alacak,
        tarih = EXCLUDED.tarih,
        aciklama = EXCLUDED.aciklama,
        belge_no = EXCLUDED.belge_no;
    END IF;
  END IF;

  SELECT to_jsonb(f.*) || jsonb_build_object(
    'fatura_kalemleri', COALESCE((
      SELECT jsonb_agg(to_jsonb(fk.*) ORDER BY fk.created_at)
      FROM public.fatura_kalemleri fk WHERE fk.fatura_id = f.id
    ), '[]'::jsonb),
    'firmalar', (
      SELECT jsonb_build_object('unvan', firm.unvan)
      FROM public.firmalar firm WHERE firm.id = f.firma_id
    )
  )
  INTO v_result
  FROM public.faturalar f WHERE f.id = v_fatura_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_fatura_atomic(JSONB, JSONB, UUID) IS
  'Fatura + kalemler + (gelen ise) cari hareket atomik. faturalar.durum '
  'kolonu kaldırıldı (20260514000002). p_actor_id app.actor_id session var olarak set edilir.';

-- =====================================================================
-- 2. fn_update_fatura_atomic — durum parametresi/UPDATE'i kaldırıldı
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_update_fatura_atomic(UUID, JSONB, JSONB, UUID);
CREATE OR REPLACE FUNCTION public.fn_update_fatura_atomic(
  p_id UUID,
  p_master JSONB,
  p_kalemler JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing public.faturalar%ROWTYPE;
  v_ara_toplam NUMERIC;
  v_kdv_tutar NUMERIC;
  v_toplam_tutar NUMERIC;
  v_master_kdv NUMERIC;
  v_cari_hesap_id UUID;
  v_proje_id UUID;
  v_firma_id UUID;
  v_fatura_no TEXT;
  v_fatura_tarihi DATE;
  v_fatura_tipi TEXT;
  v_result JSONB;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  SELECT * INTO v_existing FROM public.faturalar WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura bulunamadı: %', p_id USING ERRCODE = 'P0002';
  END IF;

  v_proje_id := COALESCE(NULLIF(p_master->>'proje_id', '')::UUID, v_existing.proje_id);
  v_firma_id := COALESCE(NULLIF(p_master->>'firma_id', '')::UUID, v_existing.firma_id);
  v_fatura_no := COALESCE(p_master->>'fatura_no', v_existing.fatura_no);
  v_fatura_tarihi := COALESCE(NULLIF(p_master->>'fatura_tarihi', '')::DATE, v_existing.fatura_tarihi);
  v_fatura_tipi := COALESCE(p_master->>'fatura_tipi', v_existing.fatura_tipi::TEXT);
  v_master_kdv := COALESCE((p_master->>'kdv_orani')::NUMERIC, v_existing.kdv_orani);

  IF p_kalemler IS NOT NULL THEN
    IF jsonb_array_length(p_kalemler) > 0 THEN
      SELECT
        COALESCE(SUM(COALESCE((k->>'miktar')::NUMERIC, 0) * COALESCE((k->>'birim_fiyat')::NUMERIC, 0)), 0)
      INTO v_ara_toplam
      FROM jsonb_array_elements(p_kalemler) k;
    ELSE
      v_ara_toplam := 0;
    END IF;
    v_kdv_tutar := ROUND(v_ara_toplam * v_master_kdv / 100.0, 2);
    v_toplam_tutar := ROUND(v_ara_toplam + v_kdv_tutar, 2);
  ELSE
    v_ara_toplam := v_existing.ara_toplam;
    v_kdv_tutar := v_existing.kdv_tutar;
    v_toplam_tutar := v_existing.toplam_tutar;
  END IF;

  UPDATE public.faturalar SET
    proje_id = v_proje_id,
    firma_id = v_firma_id,
    fatura_no = v_fatura_no,
    fatura_tipi = v_fatura_tipi::fatura_tipi,
    fatura_tarihi = v_fatura_tarihi,
    vade_tarihi = COALESCE(NULLIF(p_master->>'vade_tarihi', '')::DATE, vade_tarihi),
    ara_toplam = v_ara_toplam,
    kdv_orani = v_master_kdv,
    kdv_tutar = v_kdv_tutar,
    toplam_tutar = v_toplam_tutar,
    aciklama = COALESCE(p_master->>'aciklama', aciklama),
    hakedis_id = COALESCE(NULLIF(p_master->>'hakedis_id', '')::UUID, hakedis_id),
    updated_at = now()
  WHERE id = p_id;

  IF p_kalemler IS NOT NULL THEN
    DELETE FROM public.fatura_kalemleri WHERE fatura_id = p_id;

    IF jsonb_array_length(p_kalemler) > 0 THEN
      INSERT INTO public.fatura_kalemleri (
        fatura_id, kalem_adi, birim, miktar, birim_fiyat, kdv_orani
      )
      SELECT
        p_id,
        k->>'kalem_adi',
        k->>'birim',
        COALESCE((k->>'miktar')::NUMERIC, 0),
        COALESCE((k->>'birim_fiyat')::NUMERIC, 0),
        COALESCE((k->>'kdv_orani')::NUMERIC, v_master_kdv)
      FROM jsonb_array_elements(p_kalemler) k;
    END IF;
  END IF;

  IF v_fatura_tipi = 'gelen' AND v_firma_id IS NOT NULL AND v_proje_id IS NOT NULL THEN
    SELECT id INTO v_cari_hesap_id FROM public.cari_hesaplar
    WHERE proje_id = v_proje_id AND firma_id = v_firma_id
    LIMIT 1;

    IF v_cari_hesap_id IS NOT NULL THEN
      INSERT INTO public.cari_hareketler (
        proje_id, cari_hesap_id, islem_turu, borc, alacak, tarih,
        aciklama, belge_no, kaynak_tipi, kaynak_id
      ) VALUES (
        v_proje_id, v_cari_hesap_id, 'fatura', v_toplam_tutar, 0,
        v_fatura_tarihi,
        'Fatura: ' || v_fatura_no, v_fatura_no, 'fatura', p_id
      )
      ON CONFLICT (kaynak_tipi, kaynak_id)
          WHERE kaynak_id IS NOT NULL
            AND kaynak_tipi IN ('aidat_kayit', 'gecikme_faizi', 'fatura')
      DO UPDATE SET
        proje_id = EXCLUDED.proje_id,
        cari_hesap_id = EXCLUDED.cari_hesap_id,
        islem_turu = EXCLUDED.islem_turu,
        borc = EXCLUDED.borc,
        alacak = EXCLUDED.alacak,
        tarih = EXCLUDED.tarih,
        aciklama = EXCLUDED.aciklama,
        belge_no = EXCLUDED.belge_no;
    END IF;
  END IF;

  SELECT to_jsonb(f.*) || jsonb_build_object(
    'fatura_kalemleri', COALESCE((
      SELECT jsonb_agg(to_jsonb(fk.*) ORDER BY fk.created_at)
      FROM public.fatura_kalemleri fk WHERE fk.fatura_id = f.id
    ), '[]'::jsonb),
    'firmalar', (
      SELECT jsonb_build_object('unvan', firm.unvan)
      FROM public.firmalar firm WHERE firm.id = f.firma_id
    )
  )
  INTO v_result
  FROM public.faturalar f WHERE f.id = p_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_update_fatura_atomic(UUID, JSONB, JSONB, UUID) IS
  'Fatura + kalemler + cari hareket guncelleme atomik. faturalar.durum '
  'kolonu kaldırıldı (20260514000002). p_actor_id app.actor_id set edilir.';

-- =====================================================================
-- 3. faturalar.durum kolonunu drop et
-- =====================================================================
ALTER TABLE public.faturalar DROP COLUMN IF EXISTS durum;

-- =====================================================================
-- 4. fatura_durumu enum'unu drop et (artık referans yok)
-- =====================================================================
DROP TYPE IF EXISTS fatura_durumu;

COMMIT;
