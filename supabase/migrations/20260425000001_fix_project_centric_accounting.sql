-- Migration: 20260425000001_fix_project_centric_accounting.sql
-- Description: Standardize Cari Hareket logic to 'Project Perspective'.
-- Project Perspective: 
--   ALACAK (Credit): Money the project is entitled to (Receivables) or payment sent by project (Debt reduction).
--   BORC (Debit): Money the project owes (Payables) or money received by project (Receivable reduction).
-- Bakiye = SUM(alacak) - SUM(borc)

BEGIN;

-- 1. Update cari_hareketler constraints and comments
ALTER TABLE public.cari_hareketler DROP CONSTRAINT IF EXISTS cari_hareketler_islem_turu_check;
ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check 
CHECK (islem_turu IN ('aidat_kayit', 'hakedis', 'fatura', 'gelen_odeme', 'giden_odeme'));

COMMENT ON COLUMN public.cari_hareketler.alacak IS 'Proje Perspektifi: Projenin alacağı (Aidat/Faiz tahakkuku) veya borç ödemesi (Giden ödeme). (+) Bakiye';
COMMENT ON COLUMN public.cari_hareketler.borc IS 'Proje Perspektifi: Projenin borcu (Hakediş/Fatura) veya alacak tahsilatı (Gelen ödeme). (-) Bakiye';

-- 2. Fix existing data to follow the standard
-- islem_turu = 'aidat_kayit' (Tahakkuk) -> alacak = tutar, borc = 0
UPDATE public.cari_hareketler 
SET alacak = alacak + borc, borc = 0 
WHERE islem_turu = 'aidat_kayit' AND borc > 0;

-- islem_turu = 'gelen_odeme' (Tahsilat) -> borc = tutar, alacak = 0
UPDATE public.cari_hareketler 
SET borc = borc + alacak, alacak = 0 
WHERE islem_turu = 'gelen_odeme' AND alacak > 0;

-- islem_turu = 'hakedis' / 'fatura' (Firma Tahakkuku) -> borc = tutar, alacak = 0
UPDATE public.cari_hareketler 
SET borc = borc + alacak, alacak = 0 
WHERE islem_turu IN ('hakedis', 'fatura') AND alacak > 0;

-- islem_turu = 'giden_odeme' (Firmaya Ödeme) -> alacak = tutar, borc = 0
UPDATE public.cari_hareketler 
SET alacak = alacak + borc, borc = 0 
WHERE islem_turu = 'giden_odeme' AND borc > 0;

-- 3. Standardize Functions

-- fn_charge_aidat_tanimi: Ensure it uses ALACAK for accrual
CREATE OR REPLACE FUNCTION public.fn_charge_aidat_tanimi(p_tanim_id UUID)
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
    -- Tanımı getir
    SELECT * INTO v_record FROM public.aidat_tanimlari WHERE id = p_tanim_id;
    
    IF v_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat tanımı bulunamadı.');
    END IF;
    
    IF v_record.durum = 'borclandi' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu tanım zaten borçlandırılmış.');
    END IF;

    -- Son ödeme tarihini oluştur
    v_son_odeme_tarihi := (v_record.yil::TEXT || '-' || v_record.ay::TEXT || '-' || v_record.son_odeme_gunu::TEXT)::DATE;

    -- Her daire (serefiye) için aidat borcu oluştur
    FOR v_daire IN 
        SELECT id, serefiye_orani, proje_id FROM public.serefiye_tablosu 
        WHERE proje_id = v_record.proje_id
    LOOP
        -- Aktif üyeyi bul
        SELECT id INTO v_uye_id FROM public.uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1;
        
        -- Aidat kaydı oluştur
        INSERT INTO public.aidatlar (
            proje_id, serefiye_id, uye_id, aidat_tanimi_id, son_odeme_tarihi
        ) VALUES (
            v_record.proje_id, v_daire.id, v_uye_id, v_record.id, v_son_odeme_tarihi
        )
        ON CONFLICT (serefiye_id, aidat_tanimi_id) DO NOTHING;
        
        -- Eğer üye varsa Cari Hareket oluştur
        IF v_uye_id IS NOT NULL THEN
            -- Tutar hesapla
            v_tutar := v_record.katsayi_tutari * COALESCE(v_daire.serefiye_orani, 1.00);
            
            -- Cari hesabı bul
            SELECT id INTO v_cari_id FROM public.cari_hesaplar 
            WHERE proje_id = v_record.proje_id AND uye_id = v_uye_id;
            
            IF v_cari_id IS NOT NULL THEN
                -- ALACAK: Projenin alacağı (Project Perspective)
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

    -- Durumu güncelle
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

-- hesapla_gecikme_faizi: Ensure it uses ALACAK for interest
CREATE OR REPLACE FUNCTION public.hesapla_gecikme_faizi(
  p_proje_id UUID DEFAULT NULL,
  p_uye_id UUID DEFAULT NULL,
  p_baslangic_tarihi DATE DEFAULT NULL,
  p_bitis_tarihi DATE DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_record RECORD;
    v_gun_sayisi INTEGER;
    v_baz_tutar NUMERIC;
    v_faiz_orani NUMERIC;
    v_yeni_faiz NUMERIC;
    v_faiz_farki NUMERIC;
    v_cari_id UUID;
BEGIN
    FOR v_record IN 
        SELECT 
            a.id, a.proje_id, a.uye_id, a.son_odeme_tarihi, a.gecikme_faizi,
            at.yil, at.ay, at.katsayi_tutari, at.gecikme_faiz_orani,
            s.serefiye_orani
        FROM public.aidatlar a
        JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
        JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
        WHERE a.durum IN ('bekliyor', 'gecikti')
          AND a.son_odeme_tarihi < CURRENT_DATE
          AND (p_proje_id IS NULL OR a.proje_id = p_proje_id)
          AND (p_uye_id IS NULL OR a.uye_id = p_uye_id)
          AND (p_baslangic_tarihi IS NULL OR a.son_odeme_tarihi >= p_baslangic_tarihi)
          AND (p_bitis_tarihi IS NULL OR a.son_odeme_tarihi <= p_bitis_tarihi)
          AND a.gecikme_faizi_muaf = FALSE
    LOOP
        v_gun_sayisi := CURRENT_DATE - v_record.son_odeme_tarihi;
        v_baz_tutar := v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00);
        v_faiz_orani := COALESCE(v_record.gecikme_faiz_orani, 0) / 100.0;

        IF v_gun_sayisi < 5 THEN
            v_yeni_faiz := 0;
        ELSE
            v_yeni_faiz := (v_baz_tutar * POWER((1.0 + v_faiz_orani), (v_gun_sayisi / 30.0))) - v_baz_tutar;
        END IF;

        v_yeni_faiz := ROUND(v_yeni_faiz, 2);
        v_faiz_farki := v_yeni_faiz - COALESCE(v_record.gecikme_faizi, 0);

        IF v_faiz_farki > 0 THEN
            -- Aidatı güncelle
            UPDATE public.aidatlar 
            SET gecikme_faizi = v_yeni_faiz, durum = 'gecikti', updated_at = now()
            WHERE id = v_record.id;

            -- Üye atanmışsa Cari Hareket oluştur
            IF v_record.uye_id IS NOT NULL THEN
                SELECT id INTO v_cari_id FROM public.cari_hesaplar 
                WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

                IF v_cari_id IS NOT NULL THEN
                    -- ALACAK: Projenin alacağı (Project Perspective)
                    INSERT INTO public.cari_hareketler (
                        proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                    ) VALUES (
                        v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_faiz_farki, 0, 'aidat', v_record.id, 
                        v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create Mizan RPC
CREATE OR REPLACE FUNCTION public.get_cari_mizan(p_proje_id UUID DEFAULT NULL)
RETURNS TABLE (
    cari_hesap_id UUID,
    cari_adi VARCHAR,
    cari_turu VARCHAR,
    toplam_alacak NUMERIC,
    toplam_borc NUMERIC,
    bakiye NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ch.id,
        ch.cari_adi::VARCHAR,
        ch.cari_turu::VARCHAR,
        COALESCE(SUM(ca.alacak), 0) as toplam_alacak,
        COALESCE(SUM(ca.borc), 0) as toplam_borc,
        COALESCE(SUM(ca.alacak), 0) - COALESCE(SUM(ca.borc), 0) as bakiye
    FROM public.cari_hesaplar ch
    LEFT JOIN public.cari_hareketler ca ON ch.id = ca.cari_hesap_id
    WHERE (p_proje_id IS NULL OR ch.proje_id = p_proje_id)
    GROUP BY ch.id, ch.cari_adi, ch.cari_turu;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Standardize single aidat calculation too
CREATE OR REPLACE FUNCTION public.fn_calculate_single_aidat_late_fee(
    p_aidat_id UUID
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
    -- 1. Aidat bilgilerini al
    SELECT
        a.id,
        a.proje_id,
        a.uye_id,
        a.son_odeme_tarihi,
        a.gecikme_faizi,
        a.gecikme_faizi_muaf,
        at.katsayi_tutari,
        at.gecikme_faiz_orani,
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

    -- 2. Gecikme hesapla
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

    -- 3. Aidatı güncelle
    UPDATE public.aidatlar
    SET 
        gecikme_faizi = v_yeni_faiz,
        durum = 'gecikti'::aidat_durumu,
        updated_at = now()
    WHERE id = p_aidat_id;

    -- 4. Cari hesabı bul
    SELECT id INTO v_cari_id
    FROM public.cari_hesaplar
    WHERE proje_id = v_record.proje_id AND uye_id = v_record.uye_id;

    IF v_cari_id IS NOT NULL THEN
        -- ALACAK: Projenin alacağı (Project Perspective)
        INSERT INTO public.cari_hareketler (
            proje_id,
            cari_hesap_id,
            islem_turu,
            tarih,
            alacak,
            borc,
            kaynak_tipi,
            kaynak_id,
            aciklama
        ) VALUES (
            v_record.proje_id,
            v_cari_id,
            'aidat_kayit',
            CURRENT_DATE,
            v_faiz_farki,
            0,
            'aidat',
            p_aidat_id,
            'Gecikme Faizi Tahakkuku (' || v_gun_sayisi || ' gün)'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Faiz hesaplandı ve cari hesaba yansıtıldı', 
        'yeni_faiz', v_yeni_faiz,
        'faiz_farki', v_faiz_farki,
        'gecikme_gun', v_gun_sayisi
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
