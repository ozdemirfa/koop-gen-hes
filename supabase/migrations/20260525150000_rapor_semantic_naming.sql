-- Migration: 20260525150000_rapor_semantic_naming.sql
-- Description:
--   Mali raporlama RPC'lerinde field naming semantik temizliği. Eski field'lar
--   geriye uyumluluk için korunur (deprecated), yeni semantik field'lar ek olarak
--   döndürülür.
--
-- Tasarım Kararı (master-agent.md sprint: 20260525-rapor-semantic-naming):
--   - toplam_gelir       → toplam_tahakkuk (aidat + üyelik başlangıç tahakkukları)
--   - toplam_gider       → toplam_gider_tahakkuku (hakediş/fatura tahakkuku — henüz ödeme değil)
--   - toplam_tahsilat    → DEĞİŞMEZ (gerçek para girişi)
--   - toplam_odeme       → DEĞİŞMEZ (gerçek para çıkışı)
--   - aylik[].gelir      → aylik[].tahakkuk (yıllık rapor aylık serisi)
--   - aylik[].gider      → aylik[].gider_tahakkuku
--
-- Migration Stratejisi: Option B (geriye uyumlu)
--   Tek-shot rename değil — eski client'lar kırılmasın. Backend service ve frontend
--   yeni alanlara taşındıktan sonra ileri sprint'te (B5) eski alanlar silinecek.
--
-- Etkilenen RPC'ler:
--   1. fn_dashboard_ozet(UUID, DATE, DATE)
--   2. fn_aylik_rapor_detay(UUID, INT, INT)
--   3. fn_yillik_rapor_ozet(UUID, INT)
--
-- Önceki migration zinciri (zorunlu uyum):
--   * 20260524140000_fn_dashboard_ozet_date_range.sql — date range param + FLOW/SNAPSHOT ayrımı
--   * 20260515000003_include_uyelik_baslangic_in_tahsilat.sql — uyelik_baslangic tahsilat aggregate
--   * 20260509000001_aylik_rapor_rpc_and_teminat_rls.sql   — fn_aylik_rapor_detay tanımı
--
-- Bu migration yalnız jsonb_build_object'a yeni alan EKLER; mevcut tüm alanları aynen
-- döndürür. Davranışsal regresyon riski sıfır.

BEGIN;

-- =============================================================================
-- 1. fn_dashboard_ozet — Pano: toplam_tahakkuk + toplam_gider_tahakkuku ek
-- =============================================================================
-- Önceki sürüm (20260524140000): FLOW/SNAPSHOT ayrımı + date range filtresi.
-- Bu sürüm: jsonb response shape'ine semantik alan ek (alias).

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

    -- FLOW (dönem içi)
    v_toplam_gelir NUMERIC := 0;
    v_toplam_tahsilat NUMERIC := 0;
    v_toplam_odeme NUMERIC := 0;
    v_hakedis_toplam_gider NUMERIC := 0;
    v_toplam_fatura NUMERIC := 0;

    -- SNAPSHOT (anlık)
    v_kasa_borc NUMERIC := 0;
    v_kasa_alacak NUMERIC := 0;
    v_firma_toplam_alacak NUMERIC := 0;
    v_firma_toplam_borc NUMERIC := 0;
    v_bekleyen_alacak NUMERIC := 0;
    v_bekleyen_borc NUMERIC := 0;
    v_cek_toplami NUMERIC := 0;
    v_banka_toplami NUMERIC := 0;
    v_birikmis_teminat NUMERIC := 0;
    v_aktif_uye_sayisi INTEGER := 0;
    v_toplam_daire_sayisi INTEGER := 0;
    v_proje_suresi_ay INTEGER := 0;
    v_proje_suresi_gun INTEGER := 0;
BEGIN
    SELECT baslangic_tarihi INTO v_proje_baslangic FROM public.projeler WHERE id = p_proje_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Proje bulunamadı', 'success', false);
    END IF;

    -- FLOW: cari_hareketler
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu = 'gelen_odeme' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer') THEN ch.alacak ELSE 0 END), 0), 2)
    INTO
        v_toplam_gelir, v_toplam_tahsilat, v_toplam_odeme
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id
      AND (p_baslangic IS NULL OR ch.tarih >= p_baslangic)
      AND (p_bitis IS NULL OR ch.tarih <= p_bitis);

    -- SNAPSHOT: kasa & firma bakiyeleri
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.borc ELSE 0 END), 0), 2)
    INTO
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

    SELECT ROUND(COALESCE(SUM(hakedis_toplam), 0), 2)
    INTO v_hakedis_toplam_gider
    FROM public.hakedisler
    WHERE proje_id = p_proje_id
      AND durum IN ('onaylandi', 'odendi')
      AND (p_baslangic IS NULL OR onay_tarihi >= p_baslangic)
      AND (p_bitis IS NULL OR onay_tarihi <= p_bitis);

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

    v_result := jsonb_build_object(
        'success', true,
        -- FLOW (filtre uygulanmış)
        -- @deprecated 20260525150000 — sonraki sprint'te (B5) silinecek; tüketici toplam_tahakkuk kullanmalı.
        'toplam_gelir', v_toplam_gelir,
        -- YENİ semantik alan: aidat + üyelik başlangıç tahakkukları (alacak kayıt).
        'toplam_tahakkuk', v_toplam_gelir,
        -- @deprecated 20260525150000 — sonraki sprint'te (B5) silinecek; tüketici toplam_gider_tahakkuku kullanmalı.
        'toplam_gider', v_hakedis_toplam_gider,
        -- YENİ semantik alan: hakediş/fatura tahakkukları — henüz ödeme değil.
        'toplam_gider_tahakkuku', v_hakedis_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme,
        'toplam_fatura', v_toplam_fatura,
        'fatura_farki', ROUND(v_toplam_fatura - v_hakedis_toplam_gider, 2),
        -- SNAPSHOT (filtreden bağımsız)
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

COMMENT ON FUNCTION public.fn_dashboard_ozet(UUID, DATE, DATE) IS
    'Proje pano özetini hesaplar. v6 (20260525150000): semantik field aliasları — '
    'toplam_tahakkuk (=toplam_gelir) ve toplam_gider_tahakkuku (=toplam_gider) eklendi. '
    'Eski toplam_gelir ve toplam_gider alanları @deprecated; B5 sprint''inde silinecek.';

-- =============================================================================
-- 2. fn_aylik_rapor_detay — Aylık rapor: yeni semantik alanlar ek
-- =============================================================================
-- Önceki sürüm (20260515000003): tahsilat aggregate'ine uyelik_baslangic ekleme.
-- Bu sürüm: jsonb response shape'ine semantik alan ek (alias).

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

    -- Tahsilatlar: gelen_odeme + uyelik_baslangic (20260515000003)
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
        -- @deprecated 20260525150000 — B5 sprint'inde silinecek; tüketici toplam_tahakkuk kullanmalı.
        'toplam_gelir', v_toplam_gelir,
        -- YENİ semantik alan: aidat tahakkukları (aidat_kayit alacak toplamı).
        'toplam_tahakkuk', v_toplam_gelir,
        -- @deprecated 20260525150000 — B5 sprint'inde silinecek; tüketici toplam_gider_tahakkuku kullanmalı.
        'toplam_gider', v_toplam_gider,
        -- YENİ semantik alan: hakediş + fatura tahakkukları.
        'toplam_gider_tahakkuku', v_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_aylik_rapor_detay(UUID, INTEGER, INTEGER) IS
    'Aylık mali rapor. v3 (20260525150000): toplam_tahakkuk + toplam_gider_tahakkuku '
    'semantik alanları eklendi. Eski toplam_gelir + toplam_gider @deprecated; B5 sprint''inde silinecek.';

-- =============================================================================
-- 3. fn_yillik_rapor_ozet — Yıllık rapor: aylik[]'a tahakkuk + gider_tahakkuku ek
-- =============================================================================
-- Önceki sürüm (20260515000003): aylik_ozet tahsilat sütununa uyelik_baslangic ek.
-- Bu sürüm: jsonb response shape'ine toplam alias + aylik[] her satıra alan ek.

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
            COALESCE(SUM(CASE WHEN h.islem_turu IN ('gelen_odeme', 'uyelik_baslangic') AND h.borc > 0 THEN h.borc ELSE 0 END), 0) as tahsilat,
            COALESCE(SUM(CASE WHEN h.islem_turu = 'giden_odeme' THEN h.alacak ELSE 0 END), 0) as odeme
        FROM aylar a
        LEFT JOIN hareketler h ON a.ay = h.ay
        GROUP BY a.ay
        ORDER BY a.ay
    )
    SELECT jsonb_agg(jsonb_build_object(
        'ay', ay,
        -- @deprecated 20260525150000 — B5 sprint'inde silinecek; tüketici tahakkuk kullanmalı.
        'gelir', gelir,
        -- YENİ semantik alan
        'tahakkuk', gelir,
        -- @deprecated 20260525150000 — B5 sprint'inde silinecek; tüketici gider_tahakkuku kullanmalı.
        'gider', gider,
        -- YENİ semantik alan
        'gider_tahakkuku', gider,
        'tahsilat', tahsilat,
        'odeme', odeme
    )) INTO v_aylik_veriler
    FROM aylik_ozet;

    RETURN jsonb_build_object(
        'yil', p_yil,
        'aylik', v_aylik_veriler,
        -- @deprecated 20260525150000 — B5 sprint'inde silinecek; tüketici toplam_tahakkuk kullanmalı.
        'toplam_gelir', COALESCE((SELECT SUM((v->>'gelir')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        -- YENİ semantik alan
        'toplam_tahakkuk', COALESCE((SELECT SUM((v->>'gelir')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        -- @deprecated 20260525150000 — B5 sprint'inde silinecek; tüketici toplam_gider_tahakkuku kullanmalı.
        'toplam_gider', COALESCE((SELECT SUM((v->>'gider')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        -- YENİ semantik alan
        'toplam_gider_tahakkuku', COALESCE((SELECT SUM((v->>'gider')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        'toplam_tahsilat', COALESCE((SELECT SUM((v->>'tahsilat')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        'toplam_odeme', COALESCE((SELECT SUM((v->>'odeme')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_yillik_rapor_ozet(UUID, INTEGER) IS
    'Yıllık mali rapor. v3 (20260525150000): toplam_tahakkuk + toplam_gider_tahakkuku + '
    'aylik[].tahakkuk + aylik[].gider_tahakkuku semantik alanları eklendi. '
    'Eski toplam_gelir, toplam_gider, aylik[].gelir, aylik[].gider @deprecated; B5 sprint''inde silinecek.';

COMMIT;
