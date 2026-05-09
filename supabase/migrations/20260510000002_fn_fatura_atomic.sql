-- Migration: 20260510000002_fn_fatura_atomic.sql
-- Description: Faturanın master + kalem + cari hareket olarak tek transaction'da
-- oluşturulması/güncellenmesi için atomik RPC'ler.
--
-- Önceki implementasyon faturalar.insert + fatura_kalemleri.insert + cari_hareketler.insert
-- işlemlerini ayrı ayrı çağırıyordu. Aralarında hata olursa tutarsız state oluşuyordu
-- (kalem hatası throw etmeden log'lanıyor; cari hareket try/catch ile yutuluyordu).
-- Ayrıca cari_hareketler.islem_turu CHECK constraint'inde 'fatura' değeri yoktu;
-- bu yüzden cari hareket insert sessizce CHECK violation alıyordu.

-- 0. islem_turu CHECK'ine 'fatura' değerini ekle
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
    END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check
CHECK (islem_turu IN ('aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme', 'gecikme_faizi', 'fatura'));

-- 1. CREATE
CREATE OR REPLACE FUNCTION public.fn_create_fatura_atomic(
  p_master JSONB,
  p_kalemler JSONB
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
  v_master_kdv := COALESCE((p_master->>'kdv_orani')::NUMERIC, 20);

  -- Kalemlerden master tutarları hesapla; kalem yoksa master JSONB'deki değerleri kullan
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

  -- 1. Fatura insert
  INSERT INTO public.faturalar (
    proje_id, firma_id, fatura_no, fatura_tipi, fatura_tarihi, vade_tarihi,
    ara_toplam, kdv_orani, kdv_tutar, toplam_tutar, durum, aciklama, hakedis_id
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
    COALESCE(NULLIF(p_master->>'durum', ''), 'bekliyor')::fatura_durumu,
    p_master->>'aciklama',
    NULLIF(p_master->>'hakedis_id', '')::UUID
  ) RETURNING id INTO v_fatura_id;

  -- 2. Kalemler insert (bulk)
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

  -- 3. Cari hareket: gelen fatura ve firma_id varsa, firma cari hesabına borç olarak işle
  IF p_master->>'fatura_tipi' = 'gelen' AND p_master->>'firma_id' IS NOT NULL AND p_master->>'proje_id' IS NOT NULL THEN
    SELECT id INTO v_cari_hesap_id FROM public.cari_hesaplar
    WHERE proje_id = (p_master->>'proje_id')::UUID
      AND firma_id = (p_master->>'firma_id')::UUID
    LIMIT 1;

    IF v_cari_hesap_id IS NOT NULL THEN
      -- Idempotency: aynı fatura için cari hareket varsa güncelle
      IF EXISTS (
        SELECT 1 FROM public.cari_hareketler
        WHERE kaynak_tipi = 'fatura' AND kaynak_id = v_fatura_id
      ) THEN
        UPDATE public.cari_hareketler
          SET borc = v_toplam_tutar,
              alacak = 0,
              tarih = (p_master->>'fatura_tarihi')::DATE,
              aciklama = 'Fatura: ' || (p_master->>'fatura_no'),
              belge_no = p_master->>'fatura_no',
              cari_hesap_id = v_cari_hesap_id
        WHERE kaynak_tipi = 'fatura' AND kaynak_id = v_fatura_id;
      ELSE
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
        );
      END IF;
    END IF;
  END IF;

  -- 4. Sonuç (faturalar + firmalar(unvan) + fatura_kalemleri[])
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

-- 2. UPDATE
CREATE OR REPLACE FUNCTION public.fn_update_fatura_atomic(
  p_id UUID,
  p_master JSONB,
  p_kalemler JSONB
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
  SELECT * INTO v_existing FROM public.faturalar WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura bulunamadı: %', p_id USING ERRCODE = 'P0002';
  END IF;

  -- Master alanları (gönderilenle veya mevcutla)
  v_proje_id := COALESCE(NULLIF(p_master->>'proje_id', '')::UUID, v_existing.proje_id);
  v_firma_id := COALESCE(NULLIF(p_master->>'firma_id', '')::UUID, v_existing.firma_id);
  v_fatura_no := COALESCE(p_master->>'fatura_no', v_existing.fatura_no);
  v_fatura_tarihi := COALESCE(NULLIF(p_master->>'fatura_tarihi', '')::DATE, v_existing.fatura_tarihi);
  v_fatura_tipi := COALESCE(p_master->>'fatura_tipi', v_existing.fatura_tipi::TEXT);
  v_master_kdv := COALESCE((p_master->>'kdv_orani')::NUMERIC, v_existing.kdv_orani);

  -- Kalem array geldiyse: tutarları kalemlerden yeniden hesapla
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
    -- Kalem array gelmedi: mevcut master tutarlarını koru
    v_ara_toplam := v_existing.ara_toplam;
    v_kdv_tutar := v_existing.kdv_tutar;
    v_toplam_tutar := v_existing.toplam_tutar;
  END IF;

  -- 1. Master fatura update
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
    durum = COALESCE(NULLIF(p_master->>'durum', '')::fatura_durumu, durum),
    aciklama = COALESCE(p_master->>'aciklama', aciklama),
    hakedis_id = COALESCE(NULLIF(p_master->>'hakedis_id', '')::UUID, hakedis_id),
    updated_at = now()
  WHERE id = p_id;

  -- 2. Kalemler: array geldiyse sıfırla ve yeniden ekle (idempotent)
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

  -- 3. Cari hareket güncelle (idempotent)
  IF v_fatura_tipi = 'gelen' AND v_firma_id IS NOT NULL AND v_proje_id IS NOT NULL THEN
    SELECT id INTO v_cari_hesap_id FROM public.cari_hesaplar
    WHERE proje_id = v_proje_id AND firma_id = v_firma_id
    LIMIT 1;

    IF v_cari_hesap_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.cari_hareketler
        WHERE kaynak_tipi = 'fatura' AND kaynak_id = p_id
      ) THEN
        UPDATE public.cari_hareketler
          SET borc = v_toplam_tutar,
              alacak = 0,
              tarih = v_fatura_tarihi,
              aciklama = 'Fatura: ' || v_fatura_no,
              belge_no = v_fatura_no,
              cari_hesap_id = v_cari_hesap_id,
              proje_id = v_proje_id
        WHERE kaynak_tipi = 'fatura' AND kaynak_id = p_id;
      ELSE
        INSERT INTO public.cari_hareketler (
          proje_id, cari_hesap_id, islem_turu, borc, alacak, tarih,
          aciklama, belge_no, kaynak_tipi, kaynak_id
        ) VALUES (
          v_proje_id, v_cari_hesap_id, 'fatura', v_toplam_tutar, 0,
          v_fatura_tarihi,
          'Fatura: ' || v_fatura_no, v_fatura_no, 'fatura', p_id
        );
      END IF;
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
