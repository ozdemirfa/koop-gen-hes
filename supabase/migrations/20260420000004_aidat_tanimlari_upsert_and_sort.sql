-- Migration: 20260420000004_aidat_tanimlari_upsert_and_sort.sql
-- Description: Improve aidat_tanimlari unique constraints and update RPC for upsert behavior.

-- 1. Ensure unique constraint includes 'tur' and 'proje_id'
ALTER TABLE public.aidat_tanimlari DROP CONSTRAINT IF EXISTS aidat_tanimlari_yil_ay_key;
ALTER TABLE public.aidat_tanimlari DROP CONSTRAINT IF EXISTS aidat_tanimlari_proje_id_yil_ay_tur_key;
ALTER TABLE public.aidat_tanimlari ADD CONSTRAINT aidat_tanimlari_proje_id_yil_ay_tur_key UNIQUE (proje_id, yil, ay, tur);

-- 2. Update RPC function for UPSERT behavior
CREATE OR REPLACE FUNCTION public.create_yillik_aidat_plani(
  p_proje_id UUID,
  p_yil INTEGER,
  p_kalemler JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_kalem JSONB;
  v_tanim_id UUID;
  v_olusturulan_tanim INTEGER := 0;
  v_toplam_aidat_sayisi INTEGER := 0;
  v_son_odeme_tarihi DATE;
  v_son_odeme_gunu INTEGER;
  v_ay INTEGER;
  v_tur VARCHAR(20);
  v_daire RECORD;
  v_uye_id UUID;
  v_aidat_tutar NUMERIC;
BEGIN
  -- Döngü ile her ay için tanım oluştur/güncelle
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_ay := (v_kalem->>'ay')::INTEGER;
    v_tur := COALESCE(v_kalem->>'tur', 'normal');
    v_son_odeme_gunu := COALESCE((v_kalem->>'son_odeme_gunu')::INTEGER, 15);
    
    -- 1. Ödeme kontrolü (Bu spesifik tanım için ödeme var mı?)
    -- Eğer varsa güncellemeyi engelle
    IF EXISTS (
      SELECT 1 FROM aidatlar a
      JOIN aidat_tanimlari at ON a.aidat_tanimi_id = at.id
      WHERE at.proje_id = p_proje_id AND at.yil = p_yil AND at.ay = v_ay AND at.tur = v_tur
      AND (a.durum = 'odendi' OR a.odenen_tutar > 0)
    ) THEN
      -- Bu ay için ödeme var, pas geç veya hata ver (şuanlık pas geçiyoruz ya da exception atılabilir)
      CONTINUE; 
    END IF;

    -- 2. Tanımı UPSERT et (Overwrite logic)
    INSERT INTO public.aidat_tanimlari (
      proje_id, yil, ay, katsayi_tutari, son_odeme_gunu, gecikme_faiz_orani, tur, aciklama
    ) VALUES (
      p_proje_id, p_yil, v_ay, (v_kalem->>'katsayi_tutari')::NUMERIC, v_son_odeme_gunu, 
      COALESCE((v_kalem->>'gecikme_faiz_orani')::NUMERIC, 0), v_tur, v_kalem->>'aciklama'
    )
    ON CONFLICT (proje_id, yil, ay, tur) 
    DO UPDATE SET 
      katsayi_tutari = EXCLUDED.katsayi_tutari,
      son_odeme_gunu = EXCLUDED.son_odeme_gunu,
      gecikme_faiz_orani = EXCLUDED.gecikme_faiz_orani,
      aciklama = EXCLUDED.aciklama,
      updated_at = now()
    RETURNING id INTO v_tanim_id;

    v_olusturulan_tanim := v_olusturulan_tanim + 1;
    v_son_odeme_tarihi := (p_yil::TEXT || '-' || v_ay::TEXT || '-' || v_son_odeme_gunu::TEXT)::DATE;

    -- 3. Her daire (serefiye) için aidat kaydı oluştur/güncelle
    FOR v_daire IN SELECT id, serefiye_orani FROM public.serefiye_tablosu WHERE proje_id = p_proje_id
    LOOP
      -- Dairede oturan aktif üyeyi bul (varsa)
      SELECT id INTO v_uye_id FROM public.uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1;
      
      v_aidat_tutar := (v_kalem->>'katsayi_tutari')::NUMERIC * COALESCE(v_daire.serefiye_orani, 1.00);

      INSERT INTO public.aidatlar (
        proje_id, serefiye_id, uye_id, aidat_tanimi_id, tutar, son_odeme_tarihi
      ) VALUES (
        p_proje_id, v_daire.id, v_uye_id, v_tanim_id, v_aidat_tutar, v_son_odeme_tarihi
      )
      ON CONFLICT (serefiye_id, aidat_tanimi_id)
      DO UPDATE SET
        tutar = EXCLUDED.tutar,
        son_odeme_tarihi = EXCLUDED.son_odeme_tarihi,
        uye_id = EXCLUDED.uye_id; -- Üye değişmiş olabilir
        
      v_toplam_aidat_sayisi := v_toplam_aidat_sayisi + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'yillik_tanim', v_olusturulan_tanim,
    'olusturulan_aidat_sayisi', v_toplam_aidat_sayisi
  );
END $$ LANGUAGE plpgsql;
