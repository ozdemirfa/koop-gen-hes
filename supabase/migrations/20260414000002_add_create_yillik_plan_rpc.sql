-- RPC for atomic yearly plan creation in a single transaction
-- This ensures that either the entire yearly plan is created or nothing is.
CREATE OR REPLACE FUNCTION create_yillik_aidat_plani(
  p_yil INTEGER,
  p_kalemler JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_kalem JSONB;
  v_tanim_id UUID;
  v_olusturulan_tanim INTEGER := 0;
  v_olusturulan_aidat INTEGER := 0;
  v_total_aidat_created INTEGER := 0;
  v_son_odeme_tarihi DATE;
  v_son_odeme_gunu INTEGER;
  v_ay INTEGER;
BEGIN
  -- 1. Check for existing payments in that year for 'normal' aidats
  -- (We don't want to overwrite or delete records that have financial activity)
  IF EXISTS (
    SELECT 1 FROM aidatlar a
    JOIN aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    WHERE at.yil = p_yil AND at.tur = 'normal'
    AND (a.durum = 'odendi' OR a.odenen_tutar > 0)
  ) THEN
    RAISE EXCEPTION 'Bu yıla ait ödeme yapılmış aidatlar bulunduğu için plan güncellenemez. Lütfen manuel düzenleme yapın.';
  END IF;

  -- 2. Delete existing 'normal' definitions for that year
  -- This will cascade and delete associated aidats as they have no payments (checked above).
  DELETE FROM aidat_tanimlari WHERE yil = p_yil AND tur = 'normal';

  -- 3. Loop through kalemler and create everything
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_ay := (v_kalem->>'ay')::INTEGER;
    v_son_odeme_gunu := COALESCE((v_kalem->>'son_odeme_gunu')::INTEGER, 15);
    
    -- Insert definition
    INSERT INTO aidat_tanimlari (
      yil, ay, katsayi_tutari, son_odeme_gunu, gecikme_faiz_orani, tur, aciklama
    ) VALUES (
      p_yil, 
      v_ay, 
      (v_kalem->>'katsayi_tutari')::NUMERIC, 
      v_son_odeme_gunu, 
      COALESCE((v_kalem->>'gecikme_faiz_orani')::NUMERIC, 0), 
      'normal', 
      v_kalem->>'aciklama'
    ) RETURNING id INTO v_tanim_id;

    v_olusturulan_tanim := v_olusturulan_tanim + 1;

    -- Calculate son_odeme_tarihi (handling potential invalid dates by capping)
    -- We can use a simple CASE for February/Months to be safe or just use PostgreSQL's internal handling
    -- For simplicity and following the project pattern, we assume son_odeme_gunu is reasonable (<= 28)
    -- But to be robust, we'll try/catch or just use day capping
    v_son_odeme_tarihi := make_date(p_yil, v_ay, LEAST(v_son_odeme_gunu, 28)); -- Safe default for day

    -- Insert aidatlar for all active members in one bulk operation per month
    INSERT INTO aidatlar (uye_id, aidat_tanimi_id, tutar, son_odeme_tarihi)
    SELECT 
      u.id, 
      v_tanim_id, 
      (v_kalem->>'katsayi_tutari')::NUMERIC * (COALESCE(u.serefiye_orani, 1.00)),
      v_son_odeme_tarihi
    FROM uyeler u
    WHERE u.durum = 'aktif';
    
    GET DIAGNOSTICS v_olusturulan_aidat = ROW_COUNT;
    v_total_aidat_created := v_total_aidat_created + v_olusturulan_aidat;
  END LOOP;

  RETURN jsonb_build_object(
    'yillik_tanim', v_olusturulan_tanim,
    'olusturulan_aidat_sayisi', v_total_aidat_created
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
