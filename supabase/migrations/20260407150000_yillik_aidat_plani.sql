-- 1. `tur` kodunu ekle ve 'normal', 'ara_odeme' ile sınırla
ALTER TABLE aidat_tanimlari ADD COLUMN tur VARCHAR(20) DEFAULT 'normal' NOT NULL CHECK (tur IN ('normal', 'ara_odeme'));

-- 2. Mevcut `tutar` kolonunun adını `katsayi_tutari` yap
ALTER TABLE aidat_tanimlari RENAME COLUMN tutar TO katsayi_tutari;

-- 3. UNIQUE (yil, ay) kısıtlamasını kaldir (Ocak ayında hem normal hem ara ödeme olabilmesi için)
DO $$
DECLARE 
  c_name RECORD;
BEGIN
  -- Tablodaki UNIQUE constraint isimlerini bulup döngüde siliyoruz
  FOR c_name IN 
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name = 'aidat_tanimlari' AND constraint_type = 'UNIQUE'
  LOOP
    EXECUTE 'ALTER TABLE aidat_tanimlari DROP CONSTRAINT ' || c_name.constraint_name;
  END LOOP;
END $$;
