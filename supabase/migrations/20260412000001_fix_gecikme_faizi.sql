CREATE OR REPLACE FUNCTION hesapla_gecikme_faizi()
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
    END
  WHERE a.durum IN ('bekliyor', 'gecikti') AND a.son_odeme_tarihi < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
