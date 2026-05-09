-- Migration: 20260428000001_performance_optimizations.sql
-- Description: Move heavy calculations to DB level and optimize FIFO.

BEGIN;

-- 1. Firm FIFO Matching RPC
CREATE OR REPLACE FUNCTION public.fn_match_firm_payments_fifo(p_proje_id UUID, p_firma_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_total_unmatched_payment NUMERIC(14,2) := 0;
    v_hakedis RECORD;
    v_payment RECORD;
    v_match_amount NUMERIC(14,2);
    v_matched_count INTEGER := 0;
    v_cari_id UUID;
    v_unmatched_movements CURSOR FOR 
        SELECT ch.id, ch.alacak as tutar, ch.tarih, ch.aciklama, ch.odeme_turu, ch.banka_hesap_id, ch.belge_no
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
        WHERE c.proje_id = p_proje_id 
          AND c.firma_id = p_firma_id 
          AND ch.islem_turu = 'giden_odeme' 
          AND ch.kaynak_tipi IS NULL
        ORDER BY ch.tarih ASC, ch.created_at ASC;
BEGIN
    -- 1. Get Cari ID
    SELECT id INTO v_cari_id FROM public.cari_hesaplar WHERE proje_id = p_proje_id AND firma_id = p_firma_id;
    IF v_cari_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cari hesap bulunamadı');
    END IF;

    -- 2. Process each unmatched payment movement
    FOR v_payment IN v_unmatched_movements LOOP
        v_total_unmatched_payment := v_payment.tutar;
        
        WHILE v_total_unmatched_payment > 0 LOOP
            -- Find the oldest unpaid hakedis
            SELECT 
                h.id, 
                h.hakedis_toplam,
                COALESCE((SELECT SUM(alacak) FROM public.cari_hareketler WHERE kaynak_tipi = 'hakedis' AND kaynak_id = h.id), 0) as odenen_tutar
            INTO v_hakedis
            FROM public.hakedisler h
            JOIN public.sozlesmeler s ON h.sozlesme_id = s.id
            WHERE h.proje_id = p_proje_id 
              AND s.firma_id = p_firma_id 
              AND h.durum IN ('onaylandi')
            ORDER BY h.created_at ASC
            LIMIT 1;

            IF v_hakedis IS NULL THEN
                EXIT; 
            END IF;

            v_match_amount := LEAST(v_total_unmatched_payment, (v_hakedis.hakedis_toplam - v_hakedis.odenen_tutar));
            
            IF v_match_amount <= 0 THEN
                EXIT;
            END IF;

            IF v_total_unmatched_payment = v_match_amount THEN
                UPDATE public.cari_hareketler 
                SET kaynak_tipi = 'hakedis', kaynak_id = v_hakedis.id 
                WHERE id = v_payment.id;
                v_total_unmatched_payment := 0;
            ELSE
                UPDATE public.cari_hareketler 
                SET alacak = v_match_amount, kaynak_tipi = 'hakedis', kaynak_id = v_hakedis.id 
                WHERE id = v_payment.id;

                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, odeme_turu, tarih, borc, alacak, aciklama, belge_no, banka_hesap_id
                ) VALUES (
                    p_proje_id, v_cari_id, 'giden_odeme', v_payment.odeme_turu, v_payment.tarih, 
                    0, (v_total_unmatched_payment - v_match_amount), v_payment.aciklama, v_payment.belge_no, v_payment.banka_hesap_id
                ) RETURNING id INTO v_payment.id;

                v_total_unmatched_payment := (v_total_unmatched_payment - v_match_amount);
            END IF;

            IF (v_hakedis.odenen_tutar + v_match_amount) >= v_hakedis.hakedis_toplam THEN
                UPDATE public.hakedisler SET durum = 'odendi' WHERE id = v_hakedis.id;
            END IF;

            v_matched_count := v_matched_count + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'FIFO eşleştirme tamamlandı', 'matched_count', v_matched_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Dashboard Ozet RPC
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
    v_proje_suresi_ay INTEGER;
    v_proje_suresi_gun INTEGER;
BEGIN
    -- Proje Başlangıç
    SELECT baslangic_tarihi INTO v_proje_baslangic FROM public.projeler WHERE id = p_proje_id;
    
    -- Cari Hareketlerden Toplamlar (Tek bir sorguda optimize edildi)
    SELECT 
        COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu = 'aidat_kayit' THEN ch.alacak ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu = 'gelen_odeme' THEN ch.borc ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' AND ch.islem_turu IN ('giden_odeme', 'odeme') THEN ch.alacak ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.borc ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.alacak ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.alacak ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.borc ELSE 0 END), 0)
    INTO 
        v_toplam_gelir, v_toplam_tahsilat, v_toplam_odeme, v_kasa_borc, v_kasa_alacak, v_firma_toplam_alacak, v_firma_toplam_borc
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id;

    -- Bekleyen Alacak/Borç (Üye/Firma Bazlı Bakiye)
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

    -- Hakedişler
    SELECT 
        COALESCE(SUM(hakedis_toplam), 0),
        COALESCE(SUM(teminat_kesintisi), 0)
    INTO v_hakedis_toplam_gider, v_birikmis_teminat
    FROM public.hakedisler
    WHERE proje_id = p_proje_id AND durum IN ('onaylandi', 'odendi');

    -- Faturalar
    SELECT COALESCE(SUM(toplam_tutar), 0) INTO v_toplam_fatura
    FROM public.faturalar
    WHERE proje_id = p_proje_id AND fatura_tipi = 'gelen';

    -- Çekler
    SELECT COALESCE(SUM(tutar), 0) INTO v_cek_toplami
    FROM public.cekler
    WHERE proje_id = p_proje_id AND durum = 'beklemede';

    -- Gecikme Faiz Tahsilatı
    SELECT COALESCE(SUM(gecikme_faizi), 0) INTO v_gecikme_faiz_tahsilati
    FROM public.aidatlar
    WHERE proje_id = p_proje_id AND durum = 'odendi' AND faiz_yansitildi = TRUE;

    -- Banka Bakiyeleri
    SELECT COALESCE(SUM(CASE WHEN islem_tipi = 'gelir' THEN tutar ELSE -tutar END), 0) INTO v_banka_toplami
    FROM public.banka_hareketleri
    WHERE proje_id = p_proje_id;

    -- Üye ve Daire Sayıları
    SELECT COUNT(*) INTO v_aktif_uye_sayisi FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif';
    SELECT COALESCE(SUM(toplam_daire), 0) INTO v_toplam_daire_sayisi FROM public.bloklar WHERE proje_id = p_proje_id;

    -- Proje Süresi
    IF v_proje_baslangic IS NOT NULL THEN
        v_proje_suresi_ay := (EXTRACT(YEAR FROM age(CURRENT_DATE, v_proje_baslangic)) * 12 + EXTRACT(MONTH FROM age(CURRENT_DATE, v_proje_baslangic)));
        v_proje_suresi_gun := EXTRACT(DAY FROM age(CURRENT_DATE, v_proje_baslangic));
    ELSE
        v_proje_suresi_ay := 0;
        v_proje_suresi_gun := 0;
    END IF;

    v_result := jsonb_build_object(
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
        'gecikme_faiz_tahsilati', v_gecikme_faiz_tahsilati,
        'banka_toplami', v_banka_toplami,
        'proje_suresi', jsonb_build_object('ay', v_proje_suresi_ay, 'gun', v_proje_suresi_gun),
        'odeme_sonrasi_nakit', v_banka_toplami + (v_kasa_borc - v_kasa_alacak) + 
                             CASE WHEN (v_firma_toplam_alacak - v_firma_toplam_borc) < 0 THEN (v_firma_toplam_alacak - v_firma_toplam_borc) ELSE 0 END - 
                             v_cek_toplami - v_birikmis_teminat
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Yillik Rapor RPC
CREATE OR REPLACE FUNCTION public.fn_yillik_rapor_ozet(p_proje_id UUID, p_yil INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_aylik_veriler JSONB;
BEGIN
    WITH aylar AS (
        SELECT generate_series(1, 12) as ay
    ),
    hareketler AS (
        SELECT 
            EXTRACT(MONTH FROM tarih) as ay,
            islem_turu,
            alacak,
            borc
        FROM public.cari_hareketler
        WHERE proje_id = p_proje_id AND EXTRACT(YEAR FROM tarih) = p_yil
    ),
    aylik_ozet AS (
        SELECT 
            a.ay,
            COALESCE(SUM(CASE WHEN h.islem_turu = 'aidat_kayit' THEN h.alacak ELSE 0 END), 0) as gelir,
            COALESCE(SUM(CASE WHEN h.islem_turu IN ('hakedis', 'fatura') THEN h.borc ELSE 0 END), 0) as gider,
            COALESCE(SUM(CASE WHEN h.islem_turu = 'gelen_odeme' THEN h.borc ELSE 0 END), 0) as tahsilat,
            COALESCE(SUM(CASE WHEN h.islem_turu = 'giden_odeme' THEN h.alacak ELSE 0 END), 0) as odeme
        FROM aylar a
        LEFT JOIN hareketler h ON a.ay = h.ay
        GROUP BY a.ay
        ORDER BY a.ay
    )
    SELECT jsonb_agg(jsonb_build_object(
        'ay', ay,
        'gelir', gelir,
        'gider', gider,
        'tahsilat', tahsilat,
        'odeme', odeme
    )) INTO v_aylik_veriler
    FROM aylik_ozet;

    RETURN jsonb_build_object(
        'yil', p_yil,
        'aylik', v_aylik_veriler,
        'toplam_gelir', COALESCE((SELECT SUM((v->>'gelir')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        'toplam_gider', COALESCE((SELECT SUM((v->>'gider')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        'toplam_tahsilat', COALESCE((SELECT SUM((v->>'tahsilat')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        'toplam_odeme', COALESCE((SELECT SUM((v->>'odeme')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Project-wide FIFO Matching RPC
CREATE OR REPLACE FUNCTION public.fn_match_project_payments_fifo(p_proje_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_uye RECORD;
    v_firma RECORD;
    v_total_matched INTEGER := 0;
    v_res JSONB;
BEGIN
    -- 1. Match for all members
    FOR v_uye IN SELECT id FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif' LOOP
        v_res := public.fn_match_member_payments_fifo(p_proje_id, v_uye.id);
        v_total_matched := v_total_matched + COALESCE((v_res->>'matched_count')::INTEGER, 0);
    END LOOP;

    -- 2. Match for all firms
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

COMMIT;
