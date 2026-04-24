-- Migration: 20260421000005_add_uye_id_to_serefiye.sql
-- Description: Add uye_id to serefiye_tablosu and ensure 1:1 member-unit relationship.

BEGIN;

-- 1. Add uye_id column to serefiye_tablosu
ALTER TABLE public.serefiye_tablosu 
ADD COLUMN IF NOT EXISTS uye_id UUID REFERENCES public.uyeler(id) ON DELETE SET NULL;

-- 2. Ensure each member can be assigned to at most one unit (One unit per member)
-- Each row represents a unit, so adding a UNIQUE constraint on uye_id enforces 1:1.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'serefiye_tablosu_uye_id_key'
    ) THEN
        ALTER TABLE public.serefiye_tablosu ADD CONSTRAINT serefiye_tablosu_uye_id_key UNIQUE (uye_id);
    END IF;
END $$;

-- 3. Sync existing data from uyeler.serefiye_id to serefiye_tablosu.uye_id
-- We only sync where it's currently linked in the members table.
UPDATE public.serefiye_tablosu s
SET uye_id = u.id,
    durum = CASE WHEN u.durum = 'aktif' THEN 'dolu' ELSE s.durum END,
    updated_at = NOW()
FROM public.uyeler u
WHERE s.id = u.serefiye_id;

-- 4. Review and enforce 1:1 consistency on the legacy column (uyeler.serefiye_id)
-- Each unit can have at most one member. (One member per unit)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uyeler_serefiye_id_key'
    ) THEN
        ALTER TABLE public.uyeler ADD CONSTRAINT uyeler_serefiye_id_key UNIQUE (serefiye_id);
    END IF;
END $$;

-- 5. Update the member status trigger to handle the new relationship structure
-- This trigger clears the unit association when a member becomes inactive.
CREATE OR REPLACE FUNCTION public.func_uye_durum_degisti_daire_bosalt()
RETURNS TRIGGER AS $$
BEGIN
  -- Üye aktif durumdan çıktığında (pasif, ihraç vb.) daireyi şerefiye tablosunda boşalt
  IF NEW.durum != 'aktif' AND OLD.durum = 'aktif' THEN
    -- 1. Yeni yapı: Daireden üyeyi kaldır ve durumu boş yap
    UPDATE public.serefiye_tablosu 
    SET durum = 'bos', 
        uye_id = NULL,
        updated_at = NOW()
    WHERE uye_id = OLD.id;

    -- 2. Eski yapı: Geriye dönük uyumluluk için (kolon silinene kadar)
    IF OLD.serefiye_id IS NOT NULL THEN
        UPDATE public.serefiye_tablosu 
        SET durum = 'bos',
            updated_at = NOW()
        WHERE id = OLD.serefiye_id;
    END IF;
    NEW.serefiye_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Update the annual plan creation function to use the new relationship column
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
    
    -- Ödeme kontrolü
    IF EXISTS (
      SELECT 1 FROM aidatlar a
      JOIN aidat_tanimlari at ON a.aidat_tanimi_id = at.id
      WHERE at.proje_id = p_proje_id AND at.yil = p_yil AND at.ay = v_ay AND at.tur = v_tur
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

    -- Her daire için aidat kaydı oluştur/güncelle
    FOR v_daire IN SELECT id, uye_id FROM public.serefiye_tablosu WHERE proje_id = p_proje_id
    LOOP
      -- Yeni yapıdan üye ID'sini al
      v_uye_id := v_daire.uye_id;
      
      -- Geriye dönük uyumluluk: Eğer yeni yapıda üye yoksa ama eski yapıda aktif üye varsa
      IF v_uye_id IS NULL THEN
        SELECT id INTO v_uye_id FROM public.uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1;
      END IF;
      
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

-- 7. Add comments
COMMENT ON COLUMN public.serefiye_tablosu.uye_id IS 'Bu daireye atanan üye. (1:1 ilişki, UNIQUE)';

COMMIT;
