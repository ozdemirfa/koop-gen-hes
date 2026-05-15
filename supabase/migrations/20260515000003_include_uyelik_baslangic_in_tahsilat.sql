-- Migration: 20260515000003_include_uyelik_baslangic_in_tahsilat.sql
-- Description:
--   Üyelik başlangıç bedeli tahsilatları (cari_hareketler.islem_turu='uyelik_baslangic'
--   AND borc>0) artık "Toplam Tahsilat" aggregate'larına dahil ediliyor.
--   Önceden sadece islem_turu='gelen_odeme' satırları sayılıyordu; başlangıç bedeli
--   tahsilatları (banka/nakit girişi) Pano ve aylık/yıllık raporda görünmüyordu.
--
-- Etkilenen RPC'ler:
--   1. fn_dashboard_ozet         — Pano "Toplam Tahsilat" kartı
--   2. fn_aylik_rapor_detay      — Aylık Rapor "Toplam Tahsilat" kartı + tahsilatlar listesi
--   3. fn_yillik_rapor_ozet      — Yıllık Rapor "Yıllık Tahsilat" kartı + aylık tahsilat serisi
--
-- Kapsam dışı:
--   * get_aidat_summary_v4 — aidat_detaylari view'inden aidat-spesifik tahsil okuyor;
--     başlangıç bedeli aidat değil, ayrı bir tahakkuk. Aidat Listesi sayfasındaki
--     "Toplam Tahsilat" kartı bu nedenle aidat-spesifik kalıyor.
--
-- İlgili önceki migration: 20260512000007_member_fifo_with_baslangic.sql — FIFO
-- mantığı zaten uyelik_baslangic kaynak ödemelerini kabul ediyor; bu migration
-- raporlama tarafında da aynı yaklaşımı uyguluyor.

BEGIN;

-- =============================================================================
-- 1. fn_dashboard_ozet — Pano "Toplam Tahsilat"
-- =============================================================================
-- Sadece "v_toplam_tahsilat" SELECT satırını güncelliyoruz. Fonksiyonun geri kalanı
-- 20260514000003_teminat_iade_trigger.sql ile aynı kalıyor.
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
    v_banka_toplami NUMERIC := 0;
    v_birikmis_teminat NUMERIC := 0;
    v_hakedis_toplam_gider NUMERIC := 0;
    v_aktif_uye_sayisi INTEGER := 0;
    v_toplam_daire_sayisi INTEGER := 0;
    v_proje_suresi_ay INTEGER := 0;
    v_proje_suresi_gun INTEGER := 0;
BEGIN
    SELECT baslangic_tarihi INTO v_proje_baslangic FROM public.projeler WHERE id = p_proje_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Proje bulunamadı', 'success', false);
    END IF;

    SELECT
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN ch.alacak ELSE 0 END), 0), 2),
        -- DEĞİŞİKLİK: 'uyelik_baslangic' eklendi. Başlangıç bedeli tahsilatları da
        -- üye tahsilatı olarak sayılıyor (FIFO kaynak ödeme mantığı ile tutarlı).
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('gelen_odeme', 'uyelik_baslangic') THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer') THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.borc ELSE 0 END), 0), 2)
    INTO
        v_toplam_gelir, v_toplam_tahsilat, v_toplam_odeme,
        v_kasa_borc, v_kasa_alacak, v_firma_toplam_alacak, v_firma_toplam_borc
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id;

    WITH balances AS (
        SELECT
            c.cari_turu,
            ROUND(SUM(ch.alacak) - SUM(ch.borc), 2) AS bakiye
        FROM public.cari_hesaplar c
        LEFT JOIN public.cari_hareketler ch ON c.id = ch.cari_hesap_id
        WHERE c.proje_id = p_proje_id
        GROUP BY c.id, c.cari_turu
    )
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN cari_turu = 'uye' AND bakiye > 0 THEN bakiye ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN cari_turu = 'firma' AND bakiye < 0 THEN ABS(bakiye) ELSE 0 END), 0), 2)
    INTO v_bekleyen_alacak, v_bekleyen_borc
    FROM balances;

    SELECT
        ROUND(COALESCE(SUM(hakedis_toplam), 0), 2)
    INTO v_hakedis_toplam_gider
    FROM public.hakedisler
    WHERE proje_id = p_proje_id AND durum IN ('onaylandi', 'odendi');

    SELECT ROUND(COALESCE(SUM(birikmis_teminat), 0), 2)
    INTO v_birikmis_teminat
    FROM public.birikmis_teminatlar
    WHERE proje_id = p_proje_id;

    SELECT ROUND(COALESCE(SUM(toplam_tutar), 0), 2) INTO v_toplam_fatura
    FROM public.faturalar
    WHERE proje_id = p_proje_id AND fatura_tipi = 'gelen';

    SELECT ROUND(COALESCE(SUM(tutar), 0), 2) INTO v_cek_toplami
    FROM public.cekler
    WHERE proje_id = p_proje_id AND durum = 'beklemede';

    SELECT ROUND(COALESCE(SUM(CASE WHEN islem_tipi = 'gelir' THEN tutar ELSE -tutar END), 0), 2) INTO v_banka_toplami
    FROM public.banka_hareketleri
    WHERE proje_id = p_proje_id;

    SELECT COUNT(*) INTO v_aktif_uye_sayisi FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif';
    SELECT COALESCE(SUM(toplam_daire), 0) INTO v_toplam_daire_sayisi FROM public.bloklar WHERE proje_id = p_proje_id;

    IF v_proje_baslangic IS NOT NULL THEN
        v_proje_suresi_ay := (EXTRACT(YEAR FROM age(CURRENT_DATE, v_proje_baslangic)) * 12 + EXTRACT(MONTH FROM age(CURRENT_DATE, v_proje_baslangic)));
        v_proje_suresi_gun := EXTRACT(DAY FROM age(CURRENT_DATE, v_proje_baslangic));
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'toplam_gelir', v_toplam_gelir,
        'toplam_gider', v_hakedis_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme,
        'toplam_fatura', v_toplam_fatura,
        'fatura_farki', ROUND(v_toplam_fatura - v_hakedis_toplam_gider, 2),
        'kasa_banka', v_banka_toplami,
        'kasa_nakit', ROUND(v_kasa_borc - v_kasa_alacak, 2),
        'kasa_borc', v_kasa_borc,
        'kasa_alacak', v_kasa_alacak,
        'bekleyen_alacak', v_bekleyen_alacak,
        'bekleyen_borc', v_bekleyen_borc,
        'aktif_uye_sayisi', v_aktif_uye_sayisi,
        'toplam_daire_sayisi', v_toplam_daire_sayisi,
        'cari_bakiye', ROUND(v_firma_toplam_alacak - v_firma_toplam_borc, 2),
        'cek_toplami', v_cek_toplami,
        'birikmis_teminat', v_birikmis_teminat,
        'banka_toplami', v_banka_toplami,
        'proje_suresi', jsonb_build_object('ay', v_proje_suresi_ay, 'gun', v_proje_suresi_gun),
        'odeme_sonrasi_nakit', ROUND(
            v_banka_toplami
            + (v_kasa_borc - v_kasa_alacak)
            + CASE WHEN (v_firma_toplam_alacak - v_firma_toplam_borc) < 0 THEN (v_firma_toplam_alacak - v_firma_toplam_borc) ELSE 0 END
            - v_cek_toplami
            - v_birikmis_teminat
        , 2)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. fn_aylik_rapor_detay — Aylık Rapor "Toplam Tahsilat" + tahsilat listesi
-- =============================================================================
-- Tahsilatlar bölümünde islem_turu filtresine 'uyelik_baslangic' ekleniyor.
CREATE OR REPLACE FUNCTION public.fn_aylik_rapor_detay(
    p_proje_id UUID,
    p_yil INTEGER,
    p_ay INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_gelirler JSONB;
    v_giderler JSONB;
    v_tahsilatlar JSONB;
    v_odemeler JSONB;
    v_toplam_gelir NUMERIC := 0;
    v_toplam_gider NUMERIC := 0;
    v_toplam_tahsilat NUMERIC := 0;
    v_toplam_odeme NUMERIC := 0;
    v_baslangic DATE;
    v_bitis DATE;
BEGIN
    v_baslangic := (p_yil::TEXT || '-' || LPAD(p_ay::TEXT, 2, '0') || '-01')::DATE;
    v_bitis := (v_baslangic + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT
        COALESCE(jsonb_agg(t), '[]'::jsonb),
        COALESCE(SUM(alacak), 0)
    INTO v_gelirler, v_toplam_gelir
    FROM (
        SELECT
            ch.*,
            jsonb_build_object('cari_adi', ca.cari_adi) as cari_hesaplar
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar ca ON ch.cari_hesap_id = ca.id
        WHERE ch.proje_id = p_proje_id
          AND ch.tarih >= v_baslangic AND ch.tarih <= v_bitis
          AND ch.islem_turu = 'aidat_kayit'
        ORDER BY ch.tarih ASC
    ) t;

    SELECT
        COALESCE(jsonb_agg(t), '[]'::jsonb),
        COALESCE(SUM(borc), 0)
    INTO v_giderler, v_toplam_gider
    FROM (
        SELECT
            ch.*,
            jsonb_build_object('cari_adi', ca.cari_adi) as cari_hesaplar
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar ca ON ch.cari_hesap_id = ca.id
        WHERE ch.proje_id = p_proje_id
          AND ch.tarih >= v_baslangic AND ch.tarih <= v_bitis
          AND ch.islem_turu IN ('hakedis', 'fatura')
        ORDER BY ch.tarih ASC
    ) t;

    -- Tahsilatlar: gelen_odeme + uyelik_baslangic (DEĞİŞİKLİK)
    SELECT
        COALESCE(jsonb_agg(t), '[]'::jsonb),
        COALESCE(SUM(borc), 0)
    INTO v_tahsilatlar, v_toplam_tahsilat
    FROM (
        SELECT
            ch.*,
            jsonb_build_object('cari_adi', ca.cari_adi) as cari_hesaplar
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar ca ON ch.cari_hesap_id = ca.id
        WHERE ch.proje_id = p_proje_id
          AND ch.tarih >= v_baslangic AND ch.tarih <= v_bitis
          AND ch.islem_turu IN ('gelen_odeme', 'uyelik_baslangic')
          AND ch.borc > 0
        ORDER BY ch.tarih ASC
    ) t;

    SELECT
        COALESCE(jsonb_agg(t), '[]'::jsonb),
        COALESCE(SUM(alacak), 0)
    INTO v_odemeler, v_toplam_odeme
    FROM (
        SELECT
            ch.*,
            jsonb_build_object('cari_adi', ca.cari_adi) as cari_hesaplar
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar ca ON ch.cari_hesap_id = ca.id
        WHERE ch.proje_id = p_proje_id
          AND ch.tarih >= v_baslangic AND ch.tarih <= v_bitis
          AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer')
        ORDER BY ch.tarih ASC
    ) t;

    RETURN jsonb_build_object(
        'gelirler', v_gelirler,
        'giderler', v_giderler,
        'tahsilatlar', v_tahsilatlar,
        'odemeler', v_odemeler,
        'toplam_gelir', v_toplam_gelir,
        'toplam_gider', v_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_aylik_rapor_detay IS 'Belirli bir ay için gelir, gider, tahsilat (gelen_odeme + uyelik_baslangic) ve ödeme detaylarını döner.';

-- =============================================================================
-- 3. fn_yillik_rapor_ozet — Yıllık Rapor "Yıllık Tahsilat" + aylık seriler
-- =============================================================================
-- Aylık özet CTE'sindeki tahsilat sütununa 'uyelik_baslangic' ekleniyor.
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
            -- DEĞİŞİKLİK: 'uyelik_baslangic' eklendi.
            COALESCE(SUM(CASE WHEN h.islem_turu IN ('gelen_odeme', 'uyelik_baslangic') AND h.borc > 0 THEN h.borc ELSE 0 END), 0) as tahsilat,
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

COMMIT;
