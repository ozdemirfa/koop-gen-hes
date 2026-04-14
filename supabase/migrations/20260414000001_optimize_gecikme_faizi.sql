-- Optimize the 'hesapla_gecikme_faizi' RPC in Supabase
-- Added optional filters and performance optimization to avoid redundant updates.
CREATE OR REPLACE FUNCTION hesapla_gecikme_faizi(
  p_uye_id UUID DEFAULT NULL,
  p_baslangic_tarihi DATE DEFAULT NULL,
  p_bitis_tarihi DATE DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE aidatlar a
  SET
    gecikme_faizi = a.tutar * (
      SELECT COALESCE(at.gecikme_faiz_orani, 0) / 100
      FROM aidat_tanimlari at WHERE at.id = a.aidat_tanimi_id
    ) * GREATEST(EXTRACT(MONTH FROM age(CURRENT_DATE, a.son_odeme_tarihi)), 1),
    durum = CASE
      WHEN a.durum = 'bekliyor' THEN 'gecikti'::aidat_durumu
      ELSE a.durum
    END,
    updated_at = now()
  WHERE a.durum IN ('bekliyor', 'gecikti') 
    AND a.son_odeme_tarihi < CURRENT_DATE
    AND (p_uye_id IS NULL OR a.uye_id = p_uye_id)
    AND (p_baslangic_tarihi IS NULL OR a.son_odeme_tarihi >= p_baslangic_tarihi)
    AND (p_bitis_tarihi IS NULL OR a.son_odeme_tarihi <= p_bitis_tarihi)
    -- Optimization: Only update if it hasn't been updated today.
    -- Interest calculation based on age(CURRENT_DATE, ...) only changes daily.
    AND (a.updated_at::date < CURRENT_DATE OR a.gecikme_faizi IS NULL OR a.gecikme_faizi = 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add missing database indices to 'aidatlar' table for common filter/sort columns
CREATE INDEX IF NOT EXISTS idx_aidatlar_son_odeme_tarihi ON aidatlar(son_odeme_tarihi);
CREATE INDEX IF NOT EXISTS idx_aidatlar_durum ON aidatlar(durum);
CREATE INDEX IF NOT EXISTS idx_aidatlar_uye_id ON aidatlar(uye_id);
