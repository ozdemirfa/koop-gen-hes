-- RLS - Tüm tablolarda authenticated kullanıcılara tam erişim
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    
    -- Önce policy varsa temizle ki tekrar çalıştırmada hata vermesin
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON public.%I', tbl);
    
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON public.%I FOR ALL USING (auth.role() = ''authenticated'')',
      tbl
    );
  END LOOP;
END $$;

-- updated_at trigger fonksiyonu
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at trigger'ını tüm ilgili tablolara uygula
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
    GROUP BY table_name
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl
    );
  END LOOP;
END $$;

-- Gecikme faizi hesaplama fonksiyonu
CREATE OR REPLACE FUNCTION hesapla_gecikme_faizi()
RETURNS void AS $$
BEGIN
  UPDATE aidatlar a
  SET
    gecikme_faizi = CASE
      WHEN a.durum IN ('bekliyor', 'gecikti') AND a.son_odeme_tarihi < CURRENT_DATE THEN
        a.tutar * (
          SELECT COALESCE(at.gecikme_faiz_orani, 0) / 100
          FROM aidat_tanimlari at WHERE at.id = a.aidat_tanimi_id
        ) * GREATEST(EXTRACT(MONTH FROM age(CURRENT_DATE, a.son_odeme_tarihi)), 1)
      ELSE a.gecikme_faizi
    END,
    durum = CASE
      WHEN a.durum = 'bekliyor' AND a.son_odeme_tarihi < CURRENT_DATE THEN 'gecikti'::aidat_durumu
      ELSE a.durum
    END;
END;
$$ LANGUAGE plpgsql;

-- Kasa durumu view
CREATE OR REPLACE VIEW public.kasa_durumu AS
SELECT
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gelir') +
  (SELECT COALESCE(SUM(odenen_tutar), 0) FROM aidatlar) AS toplam_gelir,
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gider') AS toplam_gider,
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gelir') +
  (SELECT COALESCE(SUM(odenen_tutar), 0) FROM aidatlar) -
  (SELECT COALESCE(SUM(tutar), 0) FROM gelir_giderler WHERE tip = 'gider') AS net_bakiye;
