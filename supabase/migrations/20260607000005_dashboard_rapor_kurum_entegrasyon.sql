-- Migration: 20260607000005_dashboard_rapor_kurum_entegrasyon.sql
-- Sprint: kurumsal-cari-revizyonlar (2026-06-07) — Rev 5
-- Description: Kurum ödemelerinin pano + aylık rapora doğru yansıması.
--   - fn_dashboard_ozet v9:
--       * toplam_odeme → firma + KURUMSAL giden ödeme (alacak)
--       * toplam_gider → hakediş + iade + KURUM GİDER (kurumsal cari borç, islem_turu='kurum_gider')
--       * yeni alan: kurum_gider
--   - fn_aylik_rapor_detay v6:
--       * giderler dataset'i + toplam_gider'e kurum_gider eklenir (odemeler zaten
--         giden_odeme'yi kapsadığından kurum ödemesi otomatik gelir)
--   - Mizan (get_cari_mizan) cari_turu filtrelemediği için kurumsal otomatik görünür (DB değişikliği yok).
--   Kurum gider satırı odeme_turu=NULL olduğundan kasa/banka SNAPSHOT'ını etkilemez;
--   kurum ödeme (giden_odeme) satırı gerçek para çıkışı olarak zaten kasa/banka'ya yansır.
--
-- Canonical kaynak: 20260525180000 (v8). Gövde birebir korunup yalnız kurum kolları eklendi.
-- DROP+CREATE sonrası search_path pin (20260602170200 sweep bir kerelik) inline eklenir.

BEGIN;

-- =============================================================================
-- 1. fn_dashboard_ozet — v9
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_dashboard_ozet(UUID);
DROP FUNCTION IF EXISTS public.fn_dashboard_ozet(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.fn_dashboard_ozet(
    p_proje_id UUID,
    p_baslangic DATE DEFAULT NULL,
    p_bitis DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_proje_baslangic DATE;

    -- FLOW (donem ici)
    v_aidat_tahakkuk NUMERIC := 0;
    v_uyelik_tahakkuk NUMERIC := 0;
    v_toplam_tahakkuk NUMERIC := 0;
    v_toplam_tahsilat NUMERIC := 0;
    v_toplam_odeme NUMERIC := 0;
    v_hakedis_tahakkuk NUMERIC := 0;
    v_iade_tahakkuk NUMERIC := 0;
    v_kurum_gider NUMERIC := 0;
    v_toplam_gider_tahakkuku NUMERIC := 0;
    v_toplam_fatura NUMERIC := 0;
    v_gecikme_faizi_tahsilati NUMERIC := 0;

    -- SNAPSHOT (anlik)
    v_kasa_borc NUMERIC := 0;
    v_kasa_alacak NUMERIC := 0;
    v_kasa_nakit NUMERIC := 0;
    v_firma_toplam_alacak NUMERIC := 0;
    v_firma_toplam_borc NUMERIC := 0;
    v_cari_bakiye NUMERIC := 0;
    v_bekleyen_alacak NUMERIC := 0;
    v_bekleyen_borc NUMERIC := 0;
    v_cek_toplami NUMERIC := 0;
    v_banka_toplami NUMERIC := 0;
    v_birikmis_teminat NUMERIC := 0;
    v_aktif_uye_sayisi INTEGER := 0;
    v_toplam_daire_sayisi INTEGER := 0;
    v_proje_suresi_ay INTEGER := 0;
    v_proje_suresi_gun INTEGER := 0;
    v_nakit_durumu NUMERIC := 0;
    v_odeme_sonrasi_nakit NUMERIC := 0;
BEGIN
    SELECT baslangic_tarihi INTO v_proje_baslangic FROM public.projeler WHERE id = p_proje_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Proje bulunamadı', 'success', false);
    END IF;

    -- FLOW: cari_hareketler — LEFT JOIN (virman nakit satirlari cari_hesap_id NULL)
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.islem_turu = 'uyelik_baslangic' AND ch.alacak > 0 AND ch.kaynak_tipi IS NULL THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('gelen_odeme', 'uyelik_baslangic') AND ch.borc > 0 THEN ch.borc ELSE 0 END), 0), 2),
        -- Rev 5: giden ödeme firma + kurumsal
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu IN ('firma', 'kurumsal') AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer') THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.islem_turu = 'iade_odeme' AND ch.alacak > 0 THEN ch.alacak ELSE 0 END), 0), 2),
        -- Rev 5: kurum gider (kurumsal cari borç, tahakkuk satırı)
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'kurumsal' AND ch.islem_turu = 'kurum_gider' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.kaynak_tipi = 'gecikme_faizi' AND ch.borc > 0 THEN ch.borc ELSE 0 END), 0), 2)
    INTO
        v_aidat_tahakkuk, v_uyelik_tahakkuk, v_toplam_tahsilat, v_toplam_odeme,
        v_iade_tahakkuk, v_kurum_gider, v_gecikme_faizi_tahsilati
    FROM public.cari_hareketler ch
    LEFT JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id
      AND (p_baslangic IS NULL OR ch.tarih >= p_baslangic)
      AND (p_bitis IS NULL OR ch.tarih <= p_bitis);

    v_toplam_tahakkuk := ROUND(v_aidat_tahakkuk + v_uyelik_tahakkuk, 2);

    -- SNAPSHOT: kasa + firma bakiyeleri (filtreden bagimsiz) — LEFT JOIN
    -- NOT: kurum gider satırı odeme_turu=NULL → kasa'ya etki etmez; kurum ödeme
    --      (giden_odeme) satırı odeme_turu=nakit/banka olduğundan doğru yansır.
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.borc ELSE 0 END), 0), 2)
    INTO
        v_kasa_borc, v_kasa_alacak, v_firma_toplam_alacak, v_firma_toplam_borc
    FROM public.cari_hareketler ch
    LEFT JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id;

    v_kasa_nakit := ROUND(v_kasa_borc - v_kasa_alacak, 2);
    v_cari_bakiye := ROUND(v_firma_toplam_alacak - v_firma_toplam_borc, 2);

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

    SELECT ROUND(COALESCE(SUM(hakedis_toplam), 0), 2)
    INTO v_hakedis_tahakkuk
    FROM public.hakedisler
    WHERE proje_id = p_proje_id
      AND durum IN ('onaylandi', 'odendi')
      AND (p_baslangic IS NULL OR onay_tarihi >= p_baslangic)
      AND (p_bitis IS NULL OR onay_tarihi <= p_bitis);

    -- Rev 5: toplam gider = hakediş + iade + kurum gider
    v_toplam_gider_tahakkuku := ROUND(v_hakedis_tahakkuk + v_iade_tahakkuk + v_kurum_gider, 2);

    SELECT ROUND(COALESCE(SUM(birikmis_teminat), 0), 2)
    INTO v_birikmis_teminat
    FROM public.birikmis_teminatlar
    WHERE proje_id = p_proje_id;

    SELECT ROUND(COALESCE(SUM(toplam_tutar), 0), 2) INTO v_toplam_fatura
    FROM public.faturalar
    WHERE proje_id = p_proje_id
      AND fatura_tipi = 'gelen'
      AND (p_baslangic IS NULL OR fatura_tarihi >= p_baslangic)
      AND (p_bitis IS NULL OR fatura_tarihi <= p_bitis);

    SELECT ROUND(COALESCE(SUM(tutar), 0), 2) INTO v_cek_toplami
    FROM public.cekler
    WHERE proje_id = p_proje_id AND durum = 'beklemede';

    SELECT ROUND(COALESCE(SUM(CASE WHEN islem_tipi = 'gelir' THEN tutar ELSE -tutar END), 0), 2)
    INTO v_banka_toplami
    FROM public.banka_hareketleri
    WHERE proje_id = p_proje_id;

    SELECT COUNT(*) INTO v_aktif_uye_sayisi
    FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif';

    SELECT COALESCE(SUM(toplam_daire), 0) INTO v_toplam_daire_sayisi
    FROM public.bloklar WHERE proje_id = p_proje_id;

    IF v_proje_baslangic IS NOT NULL THEN
        v_proje_suresi_ay := (EXTRACT(YEAR FROM age(CURRENT_DATE, v_proje_baslangic)) * 12
                              + EXTRACT(MONTH FROM age(CURRENT_DATE, v_proje_baslangic)));
        v_proje_suresi_gun := EXTRACT(DAY FROM age(CURRENT_DATE, v_proje_baslangic));
    END IF;

    v_nakit_durumu := ROUND(
        v_banka_toplami + v_kasa_nakit + v_cari_bakiye - v_cek_toplami
    , 2);

    v_odeme_sonrasi_nakit := ROUND(
        v_banka_toplami
        + v_kasa_nakit
        + CASE WHEN v_cari_bakiye < 0 THEN v_cari_bakiye ELSE 0 END
        - v_cek_toplami
        - v_birikmis_teminat
    , 2);

    v_result := jsonb_build_object(
        'success', true,
        -- FLOW
        'toplam_gelir', v_toplam_tahakkuk,
        'toplam_tahakkuk', v_toplam_tahakkuk,
        'aidat_tahakkuk', v_aidat_tahakkuk,
        'uyelik_tahakkuk', v_uyelik_tahakkuk,
        'toplam_gider', v_toplam_gider_tahakkuku,
        'toplam_gider_tahakkuku', v_toplam_gider_tahakkuku,
        'hakedis_tahakkuk', v_hakedis_tahakkuk,
        'iade_tahakkuku', v_iade_tahakkuk,
        'kurum_gider', v_kurum_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme,
        'toplam_fatura', v_toplam_fatura,
        'fatura_farki', ROUND(v_toplam_fatura - v_hakedis_tahakkuk, 2),
        'gecikme_faizi_tahsilati', v_gecikme_faizi_tahsilati,
        'gecikme_faiz_tahsilati', v_gecikme_faizi_tahsilati,
        -- SNAPSHOT
        'kasa_banka', v_banka_toplami,
        'kasa_nakit', v_kasa_nakit,
        'kasa_borc', v_kasa_borc,
        'kasa_alacak', v_kasa_alacak,
        'bekleyen_alacak', v_bekleyen_alacak,
        'bekleyen_borc', v_bekleyen_borc,
        'aktif_uye_sayisi', v_aktif_uye_sayisi,
        'toplam_daire_sayisi', v_toplam_daire_sayisi,
        'cari_bakiye', v_cari_bakiye,
        'cek_toplami', v_cek_toplami,
        'birikmis_teminat', v_birikmis_teminat,
        'banka_toplami', v_banka_toplami,
        'proje_suresi', jsonb_build_object('ay', v_proje_suresi_ay, 'gun', v_proje_suresi_gun),
        'nakit_durumu', v_nakit_durumu,
        'odeme_sonrasi_nakit', v_odeme_sonrasi_nakit
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_dashboard_ozet(UUID, DATE, DATE) IS
    'Proje pano ozeti. v9 (20260607000005): toplam_odeme firma+kurumsal giden ödeme; '
    'toplam_gider hakediş+iade+kurum_gider; yeni alan kurum_gider. v8 gövdesi korundu.';

-- =============================================================================
-- 2. fn_aylik_rapor_detay — v6 (giderlere kurum_gider)
-- =============================================================================
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
          AND (
            ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi')
            OR (ch.islem_turu = 'uyelik_baslangic' AND ch.alacak > 0 AND ch.kaynak_tipi IS NULL)
          )
          AND ch.alacak > 0
        ORDER BY ch.tarih ASC
    ) t;

    -- Rev 5: giderlere kurum_gider eklendi
    SELECT
        COALESCE(jsonb_agg(t), '[]'::jsonb),
        COALESCE(SUM(borc), 0)
    INTO v_giderler, v_toplam_gider
    FROM (
        SELECT
            ch.*,
            jsonb_build_object('cari_adi', ca.cari_adi) as cari_hesaplar
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar ca ON ca.id = ch.cari_hesap_id
        WHERE ch.proje_id = p_proje_id
          AND ch.tarih >= v_baslangic AND ch.tarih <= v_bitis
          AND ch.islem_turu IN ('hakedis', 'iade_odeme', 'kurum_gider')
        ORDER BY ch.tarih ASC
    ) t;

    -- Rev 5: toplam gider = hakediş(borc) + kurum_gider(borc) + iade(alacak)
    SELECT
        COALESCE(SUM(
            CASE
                WHEN islem_turu IN ('hakedis', 'kurum_gider') THEN borc
                WHEN islem_turu = 'iade_odeme' THEN alacak
                ELSE 0
            END
        ), 0)
    INTO v_toplam_gider
    FROM public.cari_hareketler
    WHERE proje_id = p_proje_id
      AND tarih >= v_baslangic AND tarih <= v_bitis
      AND islem_turu IN ('hakedis', 'iade_odeme', 'kurum_gider');

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
          AND ch.kaynak_tipi IS NULL
        ORDER BY ch.tarih ASC
    ) t;

    -- odemeler: giden_odeme zaten kapsanır → kurum ödemesi (kurumsal cari giden_odeme)
    -- otomatik gelir.
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
        'toplam_tahakkuk', v_toplam_gelir,
        'toplam_gider', v_toplam_gider,
        'toplam_gider_tahakkuku', v_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_aylik_rapor_detay(UUID, INTEGER, INTEGER) IS
    'Aylik mali rapor. v6 (20260607000005): giderler + toplam_gider''e kurum_gider eklendi; '
    'odemeler giden_odeme''yi kapsadığından kurum ödemesi otomatik gelir. v5 gövdesi korundu.';

COMMIT;
