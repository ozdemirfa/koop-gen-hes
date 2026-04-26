-- Migration: 20260426000002_fix_uye_aidat_accounting.sql
-- Description: Improve aidat accounting logic for members based on Cari Hareketler.

BEGIN;

-- 1. Redefine aidat_detaylari view to be fully cari_hareketler based
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE OR REPLACE VIEW public.aidat_detaylari AS
WITH aidat_cari_totals AS (
    SELECT 
        kaynak_id as aidat_id,
        SUM(alacak) as total_accrued, -- Toplam Tahakkuk (Baz + Faiz)
        SUM(borc) as total_paid,       -- Toplam Tahsilat
        SUM(CASE WHEN aciklama LIKE '%Gecikme Faizi%' THEN alacak ELSE 0 END) as total_interest -- Sadece Faiz Kısmı
    FROM public.cari_hareketler
    WHERE kaynak_tipi = 'aidat'
    GROUP BY kaynak_id
)
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    COALESCE(a.uye_id, s.uye_id) as uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    a.faiz_yansitildi,
    a.created_at,
    a.updated_at,
    at.yil,
    at.ay,
    at.tur as aidat_turu,
    s.daire_no,
    b.id as filter_blok_id,
    b.blok_adi,
    u.ad,
    u.soyad,
    u.uye_no,
    -- Ana Borç (Tanımdan gelen baz tutar)
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as baz_tutar,
    -- Cari Hareketlerden Gelen Gerçek Veriler
    COALESCE(ct.total_accrued, 0) as toplam_tahakkuk,
    COALESCE(ct.total_paid, 0) as toplam_odenen,
    COALESCE(ct.total_interest, 0) as toplam_faiz,
    (COALESCE(ct.total_accrued, 0) - COALESCE(ct.total_paid, 0)) as kalan_borc,
    -- Gecikme Gün Sayısı
    CASE 
        WHEN a.durum != 'odendi' AND a.son_odeme_tarihi < CURRENT_DATE 
        THEN (CURRENT_DATE - a.son_odeme_tarihi)::INTEGER 
        ELSE 0 
    END as gecikme_gun_sayisi
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
JOIN public.bloklar b ON s.blok_id = b.id
LEFT JOIN public.uyeler u ON u.id = COALESCE(a.uye_id, s.uye_id)
LEFT JOIN aidat_cari_totals ct ON ct.aidat_id = a.id;

-- 2. Trigger to automatically update aidat status based on balance
CREATE OR REPLACE FUNCTION public.fn_sync_aidat_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_aidat_id UUID;
    v_balance NUMERIC;
    v_son_odeme DATE;
BEGIN
    -- Sadece aidat kaynaklı hareketlerde çalış
    IF (TG_OP = 'DELETE') THEN
        v_aidat_id := OLD.kaynak_id;
    ELSE
        v_aidat_id := NEW.kaynak_id;
    END IF;

    -- Kaynak tipi aidat değilse çık
    IF (TG_OP <> 'DELETE' AND NEW.kaynak_tipi <> 'aidat') OR (TG_OP = 'DELETE' AND OLD.kaynak_tipi <> 'aidat') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Güncel bakiyeyi ve vadeyi kontrol et
    SELECT 
        (COALESCE(SUM(ch.alacak), 0) - COALESCE(SUM(ch.borc), 0)),
        MAX(a.son_odeme_tarihi)
    INTO v_balance, v_son_odeme
    FROM public.aidatlar a
    LEFT JOIN public.cari_hareketler ch ON a.id = ch.kaynak_id AND ch.kaynak_tipi = 'aidat'
    WHERE a.id = v_aidat_id
    GROUP BY a.id;

    -- Durumu güncelle
    IF v_balance <= 0 THEN
        UPDATE public.aidatlar SET durum = 'odendi' WHERE id = v_aidat_id;
    ELSIF v_son_odeme < CURRENT_DATE THEN
        UPDATE public.aidatlar SET durum = 'gecikti' WHERE id = v_aidat_id;
    ELSE
        UPDATE public.aidatlar SET durum = 'bekliyor' WHERE id = v_aidat_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_aidat_status_on_payment ON public.cari_hareketler;
CREATE TRIGGER trg_sync_aidat_status_on_payment
AFTER INSERT OR UPDATE OR DELETE ON public.cari_hareketler
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_aidat_status_on_payment();

-- 3. Redefine the summary function (was dropped by CASCADE)
CREATE OR REPLACE FUNCTION public.get_aidat_summary_v4(
  p_proje_id UUID DEFAULT NULL,
  p_yil INTEGER DEFAULT NULL,
  p_ay INTEGER DEFAULT NULL,
  p_durum TEXT DEFAULT NULL,
  p_blok_id UUID DEFAULT NULL,
  p_has_daire BOOLEAN DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_durum_enum public.aidat_durumu;
BEGIN
    IF p_durum IS NOT NULL AND p_durum <> '' THEN
        BEGIN
            v_durum_enum := p_durum::public.aidat_durumu;
        EXCEPTION WHEN OTHERS THEN
            v_durum_enum := NULL;
        END;
    END IF;

  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(toplam_tahakkuk), 0),
    'toplam_tahsilat', COALESCE(SUM(toplam_odenen), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN kalan_borc ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN kalan_borc ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(toplam_faiz), 0)
  ) INTO result
  FROM public.aidat_detaylari
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id)
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR p_durum = '' OR durum = v_durum_enum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
