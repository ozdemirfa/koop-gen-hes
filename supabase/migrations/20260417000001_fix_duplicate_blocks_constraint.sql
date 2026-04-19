-- Fix duplicates before adding constraint
DO $$
BEGIN
    -- 1. Üyeleri aynı isimli bloklardan bir tanesine (en eski/ilk olana) taşı
    UPDATE public.uyeler u
    SET blok_id = target.id
    FROM (
      SELECT DISTINCT ON (proje_id, blok_adi) id, proje_id, blok_adi
      FROM public.bloklar
      ORDER BY proje_id, blok_adi, created_at ASC, id ASC
    ) target
    JOIN public.bloklar b ON b.proje_id = target.proje_id AND b.blok_adi = target.blok_adi
    WHERE u.blok_id = b.id AND u.blok_id != target.id;

    -- 2. Diğer tabloları da güncelle (Eğer blok_id kullanan başka tablolar varsa)
    -- serefiye_tablosu
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'serefiye_tablosu') THEN
        UPDATE public.serefiye_tablosu s
        SET blok_id = target.id
        FROM (
          SELECT DISTINCT ON (proje_id, blok_adi) id, proje_id, blok_adi
          FROM public.bloklar
          ORDER BY proje_id, blok_adi, created_at ASC, id ASC
        ) target
        JOIN public.bloklar b ON b.proje_id = target.proje_id AND b.blok_adi = target.blok_adi
        WHERE s.blok_id = b.id AND s.blok_id != target.id;
    END IF;

    -- 3. Mükerrer blokları sil (en eski olanı tut, diğerlerini sil)
    DELETE FROM public.bloklar a
    WHERE a.id NOT IN (
        SELECT DISTINCT ON (proje_id, blok_adi) id
        FROM public.bloklar
        ORDER BY proje_id, blok_adi, created_at ASC, id ASC
    );
END $$;

-- 4. Artık kısıtlamayı ekleyebiliriz
ALTER TABLE public.bloklar DROP CONSTRAINT IF EXISTS unique_proje_blok_adi;
ALTER TABLE public.bloklar ADD CONSTRAINT unique_proje_blok_adi UNIQUE (proje_id, blok_adi);
