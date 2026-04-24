-- Migration: 20260421000002_cari_hesap_revizyon_faz1_updates.sql
-- Description: Completion of Cari Hesap System Phase 1 - Column updates and RLS refinement

BEGIN;

-- 0. Drop dependent views first to avoid dependency errors during column updates
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

-- 1. Update cari_hareketler table columns
-- 'hareket_tipi' ve 'tutar' kolonlarını kaldırıyoruz (User isteği üzerine)
ALTER TABLE public.cari_hareketler DROP COLUMN IF EXISTS hareket_tipi;
ALTER TABLE public.cari_hareketler DROP COLUMN IF EXISTS tutar;

-- 'borc' ve 'alacak' kolonlarını ekliyoruz
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS borc NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.cari_hareketler ADD COLUMN IF NOT EXISTS alacak NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cari_hareketler.borc IS 'Cari hesabın borç tutarı (ödeme yükümlülüğü, örn: aidat borcu, hakedis borcu).';
COMMENT ON COLUMN public.cari_hareketler.alacak IS 'Cari hesabın alacak tutarı (yapılan ödeme, örn: aidat ödemesi, giden ödeme).';

-- 2. Ensure proje_id is correctly set and constrained
-- proje_id zaten önceki migration'larda eklenmişti. NOT NULL ve FK kontrolü yapıyoruz.
-- Not: TRUNCATE yapıldığı için NOT NULL constraint'i güvenli bir şekilde eklenebilir.
DO $$ 
BEGIN
    -- NOT NULL constraint ekle (eğer yoksa)
    ALTER TABLE public.cari_hareketler ALTER COLUMN proje_id SET NOT NULL;
    
    -- Foreign Key kontrolü (Genellikle REFERENCES ile eklenir ama garanti edelim)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'cari_hareketler' AND constraint_name = 'cari_hareketler_proje_id_fkey'
    ) THEN
        ALTER TABLE public.cari_hareketler 
        ADD CONSTRAINT cari_hareketler_proje_id_fkey 
        FOREIGN KEY (proje_id) REFERENCES public.projeler(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Recreate the aidat_detaylari view to use the new column structure
-- tutar kalktığı için dinamik_odenen_tutar kısmını SUM(alacak) olarak güncelliyoruz.
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

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
    s.blok_id as filter_blok_id,
    b.blok_adi,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as hesaplanan_tutar,
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00) + COALESCE(a.gecikme_faizi, 0)) as toplam_borc,
    COALESCE((
        SELECT SUM(alacak) 
        FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'aidat' AND kaynak_id = a.id
    ), 0) as dinamik_odenen_tutar
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
LEFT JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
LEFT JOIN public.bloklar b ON s.blok_id = b.id;

-- 3.1 Recreate Dependent Functions (Dropped due to CASCADE)
CREATE OR REPLACE FUNCTION public.get_aidat_summary_v3(
  p_proje_id UUID DEFAULT NULL,
  p_yil INTEGER DEFAULT NULL,
  p_ay INTEGER DEFAULT NULL,
  p_durum aidat_durumu DEFAULT NULL,
  p_blok_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(toplam_borc), 0),
    'toplam_tahsilat', COALESCE(SUM(dinamik_odenen_tutar), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN hesaplanan_tutar ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN toplam_borc ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(COALESCE(gecikme_faizi, 0)), 0)
  ) INTO result
  FROM public.aidat_detaylari
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id)
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR durum = p_durum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id);

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Refine RLS for cari_hesaplar (Admin & Staff Access)
DROP POLICY IF EXISTS "cari_hesaplar_access" ON public.cari_hesaplar;
CREATE POLICY "cari_hesaplar_access" ON public.cari_hesaplar
    FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

COMMENT ON POLICY "cari_hesaplar_access" ON public.cari_hesaplar IS 'Admin ve staff tüm cari hesaplara tam erişim sağlar.';

-- 5. Refine RLS for cari_hareketler (Admin & Staff Access)
DROP POLICY IF EXISTS "cari_hareketler_access" ON public.cari_hareketler;
CREATE POLICY "cari_hareketler_access" ON public.cari_hareketler
    FOR ALL TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

COMMENT ON POLICY "cari_hareketler_access" ON public.cari_hareketler IS 'Admin ve staff tüm cari hareketlere tam erişim sağlar.';

COMMIT;
