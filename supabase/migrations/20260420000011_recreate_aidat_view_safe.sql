-- Migration: 20260420000011_recreate_aidat_view_safe.sql
-- Description: Recreate the aidat_detaylari view with a safer column list to ensure no shadowing or naming conflicts.

BEGIN;

DROP VIEW IF EXISTS public.aidat_detaylari;

CREATE VIEW public.aidat_detaylari AS
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    a.uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    a.gecikme_faizi,
    a.created_at,
    a.updated_at,
    at.yil,
    at.ay,
    at.tur as aidat_turu,
    at.katsayi_tutari as baz_tutar,
    s.serefiye_orani,
    s.daire_no,
    s.blok_id as filter_blok_id, -- Use a unique name for filtering to avoid any ambiguity
    b.blok_adi,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as hesaplanan_tutar,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + COALESCE(a.gecikme_faizi, 0)) as toplam_borc,
    COALESCE((
        SELECT SUM(tutar) 
        FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'aidat' AND kaynak_id = a.id
    ), 0) as dinamik_odenen_tutar
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
LEFT JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
LEFT JOIN public.bloklar b ON s.blok_id = b.id;

COMMIT;
