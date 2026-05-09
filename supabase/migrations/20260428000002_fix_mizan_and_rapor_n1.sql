-- Migration: 20260428000002_fix_mizan_and_rapor_n1.sql
-- Description: Fix N+1 queries in reporting and improve mizan RPC.

BEGIN;

-- 1. Improved Mizan RPC (Includes member/firma info)
DROP FUNCTION IF EXISTS public.get_cari_mizan(UUID);
CREATE OR REPLACE FUNCTION public.get_cari_mizan(p_proje_id UUID DEFAULT NULL)
RETURNS TABLE (
    cari_hesap_id UUID,
    cari_adi VARCHAR,
    cari_turu VARCHAR,
    uye_no VARCHAR,
    ad VARCHAR,
    soyad VARCHAR,
    firma_unvan VARCHAR,
    toplam_alacak NUMERIC,
    toplam_borc NUMERIC,
    bakiye NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ch.id,
        ch.cari_adi::VARCHAR,
        ch.cari_turu::VARCHAR,
        u.uye_no::VARCHAR,
        u.ad::VARCHAR,
        u.soyad::VARCHAR,
        f.unvan::VARCHAR as firma_unvan,
        COALESCE(SUM(ca.alacak), 0) as toplam_alacak,
        COALESCE(SUM(ca.borc), 0) as toplam_borc,
        COALESCE(SUM(ca.alacak), 0) - COALESCE(SUM(ca.borc), 0) as bakiye
    FROM public.cari_hesaplar ch
    LEFT JOIN public.uyeler u ON ch.uye_id = u.id
    LEFT JOIN public.firmalar f ON ch.firma_id = f.id
    LEFT JOIN public.cari_hareketler ca ON ch.id = ca.cari_hesap_id
    WHERE (p_proje_id IS NULL OR ch.proje_id = p_proje_id)
    GROUP BY ch.id, ch.cari_adi, ch.cari_turu, u.uye_no, u.ad, u.soyad, f.unvan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Aidat Durum Ozet RPC
CREATE OR REPLACE FUNCTION public.fn_aidat_durum_ozet(p_proje_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_object_agg(durum, count) INTO v_result
    FROM (
        SELECT durum::TEXT as durum, count(*) as count
        FROM public.aidatlar
        WHERE proje_id = p_proje_id
        GROUP BY durum
    ) t;
    
    RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
