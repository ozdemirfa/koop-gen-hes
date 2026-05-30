-- Migration: 20260530000001_aidat_tutar_yuvarlama.sql
-- Description: Aidat ana tutarı (katsayi_tutari * serefiye_orani) daireye/üyeye
--   aktarılırken 100'ün katına YUKARI yuvarlanır ve ondalık 0 olur (ör. 2356.46 -> 2400.00).
--   Yuvarlama hem ana tahakkukta hem gecikme faizi taban tutarında uygulanır (faizin
--   kendisi yine 2 ondalık kalır). Tutarlılık için 5 hesaplama noktası tek migration'da
--   yeniden oluşturulur: charge RPC, aidat_detaylari view, bulk faiz, tekil faiz, FIFO.
--
-- Canonical kaynaklar: 20260511000003_audit_actor_remaining_rpcs.sql (RPC'ler) ve
--   20260511000008_fix_aidat_detaylari_tahakkuk.sql (view + get_aidat_summary_v4).
--   Gövdeler birebir korunmuş; yalnızca (katsayi_tutari * COALESCE(serefiye_orani,1.00))
--   ifadesi public.fn_aidat_yuvarla(...) ile sarılmıştır.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Yuvarlama yardımcı fonksiyonu: 100'e yukarı, ondalık 0
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_aidat_yuvarla(p NUMERIC)
RETURNS NUMERIC AS $$
  SELECT CEIL(COALESCE(p, 0) / 100.0) * 100;
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION public.fn_aidat_yuvarla(NUMERIC) IS
  'Aidat tutarini 100''un katina YUKARI yuvarlar, ondalik 0 (CEIL(x/100)*100).';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. fn_charge_aidat_tanimi — v_tutar yuvarlanir
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_charge_aidat_tanimi(UUID, UUID);
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
            -- YUVARLAMA: 100'e yukari, ondalik 0
            v_tutar := public.fn_aidat_yuvarla(v_record.katsayi_tutari * COALESCE(v_daire.serefiye_orani, 1.00));

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

COMMENT ON FUNCTION public.fn_charge_aidat_tanimi(UUID, UUID) IS
  'Aidat tanimi manuel borclandirma + her daire icin aidat + cari hareket. '
  'Tutar 100''e yukari yuvarlanir (fn_aidat_yuvarla). p_actor_id verilirse app.actor_id set edilir.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. aidat_detaylari view — tum tahakkuk formulleri yuvarlanir
--    (DROP CASCADE get_aidat_summary_v4'u dusurur; asagida yeniden yaratilir)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE OR REPLACE VIEW public.aidat_detaylari AS
WITH aidat_cari_totals AS (
    SELECT
        kaynak_id AS aidat_id,
        SUM(CASE WHEN kaynak_tipi = 'aidat' THEN borc ELSE 0 END)           AS total_paid,
        SUM(CASE WHEN kaynak_tipi = 'gecikme_faizi' THEN borc ELSE 0 END)   AS total_faiz_paid,
        SUM(CASE WHEN kaynak_tipi = 'gecikme_faizi' THEN alacak ELSE 0 END) AS total_interest
    FROM public.cari_hareketler
    WHERE kaynak_tipi IN ('aidat', 'gecikme_faizi')
    GROUP BY kaynak_id
)
SELECT
    a.id,
    a.proje_id,
    a.serefiye_id,
    COALESCE(a.uye_id, s.uye_id)                           AS uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    a.faiz_yansitildi,
    a.created_at,
    a.updated_at,
    at.yil,
    at.ay,
    at.tur                                                  AS aidat_turu,
    s.daire_no,
    b.id                                                    AS filter_blok_id,
    b.blok_adi,
    u.ad,
    u.soyad,
    u.uye_no,

    -- Base due amount (100'e yukari yuvarli)
    public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))  AS baz_tutar,
    public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))  AS hesaplanan_tutar, -- legacy alias

    -- Tahakkuk: yuvarli baz + (yansitildiysa) faiz
    (
        public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
        + CASE WHEN a.faiz_yansitildi
               THEN COALESCE(a.gecikme_faizi, 0)
               ELSE 0
          END
    )                                                        AS toplam_tahakkuk,

    (
        public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
        + CASE WHEN a.faiz_yansitildi
               THEN COALESCE(a.gecikme_faizi, 0)
               ELSE 0
          END
    )                                                        AS toplam_borc,

    COALESCE(ct.total_paid, 0)                               AS toplam_odenen,
    COALESCE(ct.total_paid, 0)                               AS dinamik_odenen_tutar, -- legacy alias

    CASE WHEN a.faiz_yansitildi
         THEN COALESCE(a.gecikme_faizi, 0)
         ELSE 0
    END                                                      AS toplam_faiz,
    CASE WHEN a.faiz_yansitildi
         THEN COALESCE(a.gecikme_faizi, 0)
         ELSE 0
    END                                                      AS gecikme_faizi, -- legacy alias

    CASE
        WHEN a.durum = 'odendi' THEN 0
        ELSE GREATEST(
            public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
            + CASE WHEN a.faiz_yansitildi
                   THEN COALESCE(a.gecikme_faizi, 0)
                   ELSE 0
              END
            - COALESCE(ct.total_paid, 0)
            - COALESCE(ct.total_faiz_paid, 0),
            0
        )
    END                                                      AS kalan_borc,

    CASE
        WHEN a.durum != 'odendi' AND a.son_odeme_tarihi < CURRENT_DATE
        THEN (CURRENT_DATE - a.son_odeme_tarihi)::INTEGER
        ELSE 0
    END                                                      AS gecikme_gun_sayisi

FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
JOIN public.bloklar b ON s.blok_id = b.id
LEFT JOIN public.uyeler u ON u.id = COALESCE(a.uye_id, s.uye_id)
LEFT JOIN aidat_cari_totals ct ON ct.aidat_id = a.id;

-- Recreate get_aidat_summary_v4 (dropped by CASCADE above) — canonical 20260511000008
CREATE OR REPLACE FUNCTION public.get_aidat_summary_v4(
    p_proje_id   UUID    DEFAULT NULL,
    p_yil        INTEGER DEFAULT NULL,
    p_ay         INTEGER DEFAULT NULL,
    p_durum      TEXT    DEFAULT NULL,
    p_blok_id    UUID    DEFAULT NULL,
    p_has_daire  BOOLEAN DEFAULT NULL,
    p_search     TEXT    DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result          JSON;
    v_durum_enum    public.aidat_durumu;
BEGIN
    IF p_durum IS NOT NULL AND p_durum <> '' THEN
        BEGIN
            v_durum_enum := p_durum::public.aidat_durumu;
        EXCEPTION WHEN OTHERS THEN
            v_durum_enum := NULL;
        END;
    END IF;

    SELECT json_build_object(
        'toplam_aidat',         COALESCE(SUM(toplam_tahakkuk), 0),
        'toplam_tahsilat',      COALESCE(SUM(toplam_odenen),   0),
        'bekleyen',             COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN GREATEST(kalan_borc, 0) ELSE 0 END), 0),
        'geciken',              COALESCE(SUM(CASE WHEN durum = 'gecikti'  THEN GREATEST(kalan_borc, 0) ELSE 0 END), 0),
        'toplam_gecikme_faizi', COALESCE(SUM(toplam_faiz), 0)
    )
    INTO result
    FROM public.aidat_detaylari
    WHERE (p_proje_id  IS NULL OR proje_id        = p_proje_id)
      AND (p_yil       IS NULL OR yil              = p_yil)
      AND (p_ay        IS NULL OR ay               = p_ay)
      AND (p_durum     IS NULL OR p_durum = ''     OR durum = v_durum_enum)
      AND (p_blok_id   IS NULL OR filter_blok_id   = p_blok_id)
      AND (p_has_daire IS NULL
           OR (p_has_daire = TRUE  AND uye_id IS NOT NULL)
           OR (p_has_daire = FALSE AND uye_id IS NULL))
      AND (p_search    IS NULL OR p_search = ''
           OR ad    ILIKE '%' || p_search || '%'
           OR soyad ILIKE '%' || p_search || '%'
           OR uye_no ILIKE '%' || p_search || '%');

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. fn_bulk_charge_interest — v_baz_tutar yuvarlanir
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_bulk_charge_interest(UUID[], UUID);
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
            -- YUVARLAMA: faiz taban tutari da 100'e yukari yuvarli
            v_baz_tutar := public.fn_aidat_yuvarla(v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00));
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

COMMENT ON FUNCTION public.fn_bulk_charge_interest(UUID[], UUID) IS
  'Coklu aidat icin faiz tahakkuku (taban tutar 100''e yuvarli). p_actor_id verilirse app.actor_id set edilir.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. fn_calculate_single_aidat_late_fee — v_baz_tutar yuvarlanir
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_calculate_single_aidat_late_fee(UUID, UUID);
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

    -- YUVARLAMA: faiz taban tutari da 100'e yukari yuvarli
    v_baz_tutar := public.fn_aidat_yuvarla(v_record.katsayi_tutari * COALESCE(v_record.serefiye_orani, 1.00));
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

COMMENT ON FUNCTION public.fn_calculate_single_aidat_late_fee(UUID, UUID) IS
  'Tek aidat icin gecikme faizi hesapla (taban 100''e yuvarli, faiz_yansitildi uyumlu). p_actor_id verilirse app.actor_id set edilir.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. fn_match_member_payments_fifo — toplam_borc fallback formulu yuvarlanir
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_match_member_payments_fifo(UUID, UUID, UUID);
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
                    public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) + COALESCE(a.gecikme_faizi, 0)
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

COMMENT ON FUNCTION public.fn_match_member_payments_fifo(UUID, UUID, UUID) IS
  'Uye bazli FIFO odeme eslestirme (aidat tahakkuk fallback 100''e yuvarli). p_actor_id verilirse app.actor_id set edilir.';

COMMIT;
