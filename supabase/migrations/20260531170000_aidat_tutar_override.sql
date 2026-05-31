-- Migration: 20260531170000_aidat_tutar_override.sql
-- Description: Aidat Listesi'nde satır içi düzenleme (tutar + son ödeme tarihi).
--   Aidat tutarı bugüne kadar tamamen türetilmiş bir değerdi
--   (fn_aidat_yuvarla(katsayi_tutari * serefiye_orani)); tek bir aidat satırının
--   tutarını ayrı düzenlemek mümkün değildi. Bu migration:
--     1) aidatlar tablosuna `tutar_override` (NULL = türetilmiş) kolonu ekler.
--     2) aidat_detaylari view'inde baz tutarı COALESCE(tutar_override, türetilmiş)
--        olarak hesaplar (baz_tutar, hesaplanan_tutar, toplam_tahakkuk, toplam_borc,
--        kalan_borc). DROP CASCADE get_aidat_summary_v4'u düşürür → yeniden yaratılır.
--     3) fn_update_aidat_row(p_aidat_id, p_tutar, p_son_odeme_tarihi, p_actor_id)
--        RPC'sini ekler: tutar_override + son_odeme_tarihi günceller ve cari
--        tahakkuku (kaynak_tipi='aidat') yeni tutara eşitler. Ödeme yapılmış
--        aidatlarda tutar değişimi P0001 ile reddedilir.
--
-- Canonical view kaynağı: 20260530000001_aidat_tutar_yuvarlama.sql (yalnızca baz
--   tutar ifadesi COALESCE(a.tutar_override, ...) ile sarıldı).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. tutar_override kolonu
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.aidatlar
  ADD COLUMN IF NOT EXISTS tutar_override NUMERIC(12,2);

COMMENT ON COLUMN public.aidatlar.tutar_override IS
  'Manuel düzenlenen aidat baz tutarı. NULL ise tutar türetilir '
  '(fn_aidat_yuvarla(katsayi_tutari * serefiye_orani)).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. aidat_detaylari view — baz tutar COALESCE(tutar_override, türetilmiş)
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

    -- Base due amount: manuel override varsa onu, yoksa türetilmiş (100'e yukari yuvarli)
    COALESCE(
        a.tutar_override,
        public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
    )                                                       AS baz_tutar,
    COALESCE(
        a.tutar_override,
        public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00))
    )                                                       AS hesaplanan_tutar, -- legacy alias

    -- Tahakkuk: baz + (yansitildiysa) faiz
    (
        COALESCE(a.tutar_override,
                 public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)))
        + CASE WHEN a.faiz_yansitildi
               THEN COALESCE(a.gecikme_faizi, 0)
               ELSE 0
          END
    )                                                        AS toplam_tahakkuk,

    (
        COALESCE(a.tutar_override,
                 public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)))
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
            COALESCE(a.tutar_override,
                     public.fn_aidat_yuvarla(at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)))
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

-- get_aidat_summary_v4 (DROP CASCADE ile düştü) — canonical 20260511000008 / 20260530000001
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
-- 3. fn_update_aidat_row — satır içi düzenleme (tutar + son ödeme tarihi)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_update_aidat_row(
  p_aidat_id         UUID,
  p_tutar            NUMERIC DEFAULT NULL,
  p_son_odeme_tarihi DATE    DEFAULT NULL,
  p_actor_id         UUID    DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_aidat   RECORD;
  v_paid    NUMERIC;
  v_uye     UUID;
  v_cari_id UUID;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  SELECT a.id, a.proje_id, a.uye_id, a.serefiye_id, s.uye_id AS serefiye_uye_id
  INTO v_aidat
  FROM public.aidatlar a
  JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
  WHERE a.id = p_aidat_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı');
  END IF;

  -- Bu aidata ödeme (tahsilat) yapılmış mı?
  SELECT COALESCE(SUM(borc), 0) INTO v_paid
  FROM public.cari_hareketler
  WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id;

  IF p_tutar IS NOT NULL AND v_paid > 0 THEN
    RAISE EXCEPTION 'Bu aidata ödeme yapılmış; tutar değiştirilemez. Önce ödeme eşleştirmesini geri alın.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_tutar IS NOT NULL AND p_tutar <= 0 THEN
    RAISE EXCEPTION 'Tutar pozitif olmalı' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.aidatlar
    SET tutar_override   = COALESCE(p_tutar, tutar_override),
        son_odeme_tarihi = COALESCE(p_son_odeme_tarihi, son_odeme_tarihi),
        updated_at       = NOW()
    WHERE id = p_aidat_id;

  -- Tutar değiştiyse cari tahakkuku da güncelle / yoksa oluştur (üye + cari varsa).
  IF p_tutar IS NOT NULL THEN
    v_uye := COALESCE(v_aidat.uye_id, v_aidat.serefiye_uye_id);
    IF v_uye IS NOT NULL THEN
      SELECT id INTO v_cari_id FROM public.cari_hesaplar
       WHERE proje_id = v_aidat.proje_id AND uye_id = v_uye;
      IF v_cari_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id) THEN
          UPDATE public.cari_hareketler
            SET alacak = p_tutar
            WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id;
        ELSE
          INSERT INTO public.cari_hareketler (
            proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
          ) VALUES (
            v_aidat.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, p_tutar, 0, 'aidat', p_aidat_id,
            'Aidat Tahakkuku (düzenlendi)'
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_update_aidat_row(UUID, NUMERIC, DATE, UUID) IS
  'Aidat satırı düzenleme: tutar_override + son_odeme_tarihi günceller, cari '
  'tahakkuku yeni tutara eşitler. Ödeme yapılmışsa tutar değişimi P0001 ile reddedilir.';

COMMIT;
