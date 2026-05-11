-- Migration: 20260511000003_audit_actor_remaining_rpcs.sql
-- Description: TASK-DB-03 devami. Kalan 13 mutate RPC'ye p_actor_id parametresi +
-- set_config('app.actor_id', ...) cagrisi ekler. Bu sayede service-role ile
-- yapilan tum mutate'lerde audit_logs.actor_id dolu gelir.
--
-- Pattern (her RPC icin):
--   1. DROP FUNCTION IF EXISTS public.fn_xxx(eski_imza);  -- parametre listesi degisecek
--   2. CREATE OR REPLACE FUNCTION public.fn_xxx(orijinal_params..., p_actor_id UUID DEFAULT NULL)
--   3. RPC body basinda: PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);
--   4. Body'nin geri kalani canonical son surumden kopyalanir (degistirilmedi).
--
-- Referans: 20260511000001_audit_actor_integration.sql (member + payment RPC'lerinin pattern uygulamasi)
--
-- Geriye uyumluluk: p_actor_id DEFAULT NULL -> eski cagrilar (test fixtures, manuel SQL) bozulmaz.

BEGIN;

-- =====================================================================
-- 1. fn_create_fatura_atomic
-- Onceki imza: fn_create_fatura_atomic(JSONB, JSONB) -- 20260510000004
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_create_fatura_atomic(JSONB, JSONB);
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

COMMENT ON FUNCTION public.fn_create_fatura_atomic IS
  'Fatura + kalemler + (gelen ise) cari hareket atomik. p_actor_id verilirse'
  ' app.actor_id session var set edilir; audit trigger bu degeri okur.';

-- =====================================================================
-- 2. fn_update_fatura_atomic
-- Onceki imza: fn_update_fatura_atomic(UUID, JSONB, JSONB) -- 20260510000004
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_update_fatura_atomic(UUID, JSONB, JSONB);
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

COMMENT ON FUNCTION public.fn_update_fatura_atomic IS
  'Fatura + kalemler + cari hareket guncelleme atomik. p_actor_id verilirse'
  ' app.actor_id session var set edilir; audit trigger bu degeri okur.';

-- =====================================================================
-- 3. fn_charge_aidat_tanimi
-- Onceki imza: fn_charge_aidat_tanimi(UUID) -- 20260425000001 (project perspective surumu)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_charge_aidat_tanimi(UUID);
CREATE OR REPLACE FUNCTION public.fn_charge_aidat_tanimi(
  p_tanim_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_daire RECORD;
    v_count INTEGER := 0;
    v_son_odeme_tarihi DATE;
    v_uye_id UUID;
    v_cari_id UUID;
    v_tutar NUMERIC(12,2);
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT * INTO v_record FROM public.aidat_tanimlari WHERE id = p_tanim_id;

    IF v_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat tanımı bulunamadı.');
    END IF;

    IF v_record.durum = 'borclandi' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu tanım zaten borçlandırılmış.');
    END IF;

    v_son_odeme_tarihi := (v_record.yil::TEXT || '-' || v_record.ay::TEXT || '-' || v_record.son_odeme_gunu::TEXT)::DATE;

    FOR v_daire IN
        SELECT id, serefiye_orani, proje_id FROM public.serefiye_tablosu
        WHERE proje_id = v_record.proje_id
    LOOP
        SELECT id INTO v_uye_id FROM public.uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1;

        INSERT INTO public.aidatlar (
            proje_id, serefiye_id, uye_id, aidat_tanimi_id, son_odeme_tarihi
        ) VALUES (
            v_record.proje_id, v_daire.id, v_uye_id, v_record.id, v_son_odeme_tarihi
        )
        ON CONFLICT (serefiye_id, aidat_tanimi_id) DO NOTHING;

        IF v_uye_id IS NOT NULL THEN
            v_tutar := v_record.katsayi_tutari * COALESCE(v_daire.serefiye_orani, 1.00);

            SELECT id INTO v_cari_id FROM public.cari_hesaplar
            WHERE proje_id = v_record.proje_id AND uye_id = v_uye_id;

            IF v_cari_id IS NOT NULL THEN
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                )
                SELECT
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_tutar, 0, 'aidat', a.id, v_record.ay || '/' || v_record.yil || ' Aidat Tahakkuku'
                FROM public.aidatlar a
                WHERE a.serefiye_id = v_daire.id AND a.aidat_tanimi_id = v_record.id;
            END IF;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    UPDATE public.aidat_tanimlari
    SET durum = 'borclandi', updated_at = NOW()
    WHERE id = p_tanim_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Borçlandırma başarıyla tamamlandı',
        'total_aidat_created', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_charge_aidat_tanimi IS
  'Aidat tanimi manuel borclandirma + her daire icin aidat + cari hareket. '
  'p_actor_id verilirse app.actor_id session var set edilir.';

-- =====================================================================
-- 4. create_yillik_aidat_plani
-- Onceki imza: create_yillik_aidat_plani(UUID, INTEGER, JSONB) -- 20260421000006
-- =====================================================================
DROP FUNCTION IF EXISTS public.create_yillik_aidat_plani(UUID, INTEGER, JSONB);
CREATE OR REPLACE FUNCTION public.create_yillik_aidat_plani(
  p_proje_id UUID,
  p_yil INTEGER,
  p_kalemler JSONB,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_kalem JSONB;
  v_tanim_id UUID;
  v_olusturulan_tanim INTEGER := 0;
  v_ay INTEGER;
  v_tur VARCHAR(20);
  v_son_odeme_gunu INTEGER;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_ay := (v_kalem->>'ay')::INTEGER;
    v_tur := COALESCE(v_kalem->>'tur', 'normal');
    v_son_odeme_gunu := COALESCE((v_kalem->>'son_odeme_gunu')::INTEGER, 15);

    IF EXISTS (
      SELECT 1 FROM public.aidat_tanimlari
      WHERE proje_id = p_proje_id AND yil = p_yil AND ay = v_ay AND tur = v_tur
      AND durum = 'borclandi'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.aidat_tanimlari (
      proje_id, yil, ay, katsayi_tutari, son_odeme_gunu, gecikme_faiz_orani, tur, aciklama, durum
    ) VALUES (
      p_proje_id, p_yil, v_ay, (v_kalem->>'katsayi_tutari')::NUMERIC, v_son_odeme_gunu,
      COALESCE((v_kalem->>'gecikme_faiz_orani')::NUMERIC, 0), v_tur, v_kalem->>'aciklama', 'plan'
    )
    ON CONFLICT (proje_id, yil, ay, tur)
    DO UPDATE SET
      katsayi_tutari = EXCLUDED.katsayi_tutari,
      son_odeme_gunu = EXCLUDED.son_odeme_gunu,
      gecikme_faiz_orani = EXCLUDED.gecikme_faiz_orani,
      aciklama = EXCLUDED.aciklama,
      updated_at = now()
    WHERE aidat_tanimlari.durum = 'plan'
    RETURNING id INTO v_tanim_id;

    v_olusturulan_tanim := v_olusturulan_tanim + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'yillik_tanim_sayisi', v_olusturulan_tanim,
    'yillik_tanim', v_olusturulan_tanim
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_yillik_aidat_plani IS
  'Yillik aidat plani UPSERT. p_actor_id verilirse app.actor_id session var set edilir.';

-- =====================================================================
-- 5. fn_execute_aidat_charging
-- Onceki imza: fn_execute_aidat_charging(DATE) -- 20260421000012 (robust surumu)
-- NOT: Bu RPC fn_charge_aidat_tanimi'yi cagiriyor; o RPC zaten p_actor_id alir.
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_execute_aidat_charging(DATE);
CREATE OR REPLACE FUNCTION public.fn_execute_aidat_charging(
  p_date DATE DEFAULT CURRENT_DATE,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_count INTEGER := 0;
    v_charged_definitions INTEGER := 0;
    v_year INTEGER;
    v_month INTEGER;
    v_res JSONB;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    v_year := EXTRACT(YEAR FROM p_date);
    v_month := EXTRACT(MONTH FROM p_date);

    FOR v_record IN
        SELECT id FROM public.aidat_tanimlari
        WHERE durum = 'plan'
        AND (yil < v_year OR (yil = v_year AND ay <= v_month))
        ORDER BY yil, ay
    LOOP
        -- Iceride fn_charge_aidat_tanimi cagrilir; p_actor_id'yi geciyoruz ki
        -- ic RPC de ayni session var'i set etsin (no-op olur ama tutarli).
        v_res := public.fn_charge_aidat_tanimi(v_record.id, p_actor_id);
        IF (v_res->>'success')::BOOLEAN THEN
            v_charged_definitions := v_charged_definitions + 1;
            v_count := v_count + (v_res->>'total_aidat_created')::INTEGER;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'charged_definitions', v_charged_definitions,
        'total_aidat_created', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_execute_aidat_charging IS
  'Plan asamasindaki tum aidat tanimlarini sirayla borclandir. '
  'p_actor_id verilirse app.actor_id session var set edilir + alt RPC''ye iletilir.';

-- =====================================================================
-- 6. fn_bulk_charge_interest
-- Onceki imza: fn_bulk_charge_interest(UUID[]) -- 20260510000004
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_bulk_charge_interest(UUID[]);
CREATE OR REPLACE FUNCTION public.fn_bulk_charge_interest(
    p_aidat_ids UUID[],
    p_actor_id UUID DEFAULT NULL
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
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

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

COMMENT ON FUNCTION public.fn_bulk_charge_interest IS
  'Coklu aidat icin faiz tahakkuku. p_actor_id verilirse app.actor_id session var set edilir.';

-- =====================================================================
-- 7. fn_toggle_aidat_faiz
-- Onceki imza: fn_toggle_aidat_faiz(UUID, BOOLEAN) -- 20260429000001 (security check surumu)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_toggle_aidat_faiz(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.fn_toggle_aidat_faiz(
  p_aidat_id UUID,
  p_active BOOLEAN,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_uye_id UUID;
    v_cari_id UUID;
    v_faiz NUMERIC(12,2);
    v_hareket_id UUID;
    v_eslesme_var BOOLEAN;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT a.*, COALESCE(a.uye_id, s.uye_id) as final_uye_id,
           at.yil, at.ay,
           (CURRENT_DATE - a.son_odeme_tarihi) as gecikme_gun
    INTO v_record
    FROM public.aidatlar a
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    WHERE a.id = p_aidat_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı.');
    END IF;

    v_uye_id := v_record.final_uye_id;
    IF v_uye_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu aidatın henüz bir üyesi yok.');
    END IF;

    v_faiz := COALESCE(v_record.gecikme_faizi, 0);

    IF v_faiz < 0.01 AND p_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Yansıtılacak anlamlı bir faiz tutarı bulunamadı.');
    END IF;

    SELECT id INTO v_cari_id FROM public.cari_hesaplar
    WHERE proje_id = v_record.proje_id AND uye_id = v_uye_id;

    IF p_active THEN
        UPDATE public.aidatlar SET faiz_yansitildi = TRUE WHERE id = p_aidat_id;

        IF v_cari_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id) THEN
                UPDATE public.cari_hareketler
                SET alacak = v_faiz,
                    aciklama = v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_record.gecikme_gun || ' gün)'
                WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id;
            ELSE
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                ) VALUES (
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_faiz, 0, 'gecikme_faizi', p_aidat_id,
                    v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_record.gecikme_gun || ' gün)'
                );
            END IF;
        END IF;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.cari_hareketler
            WHERE kaynak_id = p_aidat_id
              AND kaynak_tipi IN ('aidat', 'gecikme_faizi')
              AND borc > 0.009
        ) INTO v_eslesme_var;

        IF v_eslesme_var THEN
            RETURN jsonb_build_object('success', false, 'message', 'Bu aidata veya faizine ödeme yapılmış. Önce ödeme eşleştirmesini kaldırınız (Undo Closure).');
        END IF;

        SELECT id INTO v_hareket_id FROM public.cari_hareketler
        WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id LIMIT 1;

        IF v_hareket_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.banka_hareketleri WHERE eslesen_cari_hareket_id = v_hareket_id) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Bu faize ait banka hareketi eşleştirmesi yapılmış.');
            END IF;

            DELETE FROM public.cari_hareketler WHERE id = v_hareket_id;
        END IF;

        UPDATE public.aidatlar SET faiz_yansitildi = FALSE WHERE id = p_aidat_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'faiz_yansitildi', p_active);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_toggle_aidat_faiz IS
  'Aidat faiz yansitma toggle (security check ile). p_actor_id verilirse app.actor_id set edilir.';

-- =====================================================================
-- 8. fn_calculate_single_aidat_late_fee
-- Onceki imza: fn_calculate_single_aidat_late_fee(UUID) -- 20260426000001 (faiz_yansitildi uyumlu surum)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_calculate_single_aidat_late_fee(UUID);
CREATE OR REPLACE FUNCTION public.fn_calculate_single_aidat_late_fee(
    p_aidat_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_gun_sayisi INTEGER;
    v_baz_tutar NUMERIC;
    v_faiz_orani NUMERIC;
    v_yeni_faiz NUMERIC;
    v_eski_faiz NUMERIC;
    v_faiz_farki NUMERIC;
    v_cari_id UUID;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT
        a.id, a.proje_id, a.uye_id, a.son_odeme_tarihi, a.gecikme_faizi,
        a.gecikme_faizi_muaf, a.faiz_yansitildi,
        at.yil, at.ay, at.katsayi_tutari, at.gecikme_faiz_orani,
        s.serefiye_orani
    INTO v_record
    FROM public.aidatlar a
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    WHERE a.id = p_aidat_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı');
    END IF;

    IF v_record.gecikme_faizi_muaf = TRUE THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu aidat faizden muaftır.');
    END IF;

    v_gun_sayisi := CURRENT_DATE - v_record.son_odeme_tarihi;

    IF v_gun_sayisi < 5 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Henüz faiz hesaplanacak kadar gecikme (5 gün) oluşmadı');
    END IF;

    v_baz_tutar := v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00);
    v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;
    v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
    v_yeni_faiz := ROUND(v_yeni_faiz, 2);

    v_eski_faiz := COALESCE(v_record.gecikme_faizi, 0);
    v_faiz_farki := v_yeni_faiz - v_eski_faiz;

    IF v_faiz_farki <= 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Faiz zaten güncel', 'yeni_faiz', v_yeni_faiz);
    END IF;

    UPDATE public.aidatlar
    SET
        gecikme_faizi = v_yeni_faiz,
        durum = 'gecikti'::aidat_durumu,
        updated_at = now()
    WHERE id = p_aidat_id;

    IF v_record.faiz_yansitildi = TRUE AND v_record.uye_id IS NOT NULL THEN
        SELECT id INTO v_cari_id
        FROM public.cari_hesaplar
        WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

        IF v_cari_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id) THEN
                UPDATE public.cari_hareketler
                SET alacak = v_yeni_faiz,
                    aciklama = v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id;
            ELSE
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                ) VALUES (
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_yeni_faiz, 0, 'gecikme_faizi', p_aidat_id,
                    v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                );
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Faiz hesaplandı',
        'yeni_faiz', v_yeni_faiz,
        'faiz_farki', v_faiz_farki,
        'gecikme_gun', v_gun_sayisi
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_calculate_single_aidat_late_fee IS
  'Tek aidat icin gecikme faizi hesapla (faiz_yansitildi uyumlu). p_actor_id verilirse app.actor_id set edilir.';

-- =====================================================================
-- 9. fn_create_irsaliye_atomic
-- Onceki imza: fn_create_irsaliye_atomic(JSONB, JSONB) -- 20260510000013
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_create_irsaliye_atomic(JSONB, JSONB);
CREATE OR REPLACE FUNCTION public.fn_create_irsaliye_atomic(
  p_master_data JSONB,
  p_kalemler JSONB,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_irsaliye_id UUID;
  v_kalem JSONB;
  v_result RECORD;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  INSERT INTO public.irsaliyeler (
    proje_id, firma_id, sozlesme_id, hakedis_id,
    teslim_tarihi, irsaliye_no, teslim_alan, notlar
  )
  VALUES (
    NULLIF(p_master_data->>'proje_id', '')::UUID,
    NULLIF(p_master_data->>'firma_id', '')::UUID,
    NULLIF(p_master_data->>'sozlesme_id', '')::UUID,
    NULLIF(p_master_data->>'hakedis_id', '')::UUID,
    COALESCE((p_master_data->>'teslim_tarihi')::DATE, CURRENT_DATE),
    NULLIF(p_master_data->>'irsaliye_no', ''),
    NULLIF(p_master_data->>'teslim_alan', ''),
    NULLIF(p_master_data->>'notlar', '')
  )
  RETURNING id INTO v_irsaliye_id;

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    INSERT INTO public.irsaliye_kalemleri (
      irsaliye_id, malzeme_adi, miktar, birim
    )
    VALUES (
      v_irsaliye_id,
      v_kalem->>'malzeme_adi',
      (v_kalem->>'miktar')::NUMERIC,
      v_kalem->>'birim'
    );
  END LOOP;

  SELECT * INTO v_result FROM public.irsaliyeler WHERE id = v_irsaliye_id;
  RETURN to_jsonb(v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_irsaliye_atomic IS
  'Irsaliye + kalemler atomik. p_actor_id verilirse app.actor_id set edilir.';

-- =====================================================================
-- 10. fn_match_member_payments_fifo
-- Onceki imza: fn_match_member_payments_fifo(UUID, UUID) -- 20260429000001
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_match_member_payments_fifo(UUID, UUID);
CREATE OR REPLACE FUNCTION public.fn_match_member_payments_fifo(
  p_proje_id UUID,
  p_uye_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_total_unmatched_payment NUMERIC(14,2) := 0;
    v_aidat RECORD;
    v_payment RECORD;
    v_match_amount NUMERIC(14,2);
    v_matched_count INTEGER := 0;
    v_cari_id UUID;
    v_unmatched_movements CURSOR FOR
        SELECT ch.id, ch.borc as tutar, ch.tarih, ch.aciklama, ch.odeme_turu, ch.banka_hesap_id, ch.belge_no
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
        WHERE c.proje_id = p_proje_id
          AND c.uye_id = p_uye_id
          AND ch.islem_turu = 'gelen_odeme'
          AND ch.kaynak_tipi IS NULL
        ORDER BY ch.tarih ASC, ch.created_at ASC;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT id INTO v_cari_id FROM public.cari_hesaplar WHERE proje_id = p_proje_id AND uye_id = p_uye_id;
    IF v_cari_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cari hesap bulunamadı');
    END IF;

    FOR v_payment IN v_unmatched_movements LOOP
        v_total_unmatched_payment := v_payment.tutar;

        WHILE v_total_unmatched_payment > 0 LOOP
            SELECT
                a.id,
                GREATEST(
                    COALESCE(ct.total_accrued, 0),
                    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) + COALESCE(a.gecikme_faizi, 0)
                ) as toplam_borc,
                COALESCE(ct.total_paid, 0) as odenen_tutar
            INTO v_aidat
            FROM public.aidatlar a
            JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
            JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
            LEFT JOIN (
                SELECT kaynak_id, SUM(alacak) as total_accrued, SUM(borc) as total_paid
                FROM public.cari_hareketler
                WHERE kaynak_tipi IN ('aidat', 'gecikme_faizi')
                GROUP BY kaynak_id
            ) ct ON ct.kaynak_id = a.id
            WHERE a.proje_id = p_proje_id
              AND a.uye_id = p_uye_id
              AND a.durum IN ('bekliyor', 'gecikti')
            ORDER BY a.son_odeme_tarihi ASC, a.created_at ASC
            LIMIT 1;

            IF v_aidat IS NULL THEN
                EXIT;
            END IF;

            v_match_amount := LEAST(v_total_unmatched_payment, (v_aidat.toplam_borc - v_aidat.odenen_tutar));

            IF v_match_amount <= 0.009 THEN
                EXIT;
            END IF;

            IF ABS(v_total_unmatched_payment - v_match_amount) < 0.009 THEN
                UPDATE public.cari_hareketler
                SET kaynak_tipi = 'aidat', kaynak_id = v_aidat.id
                WHERE id = v_payment.id;

                v_total_unmatched_payment := 0;
            ELSE
                UPDATE public.cari_hareketler
                SET borc = v_match_amount, kaynak_tipi = 'aidat', kaynak_id = v_aidat.id
                WHERE id = v_payment.id;

                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, odeme_turu, tarih, borc, alacak, aciklama, belge_no, banka_hesap_id
                ) VALUES (
                    p_proje_id, v_cari_id, 'gelen_odeme', v_payment.odeme_turu, v_payment.tarih,
                    (v_total_unmatched_payment - v_match_amount), 0, v_payment.aciklama, v_payment.belge_no, v_payment.banka_hesap_id
                ) RETURNING id INTO v_payment.id;

                v_total_unmatched_payment := (v_total_unmatched_payment - v_match_amount);
            END IF;

            v_matched_count := v_matched_count + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'FIFO eşleştirme tamamlandı',
        'matched_count', v_matched_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_match_member_payments_fifo IS
  'Uye bazli FIFO odeme eslestirme. p_actor_id verilirse app.actor_id set edilir.';

-- =====================================================================
-- 11. fn_match_project_payments_fifo
-- Onceki imza: fn_match_project_payments_fifo(UUID) -- 20260428000001
-- NOT: Bu RPC fn_match_member_payments_fifo'yu cagiriyor; o RPC zaten p_actor_id alir.
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_match_project_payments_fifo(UUID);
CREATE OR REPLACE FUNCTION public.fn_match_project_payments_fifo(
  p_proje_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_uye RECORD;
    v_firma RECORD;
    v_total_matched INTEGER := 0;
    v_res JSONB;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    -- 1. Match for all members (p_actor_id'yi alt RPC'ye geciyoruz)
    FOR v_uye IN SELECT id FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif' LOOP
        v_res := public.fn_match_member_payments_fifo(p_proje_id, v_uye.id, p_actor_id);
        v_total_matched := v_total_matched + COALESCE((v_res->>'matched_count')::INTEGER, 0);
    END LOOP;

    -- 2. Match for all firms (fn_match_firm_payments_fifo henuz p_actor_id almiyor — bir sonraki sprint)
    FOR v_firma IN SELECT DISTINCT firma_id FROM public.cari_hesaplar WHERE proje_id = p_proje_id AND cari_turu = 'firma' AND firma_id IS NOT NULL LOOP
        v_res := public.fn_match_firm_payments_fifo(p_proje_id, v_firma.firma_id);
        v_total_matched := v_total_matched + COALESCE((v_res->>'matched_count')::INTEGER, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Proje bazlı FIFO eşleştirme tamamlandı',
        'total_matched_count', v_total_matched
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_match_project_payments_fifo IS
  'Proje bazli FIFO eslestirme (uye + firma). p_actor_id verilirse app.actor_id set edilir + alt member RPC''ye iletilir.';

-- =====================================================================
-- 12. fn_undo_payment_match
-- Onceki imza: fn_undo_payment_match(UUID) -- 20260427000006
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_undo_payment_match(UUID);
CREATE OR REPLACE FUNCTION public.fn_undo_payment_match(
  p_movement_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_kaynak_tipi TEXT;
    v_kaynak_id UUID;
    v_aidat_status public.aidat_durumu;
    v_son_odeme_tarihi DATE;
    v_total_paid NUMERIC(14,2);
    v_total_due NUMERIC(14,2);
    v_is_matched BOOLEAN;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    SELECT kaynak_tipi, kaynak_id, (kaynak_id IS NOT NULL)
    INTO v_kaynak_tipi, v_kaynak_id, v_is_matched
    FROM public.cari_hareketler
    WHERE id = p_movement_id;

    IF NOT v_is_matched THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu hareket zaten bir eşleşmeye sahip değil.');
    END IF;

    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL, kaynak_id = NULL
    WHERE id = p_movement_id;

    IF v_kaynak_tipi = 'aidat' THEN
        SELECT
            toplam_tahakkuk,
            son_odeme_tarihi,
            toplam_odenen
        INTO v_total_due, v_son_odeme_tarihi, v_total_paid
        FROM public.aidat_detaylari
        WHERE id = v_kaynak_id;

        IF v_total_paid < v_total_due THEN
            v_aidat_status := CASE
                WHEN v_son_odeme_tarihi < CURRENT_DATE THEN 'gecikti'::public.aidat_durumu
                ELSE 'bekliyor'::public.aidat_durumu
            END;

            UPDATE public.aidatlar
            SET durum = v_aidat_status
            WHERE id = v_kaynak_id;
        END IF;

    ELSIF v_kaynak_tipi = 'hakedis' THEN
        UPDATE public.hakedisler
        SET durum = 'onaylandi'
        WHERE id = v_kaynak_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Eşleşme başarıyla kaldırıldı',
        'kaynak_tipi', v_kaynak_tipi,
        'kaynak_id', v_kaynak_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_undo_payment_match IS
  'Eslesme geri al + ilgili aidat/hakedis durum revert. p_actor_id verilirse app.actor_id set edilir.';

-- =====================================================================
-- 13. fn_undo_hakedis_closure
-- Onceki imza: fn_undo_hakedis_closure(UUID) -- 20260427000005
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_undo_hakedis_closure(UUID);
CREATE OR REPLACE FUNCTION public.fn_undo_hakedis_closure(
  p_hakedis_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER;
BEGIN
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL, kaynak_id = NULL
    WHERE kaynak_tipi = 'hakedis'
      AND kaynak_id = p_hakedis_id
      AND islem_turu != 'hakedis';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.hakedisler
    SET durum = 'onaylandi'
    WHERE id = p_hakedis_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Hakediş eşleşmeleri başarıyla kaldırıldı.',
        'freed_payments_count', v_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_undo_hakedis_closure IS
  'Hakedis closure undo (tum eslemeleri serbest birak). p_actor_id verilirse app.actor_id set edilir.';

COMMIT;
