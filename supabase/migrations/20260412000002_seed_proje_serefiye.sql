-- Örnek Proje Ekle ve Blokları/Şerefiyeyi bağla
DO $$
DECLARE
  v_proje_id UUID;
  b UUID;
BEGIN
  -- Eğer hiç 'devam_ediyor' proje yoksa oluştur
  IF NOT EXISTS (SELECT 1 FROM projeler WHERE aktif = true) THEN
    INSERT INTO projeler (proje_adi, baslangic_tarihi, bitis_tarihi, aktif)
    VALUES ('Varsayılan E2E Projesi', CURRENT_DATE, CURRENT_DATE + interval '2 year', true)
    RETURNING id INTO v_proje_id;

    -- Mevcut blokları bu projeye bağla
    UPDATE bloklar SET proje_id = v_proje_id WHERE proje_id IS NULL;

    -- Şerefiye tablosunu boş dairelerle doldur
    FOR b IN SELECT id FROM bloklar WHERE proje_id = v_proje_id LOOP
      INSERT INTO serefiye_tablosu (proje_id, blok_id, daire_sira_no, daire_no, serefiye_orani, durum)
      VALUES 
      (v_proje_id, b, 1, 'D.1', 1.000, 'bos'),
      (v_proje_id, b, 2, 'D.2', 1.000, 'bos'),
      (v_proje_id, b, 3, 'D.3', 1.000, 'bos'),
      (v_proje_id, b, 4, 'D.4', 1.000, 'bos');
    END LOOP;
  END IF;
END $$;
