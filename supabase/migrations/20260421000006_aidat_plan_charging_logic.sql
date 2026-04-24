-- Migration: 20260421000006_aidat_plan_charging_logic.sql
-- Description: Aidat planlama ve borçlandırma mantığını ayırır.

BEGIN;

-- 1. durum sütununu ekle
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'aidat_tanimlari' AND column_name = 'durum') THEN
        ALTER TABLE public.aidat_tanimlari ADD COLUMN durum VARCHAR(20) DEFAULT 'plan';
        ALTER TABLE public.aidat_tanimlari ADD CONSTRAINT aidat_tanimlari_durum_check CHECK (durum IN ('plan', 'borclandi'));
    END IF;
END $$;

-- 2. create_yillik_aidat_plani RPC fonksiyonunu güncelle
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
  v_ay INTEGER;
  v_tur VARCHAR(20);
  v_son_odeme_gunu INTEGER;
BEGIN
  -- Döngü ile her ay için tanım oluştur/güncelle
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_ay := (v_kalem->>'ay')::INTEGER;
    v_tur := COALESCE(v_kalem->>'tur', 'normal');
    v_son_odeme_gunu := COALESCE((v_kalem->>'son_odeme_gunu')::INTEGER, 15);
    
    -- Eğer ilgili tanım zaten varsa ve borçlandırılmışsa atla
    IF EXISTS (
      SELECT 1 FROM public.aidat_tanimlari 
      WHERE proje_id = p_proje_id AND yil = p_yil AND ay = v_ay AND tur = v_tur 
      AND durum = 'borclandi'
    ) THEN
      CONTINUE; 
    END IF;

    -- Tanımı UPSERT et
    INSERT INTO public.aidat_tanimlari (
      proje_id, yil, ay, katsayi_tutari, son_odeme_gunu, gecikme_faiz_orani, tur, aciklama, durum
    ) VALUES (
      p_proje_id, p_yil, v_ay, (v_kalem->>'katsayi_tutari')::NUMERIC, v_son_odeme_gunu, 
      COALESCE((v_kalem->>'gecikme_faiz_orani')::NUMERIC, 0), v_tur, v_kalem->>'aciklama', 'plan'
    )
    ON CONFLICT (proje_id, yil, ay, tur) 
    DO UPDATE SET 
      katsayi_tutari = EXCLUDED.katsayi_tutari,
      son_odeme_gunu = EXCLUDED.son_odeme_gunu,
      gecikme_faiz_orani = EXCLUDED.gecikme_faiz_orani,
      aciklama = EXCLUDED.aciklama,
      updated_at = now()
    WHERE aidat_tanimlari.durum = 'plan' -- Sadece plan durumundakileri güncellemeye izin ver
    RETURNING id INTO v_tanim_id;

    v_olusturulan_tanim := v_olusturulan_tanim + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'yillik_tanim_sayisi', v_olusturulan_tanim
  );
END $$ LANGUAGE plpgsql;

-- 3. fn_execute_aidat_charging fonksiyonunu oluştur
CREATE OR REPLACE FUNCTION public.fn_execute_aidat_charging(p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_daire RECORD;
    v_count INTEGER := 0;
    v_charged_definitions INTEGER := 0;
    v_year INTEGER;
    v_month INTEGER;
    v_son_odeme_tarihi DATE;
BEGIN
    v_year := EXTRACT(YEAR FROM p_date);
    v_month := EXTRACT(MONTH FROM p_date);

    FOR v_record IN 
        SELECT * FROM public.aidat_tanimlari
        WHERE durum = 'plan'
        AND (yil < v_year OR (yil = v_year AND ay <= v_month))
    LOOP
        v_son_odeme_tarihi := (v_record.yil::TEXT || '-' || v_record.ay::TEXT || '-' || v_record.son_odeme_gunu::TEXT)::DATE;

        -- Her daire (serefiye) için aidat kaydı oluştur
        FOR v_daire IN 
            SELECT id FROM public.serefiye_tablosu 
            WHERE proje_id = v_record.proje_id
        LOOP
            INSERT INTO public.aidatlar (
                proje_id, serefiye_id, uye_id, aidat_tanimi_id, son_odeme_tarihi
            )
            SELECT 
                v_record.proje_id, 
                v_daire.id, 
                (SELECT id FROM public.uyeler WHERE serefiye_id = v_daire.id AND durum = 'aktif' LIMIT 1),
                v_record.id,
                v_son_odeme_tarihi
            ON CONFLICT (serefiye_id, aidat_tanimi_id) DO NOTHING;
            
            v_count := v_count + 1;
        END LOOP;

        -- Tanım durumunu güncelle
        UPDATE public.aidat_tanimlari SET durum = 'borclandi', updated_at = NOW() WHERE id = v_record.id;
        v_charged_definitions := v_charged_definitions + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'charged_definitions', v_charged_definitions,
        'total_aidat_created', v_count
    );
END;
$$ LANGUAGE plpgsql;

-- 4. Borçlanmış kayıtların güncellenmesini engelleyen trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_update_on_borclandi()
RETURNS TRIGGER AS $$
BEGIN
    -- Eğer eski durum 'borclandi' ise ve biz durum dışındaki kolonları veya durumu değiştirmeye çalışıyorsak engelle
    -- Not: 'plan' -> 'borclandi' geçişine izin verilmeli (fn_execute_aidat_charging içinde yapılıyor)
    IF OLD.durum = 'borclandi' THEN
        RAISE EXCEPTION 'Borçlandırılmış aidat tanımları üzerinde değişiklik yapılamaz.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_update_on_borclandi ON public.aidat_tanimlari;
CREATE TRIGGER trg_prevent_update_on_borclandi
BEFORE UPDATE ON public.aidat_tanimlari
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_update_on_borclandi();

-- 5. Mevcut kayıtları 'borclandi' olarak işaretle
-- (Sistem şu an borçlandırma yapmış varsayıldığı için tüm mevcut tanımlar borçlandırıldı sayılır)
UPDATE public.aidat_tanimlari SET durum = 'borclandi' WHERE durum = 'plan';

COMMIT;
