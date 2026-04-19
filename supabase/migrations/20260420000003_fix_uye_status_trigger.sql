-- Migration: 20260420000003_fix_uye_status_trigger.sql
-- Description: Update status trigger to remove reference to deleted daire_no column.

CREATE OR REPLACE FUNCTION public.func_uye_durum_degisti_daire_bosalt()
RETURNS TRIGGER AS $$
BEGIN
  -- Üye aktif durumdan çıktığında (pasif, ihraç vb.) daireyi şerefiye tablosunda boşalt
  IF NEW.durum != 'aktif' AND OLD.durum = 'aktif' THEN
    IF OLD.serefiye_id IS NOT NULL THEN
        UPDATE public.serefiye_tablosu SET durum = 'bos' WHERE id = OLD.serefiye_id;
    END IF;
    -- İlişkiyi kes
    NEW.serefiye_id := NULL;
    -- daire_no kolonu silindiği için buradaki atama kaldırıldı
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger zaten tanımlı olduğu için sadece fonksiyonu güncellemek yeterlidir.
-- Ancak trigger tanımını kontrol edip gerekirse yenileyebiliriz.
