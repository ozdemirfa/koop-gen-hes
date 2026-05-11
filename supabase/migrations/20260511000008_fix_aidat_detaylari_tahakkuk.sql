-- Migration: 20260511000008_fix_aidat_detaylari_tahakkuk.sql
-- Description: Fix aidat_detaylari view: toplam_tahakkuk was always 0 when dues were
--   created via unit-assignment trigger (fn_sync_aidatlar_on_unit_assignment), because
--   that trigger wrote kaynak_tipi = NULL whereas the CTE filtered for
--   kaynak_tipi IN ('aidat', 'gecikme_faizi').
--
--   Root cause: toplam_tahakkuk relied on cari_hareketler accrual entries instead of
--   the always-available computed formula (katsayi_tutari * serefiye_orani + faiz).
--
--   Fix: use the formula directly for toplam_tahakkuk and kalan_borc.
--   toplam_odenen still comes from cari_hareketler (borc column, kaynak_tipi='aidat').
--
--   Secondary fix: kalan_borc floored at 0 for 'odendi' rows to prevent negative
--   balances when FIFO includes gecikme_faizi in payment without formal accrual.

BEGIN;

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

    -- Base due amount (always computed from definition)
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))  AS baz_tutar,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))  AS hesaplanan_tutar, -- legacy alias

    -- Tahakkuk: always formula-based so unit-assignment and charge-based scenarios
    -- both produce correct numbers.  Interest included only when reflected.
    (
        (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
        + CASE WHEN a.faiz_yansitildi
               THEN COALESCE(a.gecikme_faizi, 0)
               ELSE 0
          END
    )                                                        AS toplam_tahakkuk,

    -- Legacy alias used by summary RPC and some service code
    (
        (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
        + CASE WHEN a.faiz_yansitildi
               THEN COALESCE(a.gecikme_faizi, 0)
               ELSE 0
          END
    )                                                        AS toplam_borc,

    -- Paid: only direct aidat-tagged payments (FIFO assigns these)
    COALESCE(ct.total_paid, 0)                               AS toplam_odenen,
    COALESCE(ct.total_paid, 0)                               AS dinamik_odenen_tutar, -- legacy alias

    -- Interest: the accumulated value stored on aidatlar row
    CASE WHEN a.faiz_yansitildi
         THEN COALESCE(a.gecikme_faizi, 0)
         ELSE 0
    END                                                      AS toplam_faiz,
    CASE WHEN a.faiz_yansitildi
         THEN COALESCE(a.gecikme_faizi, 0)
         ELSE 0
    END                                                      AS gecikme_faizi, -- legacy alias

    -- Remaining balance: formula-based tahakkuk minus payments.
    -- GREATEST(..., 0) for 'odendi' rows: FIFO may pay gecikme_faizi even when
    -- faiz_yansitildi=false (no formal interest accrual entry), so paid amount can
    -- exceed baz_tutar, producing a negative raw balance.  An odendi row has zero
    -- remaining debt by definition; floor it at 0.
    CASE
        WHEN a.durum = 'odendi' THEN 0
        ELSE GREATEST(
            (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
            + CASE WHEN a.faiz_yansitildi
                   THEN COALESCE(a.gecikme_faizi, 0)
                   ELSE 0
              END
            - COALESCE(ct.total_paid, 0)
            - COALESCE(ct.total_faiz_paid, 0),
            0
        )
    END                                                      AS kalan_borc,

    -- Overdue days counter
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

-- ────────────────────────────────────────────────────────────────────────────
-- Recreate get_aidat_summary_v4 (dropped by CASCADE above)
-- ────────────────────────────────────────────────────────────────────────────
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

COMMIT;
