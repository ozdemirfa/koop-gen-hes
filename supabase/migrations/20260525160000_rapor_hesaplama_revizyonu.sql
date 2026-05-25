-- Migration: 20260525160000_rapor_hesaplama_revizyonu.sql
-- Description:
--   Mali raporlama RPC body'lerinde hesaplama formülleri revizyonu. Önceki sprint
--   (`sprint-rapor-semantic-naming`, tag 419ede1) ALAN ADLANDIRMASINI düzeltti
--   (toplam_gelir → toplam_tahakkuk, toplam_gider → toplam_gider_tahakkuku). Bu
--   migration field adları aynı kalırken FORMÜLLERİ kullanıcının iş kurallarına
--   göre yeniden yazar.
--
-- Tasarım Kararı (master-agent.md sprint: 20260525-rapor-hesaplama-revizyonu):
--
--   ESKİ FORMÜL → YENİ FORMÜL:
--     toplam_tahakkuk        = aidat_kayit + gecikme_faizi
--                            → aidat_kayit + gecikme_faizi
--                              + uyelik_baslangic (alacak, kaynak_tipi IS NULL)
--
--     toplam_gider_tahakkuku = hakedis (durum onaylandi/odendi)
--                              + cari_hareketler.fatura (borc)
--                            → hakedis (durum onaylandi/odendi)
--                              + cari_hareketler.iade_odeme (alacak)
--                              [fatura ÇIKARILDI; ayrı kart kalır]
--
--     toplam_tahsilat        = gelen_odeme + uyelik_baslangic (borc) — DEĞİŞMEZ
--     toplam_odeme           = giden_odeme + odeme + cek_odeme + banka_transfer — DEĞİŞMEZ
--
--   ESKİ aliaslar (@deprecated):
--     toplam_gelir = toplam_tahakkuk (B5 sprintinde silinecek)
--     toplam_gider = toplam_gider_tahakkuku (B5 sprintinde silinecek)
--     aylik[].gelir = aylik[].tahakkuk
--     aylik[].gider = aylik[].gider_tahakkuku
--
-- Etkilenen RPC'ler:
--   1. fn_dashboard_ozet(UUID, DATE, DATE)
--   2. fn_aylik_rapor_detay(UUID, INT, INT)
--   3. fn_yillik_rapor_ozet(UUID, INT)
--
-- Önceki migration zinciri:
--   * 20260525150000_rapor_semantic_naming.sql — semantik alias eklendi
--   * 20260524140000_fn_dashboard_ozet_date_range.sql — FLOW/SNAPSHOT + date range
--   * 20260524000002_fn_dashboard_ozet_left_join_kasa.sql — virman kasa fix
--   * 20260515000003_include_uyelik_baslangic_in_tahsilat.sql — uyelik_baslangic tahsilat
--   * 20260514000003_teminat_iade_trigger.sql — teminat trigger + birikmis_teminat snapshot
--
-- PostgREST cache: CREATE OR REPLACE FUNCTION sonrası NOTIFY pgrst, 'reload schema'
--                   Supabase tarafında otomatik tetiklenir.

BEGIN;

-- =============================================================================
-- 1. fn_dashboard_ozet — toplam_tahakkuk + toplam_gider_tahakkuku formül revizyonu
-- =============================================================================
-- v7 (20260525160000): uyelik_baslangic tahakkuku gelir formülüne; iade_odeme
-- gider formülüne. Fatura artık `v_toplam_fatura` ayrı kartta kalır,
-- `v_hakedis_toplam_gider`'dan ÇIKARILDI (önceki migration zaten ayrı tutuyordu).

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
    v_aidat_tahakkuk NUMERIC := 0;        -- aidat_kayit + gecikme_faizi
    v_uyelik_tahakkuk NUMERIC := 0;       -- uyelik_baslangic (alacak, kaynak_tipi NULL)
    v_toplam_tahakkuk NUMERIC := 0;       -- aidat + uyelik
    v_toplam_tahsilat NUMERIC := 0;
    v_toplam_odeme NUMERIC := 0;
    v_hakedis_tahakkuk NUMERIC := 0;
    v_iade_tahakkuk NUMERIC := 0;         -- iade_odeme (alacak)
    v_toplam_gider_tahakkuku NUMERIC := 0; -- hakedis + iade
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

    -- FLOW: cari_hareketler — yeni semantik formüllerle 3-yönlü hesap
    -- Aidat tahakkuku (aidat_kayit + gecikme_faizi) + Üyelik tahakkuku (uyelik_baslangic alacak)
    SELECT
        -- Aidat tahakkuku
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN ch.alacak ELSE 0 END), 0), 2),
        -- Üyelik başlangıç tahakkuku (sadece kaynak_tipi NULL — FIFO eşleşmemiş ham tahakkuk)
        ROUND(COALESCE(SUM(CASE WHEN ch.islem_turu = 'uyelik_baslangic' AND ch.alacak > 0 AND ch.kaynak_tipi IS NULL THEN ch.alacak ELSE 0 END), 0), 2),
        -- Tahsilat (gelen_odeme + uyelik_baslangic borc) — değişmez
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('gelen_odeme', 'uyelik_baslangic') AND ch.borc > 0 THEN ch.borc ELSE 0 END), 0), 2),
        -- Ödeme — değişmez
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer') THEN ch.alacak ELSE 0 END), 0), 2),
        -- İade (üyelik bedeli iadesi) — gider tahakkuku formülüne girer
        ROUND(COALESCE(SUM(CASE WHEN ch.islem_turu = 'iade_odeme' AND ch.alacak > 0 THEN ch.alacak ELSE 0 END), 0), 2)
    INTO
        v_aidat_tahakkuk, v_uyelik_tahakkuk, v_toplam_tahsilat, v_toplam_odeme, v_iade_tahakkuk
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id
      AND (p_baslangic IS NULL OR ch.tarih >= p_baslangic)
      AND (p_bitis IS NULL OR ch.tarih <= p_bitis);

    v_toplam_tahakkuk := ROUND(v_aidat_tahakkuk + v_uyelik_tahakkuk, 2);

    -- SNAPSHOT: kasa & firma bakiyeleri (filtreden bağımsız)
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

    -- Hakediş gider tahakkuku
    SELECT ROUND(COALESCE(SUM(hakedis_toplam), 0), 2)
    INTO v_hakedis_tahakkuk
    FROM public.hakedisler
    WHERE proje_id = p_proje_id
      AND durum IN ('onaylandi', 'odendi')
      AND (p_baslangic IS NULL OR onay_tarihi >= p_baslangic)
      AND (p_bitis IS NULL OR onay_tarihi <= p_bitis);

    -- toplam_gider_tahakkuku = hakedis + iade_odeme (fatura DAHİL DEĞİL)
    v_toplam_gider_tahakkuku := ROUND(v_hakedis_tahakkuk + v_iade_tahakkuk, 2);

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
        -- @deprecated 20260525150000 — B5'te silinecek
        'toplam_gelir', v_toplam_tahakkuk,
        -- YENİ semantik alan (formül revizyonlu): aidat + uyelik tahakkuku
        'toplam_tahakkuk', v_toplam_tahakkuk,
        -- Alt-kırılım (frontend isteğe bağlı): aidat ve uyelik tahakkuku ayrı
        'aidat_tahakkuk', v_aidat_tahakkuk,
        'uyelik_tahakkuk', v_uyelik_tahakkuk,
        -- @deprecated 20260525150000 — B5'te silinecek
        'toplam_gider', v_toplam_gider_tahakkuku,
        -- YENİ semantik alan (formül revizyonlu): hakedis + iade (fatura yok)
        'toplam_gider_tahakkuku', v_toplam_gider_tahakkuku,
        -- Alt-kırılım: hakedis ve iade ayrı
        'hakedis_tahakkuk', v_hakedis_tahakkuk,
        'iade_tahakkuku', v_iade_tahakkuk,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme,
        'toplam_fatura', v_toplam_fatura,
        'fatura_farki', ROUND(v_toplam_fatura - v_hakedis_tahakkuk, 2),
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
    'Proje pano özetini hesaplar. v7 (20260525160000): toplam_tahakkuk formülüne uyelik_baslangic '
    'tahakkuku eklendi (kaynak_tipi IS NULL); toplam_gider_tahakkuku formülünden fatura çıkarıldı, '
    'iade_odeme eklendi. Alt-kırılım alanları: aidat_tahakkuk, uyelik_tahakkuk, hakedis_tahakkuk, '
    'iade_tahakkuku. Eski toplam_gelir/toplam_gider alias''ları @deprecated; B5''te silinecek.';

-- =============================================================================
-- 2. fn_aylik_rapor_detay — gelir/gider listeleri formül revizyonu
-- =============================================================================
-- v4 (20260525160000):
--   * v_gelirler: aidat_kayit + gecikme_faizi + uyelik_baslangic (alacak, kaynak_tipi NULL)
--   * v_giderler: hakedis + iade_odeme (fatura ÇIKARILDI)

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

    -- Tahakkuk listesi: aidat_kayit + gecikme_faizi + uyelik_baslangic (alacak, ham — kaynak_tipi NULL)
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

    -- Gider listesi: hakedis + iade_odeme (fatura YOK)
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
          AND ch.islem_turu IN ('hakedis', 'iade_odeme')
        ORDER BY ch.tarih ASC
    ) t;

    -- NOT: hakedis kaydı cari_hareketler'de `borc` ile (firma'nın bize alacağı doğdu),
    -- iade_odeme cari_hareketler'de `alacak` ile (üyeye yapılacak iade yükümlülüğü).
    -- v_toplam_gider hesabı borc toplamı ile yetersiz — iade_odeme alacağa yazıldığı için
    -- toplam dahil olmaz. Yeniden hesapla: borc + alacak (her satır kendi yön kaydında).

    SELECT
        COALESCE(SUM(
            CASE
                WHEN islem_turu = 'hakedis' THEN borc
                WHEN islem_turu = 'iade_odeme' THEN alacak
                ELSE 0
            END
        ), 0)
    INTO v_toplam_gider
    FROM public.cari_hareketler
    WHERE proje_id = p_proje_id
      AND tarih >= v_baslangic AND tarih <= v_bitis
      AND islem_turu IN ('hakedis', 'iade_odeme');

    -- Tahsilatlar: gelen_odeme + uyelik_baslangic (borc) — DEĞİŞMEZ
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
        -- @deprecated 20260525150000 — B5'te silinecek
        'toplam_gelir', v_toplam_gelir,
        -- YENİ semantik alan: aidat + gecikme_faizi + uyelik_baslangic tahakkukları
        'toplam_tahakkuk', v_toplam_gelir,
        -- @deprecated 20260525150000 — B5'te silinecek
        'toplam_gider', v_toplam_gider,
        -- YENİ semantik alan: hakedis (borc) + iade_odeme (alacak)
        'toplam_gider_tahakkuku', v_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_aylik_rapor_detay(UUID, INTEGER, INTEGER) IS
    'Aylık mali rapor. v4 (20260525160000): tahakkuk formülüne uyelik_baslangic eklendi '
    '(kaynak_tipi IS NULL); gider formülünden fatura çıkarıldı, iade_odeme eklendi. '
    'iade_odeme alacak tarafında olduğu için v_toplam_gider hesabı borc+alacak conditional '
    'CASE ile yeniden derlenir. Eski alanlar @deprecated; B5''te silinecek.';

-- =============================================================================
-- 3. fn_yillik_rapor_ozet — aylık CTE formül revizyonu
-- =============================================================================
-- v4 (20260525160000): aylik_ozet CTE'sinde gelir + gider formülleri yeni.

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
            kaynak_tipi,
            alacak,
            borc
        FROM public.cari_hareketler
        WHERE proje_id = p_proje_id AND EXTRACT(YEAR FROM tarih) = p_yil
    ),
    aylik_ozet AS (
        SELECT
            a.ay,
            -- TAHAKKUK: aidat_kayit + gecikme_faizi + uyelik_baslangic(alacak, kaynak_tipi NULL)
            COALESCE(SUM(CASE
                WHEN h.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN h.alacak
                WHEN h.islem_turu = 'uyelik_baslangic' AND h.alacak > 0 AND h.kaynak_tipi IS NULL THEN h.alacak
                ELSE 0
            END), 0) as gelir,
            -- GİDER TAHAKKUKU: hakedis (borc) + iade_odeme (alacak)
            COALESCE(SUM(CASE
                WHEN h.islem_turu = 'hakedis' THEN h.borc
                WHEN h.islem_turu = 'iade_odeme' THEN h.alacak
                ELSE 0
            END), 0) as gider,
            -- TAHSİLAT: gelen_odeme + uyelik_baslangic (borc) — DEĞİŞMEZ
            COALESCE(SUM(CASE WHEN h.islem_turu IN ('gelen_odeme', 'uyelik_baslangic') AND h.borc > 0 THEN h.borc ELSE 0 END), 0) as tahsilat,
            -- ÖDEME: giden_odeme
            COALESCE(SUM(CASE WHEN h.islem_turu = 'giden_odeme' THEN h.alacak ELSE 0 END), 0) as odeme
        FROM aylar a
        LEFT JOIN hareketler h ON a.ay = h.ay
        GROUP BY a.ay
        ORDER BY a.ay
    )
    SELECT jsonb_agg(jsonb_build_object(
        'ay', ay,
        -- @deprecated 20260525150000 — B5'te silinecek
        'gelir', gelir,
        -- YENİ semantik alan
        'tahakkuk', gelir,
        -- @deprecated 20260525150000 — B5'te silinecek
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
        -- @deprecated 20260525150000 — B5'te silinecek
        'toplam_gelir', COALESCE((SELECT SUM((v->>'gelir')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        -- YENİ semantik alan
        'toplam_tahakkuk', COALESCE((SELECT SUM((v->>'gelir')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        -- @deprecated 20260525150000 — B5'te silinecek
        'toplam_gider', COALESCE((SELECT SUM((v->>'gider')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        -- YENİ semantik alan
        'toplam_gider_tahakkuku', COALESCE((SELECT SUM((v->>'gider')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        'toplam_tahsilat', COALESCE((SELECT SUM((v->>'tahsilat')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0),
        'toplam_odeme', COALESCE((SELECT SUM((v->>'odeme')::NUMERIC) FROM jsonb_array_elements(v_aylik_veriler) v), 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_yillik_rapor_ozet(UUID, INTEGER) IS
    'Yıllık mali rapor. v4 (20260525160000): aylık CTE tahakkuk formülüne uyelik_baslangic '
    'eklendi (kaynak_tipi IS NULL); gider formülünden fatura çıkarıldı, iade_odeme eklendi '
    '(borc+alacak conditional). Eski alanlar @deprecated; B5''te silinecek.';

COMMIT;
