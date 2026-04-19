-- Migration: 20260420000009_fix_aidat_creation_logic.sql
-- Description: Update RPC and service logic to stop inserting into dropped columns (tutar, odenen_tutar).

BEGIN;

-- 1. Update RPC function to remove 'tutar' from INSERT
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
BEGIN
  -- Döngü ile her ay için tanım oluştur/güncelle
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_ay := (v_kalem->>'ay')::INTEGER;
    v_tur := COALESCE(v_kalem->>'tur', 'normal');
    v_son_odeme_gunu := COALESCE((v_kalem->>'son_odeme_gunu')::INTEGER, 15);
    
    -- Ödeme kontrolü (Bu spesifik tanım için ödeme var mı?)
    IF EXISTS (
      SELECT 1 FROM aidatlar a
      JOIN aidat_tanimlari at ON a.aidat_tanimi_id = at.id
      WHERE at.proje_id = p_proje_id AND at.yil = p_yil AND at.ay = v_ay AND at.tur = v_tur
      -- odenen_tutar yerine artık dinamik kontrol veya durum kontrolü yapıyoruz
      AND (a.durum = 'odendi')
    ) THEN
      CONTINUE; 
    END IF;

    -- Tanımı UPSERT et
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

    -- Her daire için aidat kaydı oluştur/güncelle (Tutar artık burada yok, dinamik hesaplanıyor)
    FOR v_daire IN SELECT id FROM public.serefiye_tablosu WHERE proje_id = p_proje_id
    LOOP
      SELECT id INTO v_uye_id FROM public.uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1;
      
      INSERT INTO public.aidatlar (
        proje_id, serefiye_id, uye_id, aidat_tanimi_id, son_odeme_tarihi
      ) VALUES (
        p_proje_id, v_daire.id, v_uye_id, v_tanim_id, v_son_odeme_tarihi
      )
      ON CONFLICT (serefiye_id, aidat_tanimi_id)
      DO UPDATE SET
        son_odeme_tarihi = EXCLUDED.son_odeme_tarihi,
        uye_id = EXCLUDED.uye_id;
        
      v_toplam_aidat_sayisi := v_toplam_aidat_sayisi + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'yillik_tanim', v_olusturulan_tanim,
    'olusturulan_aidat_sayisi', v_toplam_aidat_sayisi
  );
END $$ LANGUAGE plpgsql;

COMMIT;
