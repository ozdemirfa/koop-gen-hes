-- Migration: 20260509000001_aylik_rapor_rpc_and_teminat_rls.sql
-- Description: Revise birikmis_teminatlar RLS and create fn_aylik_rapor_detay RPC for performance.

BEGIN;

-- 1. US-QC-04: Revise RLS for birikmis_teminatlar
-- Narrowing access from 'true' to admin/staff only
DROP POLICY IF EXISTS "Allow authenticated users to read guarantees" ON public.birikmis_teminatlar;

CREATE POLICY "Allow authenticated users to read guarantees" 
ON public.birikmis_teminatlar FOR SELECT 
TO authenticated 
USING (public.is_admin() OR public.is_staff());

COMMENT ON POLICY "Allow authenticated users to read guarantees" ON public.birikmis_teminatlar IS 'Sadece yönetici ve personel birikmiş teminatları görebilir.';

-- 2. Update islem_turu constraint to include all requested types (including 'odeme')
ALTER TABLE public.cari_hareketler DROP CONSTRAINT IF EXISTS cari_hareketler_islem_turu_check;
ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check 
CHECK (islem_turu IN (
    'aidat_kayit', 
    'hakedis', 
    'gelen_odeme', 
    'giden_odeme', 
    'gecikme_faizi', 
    'fatura',
    'cek_odeme',
    'banka_transfer',
    'odeme'
));

-- 3. US-QC-05: Create fn_aylik_rapor_detay RPC
-- This RPC replaces the logic in rapor.service.ts -> aylikRapor for better performance
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
    -- Dönem tarihlerini hesapla
    v_baslangic := (p_yil::TEXT || '-' || LPAD(p_ay::TEXT, 2, '0') || '-01')::DATE;
    v_bitis := (v_baslangic + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- Gelirler (islem_turu = 'aidat_kayit')
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

    -- Giderler (islem_turu IN ('hakedis', 'fatura'))
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

    -- Tahsilatlar (islem_turu = 'gelen_odeme')
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
          AND ch.islem_turu = 'gelen_odeme'
        ORDER BY ch.tarih ASC
    ) t;

    -- Ödemeler (islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer'))
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

COMMENT ON FUNCTION public.fn_aylik_rapor_detay IS 'Belirli bir ay için gelir, gider, tahsilat ve ödeme detaylarını döner.';

COMMIT;
