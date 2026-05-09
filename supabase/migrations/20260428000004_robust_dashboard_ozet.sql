-- Migration: 20260428000002_robust_dashboard_ozet.sql
-- Description: Dashboard özet fonksiyonunu yeni işlem türlerini (fatura, gecikme_faizi) kapsayacak şekilde güncelle ve dayanıklılığını artır.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_dashboard_ozet(UUID);
CREATE OR REPLACE FUNCTION public.fn_dashboard_ozet(p_proje_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_proje_baslangic DATE;
    v_toplam_gelir NUMERIC := 0;
    v_toplam_tahsilat NUMERIC := 0;
    v_toplam_odeme NUMERIC := 0;
    v_kasa_borc NUMERIC := 0;
    v_kasa_alacak NUMERIC := 0;
    v_firma_toplam_alacak NUMERIC := 0;
    v_firma_toplam_borc NUMERIC := 0;
    v_bekleyen_alacak NUMERIC := 0;
    v_bekleyen_borc NUMERIC := 0;
    v_toplam_fatura NUMERIC := 0;
    v_cek_toplami NUMERIC := 0;
    v_gecikme_faiz_tahsilati NUMERIC := 0;
    v_banka_toplami NUMERIC := 0;
    v_birikmis_teminat NUMERIC := 0;
    v_hakedis_toplam_gider NUMERIC := 0;
    v_aktif_uye_sayisi INTEGER := 0;
    v_toplam_daire_sayisi INTEGER := 0;
    v_proje_suresi_ay INTEGER := 0;
    v_proje_suresi_gun INTEGER := 0;
BEGIN
    -- 1. Proje Kontrolü
    SELECT baslangic_tarihi INTO v_proje_baslangic FROM public.projeler WHERE id = p_proje_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Proje bulunamadı', 'success', false);
    END IF;

    -- 2. Cari Hareketlerden Toplamlar (Yeni işlem türleri eklendi)
    SELECT 
        -- Gelir: Üye Aidat Tahakkukları + Gecikme Faizleri (Alacak Kolonu)
        COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN ch.alacak ELSE 0 END), 0),
        -- Tahsilat: Üyeden Gelen Ödemeler (Borç Kolonu - Projenin borçlanması/paranın girmesi)
        COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu = 'gelen_odeme' THEN ch.borc ELSE 0 END), 0),
        -- Ödeme: Firmaya Giden Ödemeler (Alacak Kolonu)
        COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer') THEN ch.alacak ELSE 0 END), 0),
        -- Kasa (Nakit)
        COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.borc ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.alacak ELSE 0 END), 0),
        -- Firma Toplam Bakiye İçin
        COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.alacak ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.borc ELSE 0 END), 0)
    INTO 
        v_toplam_gelir, v_toplam_tahsilat, v_toplam_odeme, v_kasa_borc, v_kasa_alacak, v_firma_toplam_alacak, v_firma_toplam_borc
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id;

    -- 3. Bekleyen Alacak/Borç (Üye/Firma Bazlı Bakiye)
    WITH balances AS (
        SELECT 
            c.cari_turu,
            SUM(ch.alacak) - SUM(ch.borc) as bakiye
        FROM public.cari_hesaplar c
        LEFT JOIN public.cari_hareketler ch ON c.id = ch.cari_hesap_id
        WHERE c.proje_id = p_proje_id
        GROUP BY c.id, c.cari_turu
    )
    SELECT 
        COALESCE(SUM(CASE WHEN cari_turu = 'uye' AND bakiye > 0 THEN bakiye ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN cari_turu = 'firma' AND bakiye < 0 THEN ABS(bakiye) ELSE 0 END), 0)
    INTO v_bekleyen_alacak, v_bekleyen_borc
    FROM balances;

    -- 4. Hakedişler
    SELECT 
        COALESCE(SUM(hakedis_toplam), 0),
        COALESCE(SUM(teminat_kesintisi), 0)
    INTO v_hakedis_toplam_gider, v_birikmis_teminat
    FROM public.hakedisler
    WHERE proje_id = p_proje_id AND durum IN ('onaylandi', 'odendi');

    -- 5. Faturalar
    SELECT COALESCE(SUM(toplam_tutar), 0) INTO v_toplam_fatura
    FROM public.faturalar
    WHERE proje_id = p_proje_id AND fatura_tipi = 'gelen';

    -- 6. Çekler
    SELECT COALESCE(SUM(tutar), 0) INTO v_cek_toplami
    FROM public.cekler
    WHERE proje_id = p_proje_id AND durum = 'beklemede';

    -- 7. Banka Bakiyeleri
    SELECT COALESCE(SUM(CASE WHEN islem_tipi = 'gelir' THEN tutar ELSE -tutar END), 0) INTO v_banka_toplami
    FROM public.banka_hareketleri
    WHERE proje_id = p_proje_id;

    -- 8. Üye ve Daire Sayıları
    SELECT COUNT(*) INTO v_aktif_uye_sayisi FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif';
    SELECT COALESCE(SUM(toplam_daire), 0) INTO v_toplam_daire_sayisi FROM public.bloklar WHERE proje_id = p_proje_id;

    -- 9. Proje Süresi
    IF v_proje_baslangic IS NOT NULL THEN
        v_proje_suresi_ay := (EXTRACT(YEAR FROM age(CURRENT_DATE, v_proje_baslangic)) * 12 + EXTRACT(MONTH FROM age(CURRENT_DATE, v_proje_baslangic)));
        v_proje_suresi_gun := EXTRACT(DAY FROM age(CURRENT_DATE, v_proje_baslangic));
    END IF;

    -- 10. Sonuç Hazırlama
    v_result := jsonb_build_object(
        'success', true,
        'toplam_gelir', v_toplam_gelir,
        'toplam_gider', v_hakedis_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme,
        'toplam_fatura', v_toplam_fatura,
        'fatura_farki', v_toplam_fatura - v_hakedis_toplam_gider,
        'kasa_banka', v_banka_toplami,
        'kasa_nakit', v_kasa_borc - v_kasa_alacak,
        'kasa_borc', v_kasa_borc,
        'kasa_alacak', v_kasa_alacak,
        'bekleyen_alacak', v_bekleyen_alacak,
        'bekleyen_borc', v_bekleyen_borc,
        'aktif_uye_sayisi', v_aktif_uye_sayisi,
        'toplam_daire_sayisi', v_toplam_daire_sayisi,
        'cari_bakiye', v_firma_toplam_alacak - v_firma_toplam_borc,
        'cek_toplami', v_cek_toplami,
        'birikmis_teminat', v_birikmis_teminat,
        'banka_toplami', v_banka_toplami,
        'proje_suresi', jsonb_build_object('ay', v_proje_suresi_ay, 'gun', v_proje_suresi_gun),
        'odeme_sonrasi_nakit', v_banka_toplami + (v_kasa_borc - v_kasa_alacak) + 
                             CASE WHEN (v_firma_toplam_alacak - v_firma_toplam_borc) < 0 THEN (v_firma_toplam_alacak - v_firma_toplam_borc) ELSE 0 END - 
                             v_cek_toplami - v_birikmis_teminat
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
