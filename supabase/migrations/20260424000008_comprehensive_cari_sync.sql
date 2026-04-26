-- Migration: 20260424000008_comprehensive_cari_sync.sql
-- Description: Sync unit assignments, aidat charging and interest calculations with cari_hareketler.

BEGIN;

-- 1. Sync Aidatlar on Unit Assignment (Enhanced)
-- When a unit is assigned to a member, existing dues are recorded in cari_hareketler.
CREATE OR REPLACE FUNCTION public.fn_sync_aidatlar_on_unit_assignment()
RETURNS TRIGGER AS $$
DECLARE
    v_total_amount NUMERIC(12,2);
    v_cari_id UUID;
    v_record RECORD;
BEGIN
    -- Eğer daireye yeni bir üye atandıysa
    IF (NEW.uye_id IS NOT NULL AND (OLD.uye_id IS NULL OR OLD.uye_id != NEW.uye_id)) THEN
        
        -- Cari hesabı bul
        SELECT id INTO v_cari_id FROM public.cari_hesaplar 
        WHERE proje_id = NEW.proje_id AND uye_id = NEW.uye_id;

        -- Cari hesap yoksa oluştur (güvenlik için)
        IF v_cari_id IS NULL THEN
            INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, uye_id)
            SELECT NEW.proje_id, u.ad || ' ' || u.soyad, 'uye', u.id
            FROM public.uyeler u WHERE u.id = NEW.uye_id
            RETURNING id INTO v_cari_id;
        END IF;

        -- Sahipsiz aidatları bul ve tutarlarını topla
        -- Her birini tek tek cari harekete de ekleyebiliriz veya toplu ekleyebiliriz.
        -- Kullanıcı "toplamı kaydedilecek" dediği için toplu ekliyoruz.
        
        SELECT SUM(at.katsayi_tutari * COALESCE(NEW.serefiye_orani, 1.00) + COALESCE(a.gecikme_faizi, 0))
        INTO v_total_amount
        FROM public.aidatlar a
        JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
        WHERE a.serefiye_id = NEW.id AND a.uye_id IS NULL;

        IF v_total_amount > 0 THEN
            INSERT INTO public.cari_hareketler (
                proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, aciklama
            ) VALUES (
                NEW.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_total_amount, 0, 'Üyelik başlangıç borç aktarımı (' || NEW.daire_no || ')'
            );
        END IF;

        -- Aidat kayıtlarını yeni üyeye bağla
        UPDATE public.aidatlar
        SET uye_id = NEW.uye_id,
            updated_at = NOW()
        WHERE serefiye_id = NEW.id 
          AND uye_id IS NULL;
          
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Enhanced Aidat Charging (Manual/Single Definition)
-- Records each generated aidat in cari_hareketler.
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

-- 3. Enhanced Global Interest Calculation
-- Now records interest DIFFERENCES in cari_hareketler.
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

COMMIT;
