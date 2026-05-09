-- Migration: 20260510000004_rpc_on_conflict_refactor.sql
-- Description: cari_hareketler unique constraint sonrasında, fatura ve faiz RPC'lerinde
-- EXISTS-then-INSERT/UPDATE paternini ON CONFLICT DO UPDATE'e çevirir.
-- Race durumunda 500 yerine atomik upsert.

-- 1. fn_create_fatura_atomic — cari hareket INSERT'i ON CONFLICT'le
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
      ON CONFLICT (kaynak_tipi, kaynak_id) WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL
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

-- 2. fn_update_fatura_atomic — cari hareket UPDATE/INSERT'i ON CONFLICT'le
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
    durum = COALESCE(NULLIF(p_master->>'durum', '')::fatura_durumu, durum),
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
      ON CONFLICT (kaynak_tipi, kaynak_id) WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL
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

-- 3. fn_bulk_charge_interest — gecikme faizi tahakkuku INSERT'i ON CONFLICT'le
CREATE OR REPLACE FUNCTION public.fn_bulk_charge_interest(
    p_aidat_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
    v_aidat_id UUID;
    v_record RECORD;
    v_gun_sayisi INTEGER;
    v_baz_tutar NUMERIC;
    v_faiz_orani NUMERIC;
    v_yeni_faiz NUMERIC;
    v_cari_id UUID;
    v_success_count INTEGER := 0;
BEGIN
    FOREACH v_aidat_id IN ARRAY p_aidat_ids
    LOOP
        SELECT
            a.id, a.proje_id, a.uye_id, a.son_odeme_tarihi, a.gecikme_faizi,
            at.yil, at.ay, at.katsayi_tutari, at.gecikme_faiz_orani,
            s.serefiye_orani
        INTO v_record
        FROM public.aidatlar a
        JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
        JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
        WHERE a.id = v_aidat_id;

        IF FOUND AND v_record.uye_id IS NOT NULL THEN
            v_gun_sayisi := CURRENT_DATE - v_record.son_odeme_tarihi;
            v_baz_tutar := v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00);
            v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;

            IF v_gun_sayisi < 5 THEN
                v_yeni_faiz := 0;
            ELSE
                v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
            END IF;

            v_yeni_faiz := ROUND(v_yeni_faiz, 2);

            IF v_yeni_faiz > 0 THEN
                UPDATE public.aidatlar
                SET gecikme_faizi = v_yeni_faiz, faiz_yansitildi = TRUE, durum = 'gecikti', updated_at = now()
                WHERE id = v_record.id;

                SELECT id INTO v_cari_id FROM public.cari_hesaplar
                WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

                IF v_cari_id IS NOT NULL THEN
                    INSERT INTO public.cari_hareketler (
                        proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                    ) VALUES (
                        v_record.proje_id, v_cari_id, 'gecikme_faizi', CURRENT_DATE, v_yeni_faiz, 0, 'gecikme_faizi', v_record.id,
                        v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                    )
                    ON CONFLICT (kaynak_tipi, kaynak_id) WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL
                    DO UPDATE SET
                        proje_id = EXCLUDED.proje_id,
                        cari_hesap_id = EXCLUDED.cari_hesap_id,
                        islem_turu = EXCLUDED.islem_turu,
                        tarih = EXCLUDED.tarih,
                        alacak = EXCLUDED.alacak,
                        borc = EXCLUDED.borc,
                        aciklama = EXCLUDED.aciklama;

                    v_success_count := v_success_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'count', v_success_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
