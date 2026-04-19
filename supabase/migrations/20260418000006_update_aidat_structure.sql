-- Migration: 20260418000006_update_aidat_structure.sql
-- Aidatların üyeden bağımsız olarak daireye (serefiye_id) göre takip edilebilmesini sağlar.

-- 1. aidatlar tablosuna serefiye_id ekle ve uye_id'yi opsiyonel yap
ALTER TABLE public.aidatlar ADD COLUMN IF NOT EXISTS serefiye_id UUID REFERENCES public.serefiye_tablosu(id) ON DELETE SET NULL;
ALTER TABLE public.aidatlar ALTER COLUMN uye_id DROP NOT NULL;

-- 2. Mevcut kısıtlamayı (UNIQUE(uye_id, aidat_tanimi_id)) güncelle
-- Artık benzersizlik daire ve tanım arasında olmalı
ALTER TABLE public.aidatlar DROP CONSTRAINT IF EXISTS aidatlar_uye_id_aidat_tanimi_id_key;
ALTER TABLE public.aidatlar ADD CONSTRAINT aidatlar_serefiye_id_aidat_tanimi_id_key UNIQUE (serefiye_id, aidat_tanimi_id);

-- 3. Yıllık plan oluşturma RPC'sini güncelle
-- Artık sadece üyeler için değil, tüm daireler (serefiye_tablosu) için aidat üretir
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
  v_olusturulan_aidat INTEGER := 0;
  v_total_aidat_created INTEGER := 0;
  v_son_odeme_tarihi DATE;
  v_son_odeme_gunu INTEGER;
  v_ay INTEGER;
  v_daire RECORD;
  v_uye_id UUID;
BEGIN
  -- 1. Ödeme kontrolü (aynı yıl/proje)
  IF EXISTS (
    SELECT 1 FROM aidatlar a
    JOIN aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    WHERE at.proje_id = p_proje_id AND at.yil = p_yil AND at.tur = 'normal'
    AND (a.durum = 'odendi' OR a.odenen_tutar > 0)
  ) THEN
    RAISE EXCEPTION 'Bu yıla ait ödeme yapılmış aidatlar bulunduğu için plan güncellenemez. Lütfen manuel düzenleme yapın.';
  END IF;

  -- 2. Eski tanımları sil (cascade ile aidatlar da gider)
  DELETE FROM aidat_tanimlari WHERE proje_id = p_proje_id AND yil = p_yil AND tur = 'normal';

  -- 3. Döngü ile her ay için tanım oluştur
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_ay := (v_kalem->>'ay')::INTEGER;
    v_son_odeme_gunu := COALESCE((v_kalem->>'son_odeme_gunu')::INTEGER, 15);

    INSERT INTO aidat_tanimlari (
      proje_id, yil, ay, katsayi_tutari, son_odeme_gunu, gecikme_faiz_orani, tur, aciklama
    ) VALUES (
      p_proje_id, p_yil, v_ay, (v_kalem->>'katsayi_tutari')::NUMERIC, v_son_odeme_gunu, 
      COALESCE((v_kalem->>'gecikme_faiz_orani')::NUMERIC, 0), 'normal', v_kalem->>'aciklama'
    ) RETURNING id INTO v_tanim_id;

    v_olusturulan_tanim := v_olusturulan_tanim + 1;
    v_son_odeme_tarihi := (p_yil::TEXT || '-' || v_ay::TEXT || '-' || v_son_odeme_gunu::TEXT)::DATE;

    -- 4. Her daire (serefiye) için aidat kaydı oluştur
    FOR v_daire IN SELECT id, serefiye_orani FROM serefiye_tablosu WHERE proje_id = p_proje_id
    LOOP
      -- Dairede oturan aktif üyeyi bul (varsa)
      SELECT id INTO v_uye_id FROM uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1;

      INSERT INTO aidatlar (
        proje_id, serefiye_id, uye_id, aidat_tanimi_id, tutar, son_odeme_tarihi
      ) VALUES (
        p_proje_id, v_daire.id, v_uye_id, v_tanim_id,
        (v_kalem->>'katsayi_tutari')::NUMERIC * COALESCE(v_daire.serefiye_orani, 1.00),
        v_son_odeme_tarihi
      );
      v_olusturulan_aidat := v_olusturulan_aidat + 1;
    END LOOP;
    
    v_total_aidat_created := v_total_aidat_created + v_olusturulan_aidat;
    v_olusturulan_aidat := 0;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'yillik_tanim', v_olusturulan_tanim,
    'olusturulan_aidat_sayisi', v_total_aidat_created
  );
END $$ LANGUAGE plpgsql;
