-- Migration: 20260418000008_fix_rpc_and_data.sql

-- 1. Gecikme faizi hesaplama fonksiyonunu proje bazlı filtreleme ile güncelle
CREATE OR REPLACE FUNCTION public.hesapla_gecikme_faizi(
  p_proje_id UUID DEFAULT NULL,
  p_uye_id UUID DEFAULT NULL,
  p_baslangic_tarihi DATE DEFAULT NULL,
  p_bitis_tarihi DATE DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE public.aidatlar a
  SET
    gecikme_faizi = a.tutar * (
      SELECT COALESCE(at.gecikme_faiz_orani, 0) / 100
      FROM public.aidat_tanimlari at WHERE at.id = a.aidat_tanimi_id
    ) * GREATEST(EXTRACT(MONTH FROM age(CURRENT_DATE, a.son_odeme_tarihi)), 1),
    durum = CASE
      WHEN a.durum = 'bekliyor' THEN 'gecikti'::aidat_durumu
      ELSE a.durum
    END,
    updated_at = now()
  WHERE a.durum IN ('bekliyor', 'gecikti') 
    AND a.son_odeme_tarihi < CURRENT_DATE
    AND (p_proje_id IS NULL OR a.proje_id = p_proje_id)
    AND (p_uye_id IS NULL OR a.uye_id = p_uye_id)
    AND (p_baslangic_tarihi IS NULL OR a.son_odeme_tarihi >= p_baslangic_tarihi)
    AND (p_bitis_tarihi IS NULL OR a.son_odeme_tarihi <= p_bitis_tarihi)
    AND (a.updated_at::date < CURRENT_DATE OR a.gecikme_faizi IS NULL OR a.gecikme_faizi = 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Aidat özet fonksiyonunu proje bazlı filtreleme ile güncelle
CREATE OR REPLACE FUNCTION public.get_aidat_summary(p_proje_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(tutar + COALESCE(gecikme_faizi, 0)), 0),
    'toplam_tahsilat', COALESCE(SUM(odenen_tutar), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN tutar ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN tutar + COALESCE(gecikme_faizi, 0) ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(COALESCE(gecikme_faizi, 0)), 0)
  ) INTO result
  FROM public.aidatlar
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. proje_id'si NULL kalmış olabilecek kayıtları onar (varsa ilk projeye ata)
DO $$
DECLARE
  first_project_id UUID;
BEGIN
  SELECT id INTO first_project_id FROM public.projeler ORDER BY created_at ASC LIMIT 1;
  
  IF first_project_id IS NOT NULL THEN
    UPDATE public.uyeler SET proje_id = first_project_id WHERE proje_id IS NULL;
    UPDATE public.firmalar SET proje_id = first_project_id WHERE proje_id IS NULL;
    UPDATE public.aidatlar SET proje_id = first_project_id WHERE proje_id IS NULL;
    UPDATE public.banka_hesaplari SET proje_id = first_project_id WHERE proje_id IS NULL;
  END IF;
END $$;
