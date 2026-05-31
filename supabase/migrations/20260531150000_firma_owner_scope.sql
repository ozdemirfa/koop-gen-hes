-- Migration: 20260531150000_firma_owner_scope.sql
-- Owner-bazlı firma modeli.
--   Bugüne kadar firmalar GLOBAL'di (proje/owner bağı yok) ve her firma
--   fn_auto_create_cari_hesap_for_firma() ile TÜM projelere cari olarak
--   açılıyordu → bir owner'ın firması başka owner'ların projelerinde de
--   görünüyordu.
--
--   Yeni model: firma bir owner'a (auth.users) bağlanır. Firma, owner'ının
--   TÜM projelerinde cari olarak görünür; başka owner'ların projelerinde
--   GÖRÜNMEZ. Cari hareketler proje bazında ayrı kalır (mevcut cari_hesaplar
--   (proje_id, firma_id) yapısı). Aynı isimli firma farklı owner'larda ayrı
--   kayıt; aynı owner'da tek kayıt (unique owner_id+unvan+firma_tipi).
--
-- NOT: İdempotent yazıldı (IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE /
--   DROP POLICY IF EXISTS) → deploy workflow'unda tekrar çalıştırmak güvenli.

BEGIN;

-- 1. owner_id kolonu
ALTER TABLE public.firmalar
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Backfill: her firmayı aktivitesinin (fatura / sözleşme / cari hareket)
--    bulunduğu projenin owner'ına ata. Tek owner aktivitesi olan firma için
--    tek owner atar; birden çok owner varsa deterministik ilk owner (sonradan
--    manuel bölme gerekebilir — mevcut veride çoklu owner yok).
WITH firma_owner AS (
  SELECT DISTINCT ON (akt.firma_id) akt.firma_id, po.user_id AS owner_id
  FROM (
    SELECT firma_id, proje_id FROM public.faturalar  WHERE firma_id IS NOT NULL
    UNION
    SELECT firma_id, proje_id FROM public.sozlesmeler WHERE firma_id IS NOT NULL
    UNION
    SELECT c.firma_id, c.proje_id
      FROM public.cari_hareketler ch
      JOIN public.cari_hesaplar c ON c.id = ch.cari_hesap_id
      WHERE c.cari_turu = 'firma' AND c.firma_id IS NOT NULL
  ) akt
  JOIN public.proje_uyelikleri po ON po.proje_id = akt.proje_id AND po.rol = 'owner'
  ORDER BY akt.firma_id, po.user_id
)
UPDATE public.firmalar f
SET owner_id = fo.owner_id
FROM firma_owner fo
WHERE f.id = fo.firma_id AND f.owner_id IS NULL;

-- 3. Aktivitesiz (owner atanamayan) firmaları sil — bağlı cari_hesaplar CASCADE.
DELETE FROM public.firmalar WHERE owner_id IS NULL;

-- 4. Cross-join artığı firma carilerini sil: firmanın owner'ına AİT OLMAYAN
--    projelerdeki firma cari_hesapları kaldırılır. (Bağlı cari_hareketler CASCADE;
--    artık carilerde hareket yoktur — hareketler owner projesinde kalır.)
DELETE FROM public.cari_hesaplar c
WHERE c.cari_turu = 'firma'
  AND NOT EXISTS (
    SELECT 1
    FROM public.firmalar f
    JOIN public.proje_uyelikleri po ON po.user_id = f.owner_id AND po.rol = 'owner'
    WHERE f.id = c.firma_id AND po.proje_id = c.proje_id
  );

-- 5. owner_id artık zorunlu
ALTER TABLE public.firmalar ALTER COLUMN owner_id SET NOT NULL;

-- 6. Aynı owner'da aynı ünvan+tip tek firma (farklı owner ayrı kayıt)
CREATE UNIQUE INDEX IF NOT EXISTS uq_firmalar_owner_unvan_tip
  ON public.firmalar (owner_id, unvan, firma_tipi);

CREATE INDEX IF NOT EXISTS idx_firmalar_owner_id ON public.firmalar (owner_id);

-- 7. Auto-create cari trigger: TÜM projeler yerine yalnız owner'ın projelerine
--    cari aç. (Trigger tanımı aynı; yalnız fonksiyon gövdesi değişti.)
CREATE OR REPLACE FUNCTION public.fn_auto_create_cari_hesap_for_firma()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, firma_id)
    SELECT pu.proje_id, NEW.unvan, 'firma', NEW.id
    FROM public.proje_uyelikleri pu
    WHERE pu.user_id = NEW.owner_id AND pu.rol = 'owner'
    ON CONFLICT (proje_id, firma_id) DO UPDATE
    SET cari_adi = EXCLUDED.cari_adi;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7b. Owner yeni bir projenin sahibi olduğunda (proje_uyelikleri rol='owner'
--     insert), o owner'ın mevcut TÜM firmaları için yeni projede cari aç.
--     Böylece owner sonradan proje eklese de firmaları o projede de listelenir.
CREATE OR REPLACE FUNCTION public.fn_auto_create_firma_cari_for_owner_project()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rol = 'owner' THEN
        INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, firma_id)
        SELECT NEW.proje_id, f.unvan, 'firma', f.id
        FROM public.firmalar f
        WHERE f.owner_id = NEW.user_id
        ON CONFLICT (proje_id, firma_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_firma_cari_for_owner_project ON public.proje_uyelikleri;
CREATE TRIGGER trg_firma_cari_for_owner_project
AFTER INSERT ON public.proje_uyelikleri
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_firma_cari_for_owner_project();

-- 8. RLS — owner-bazlı görünürlük. (Backend supabaseAdmin ile RLS'i bypass
--    eder; bu politikalar defense-in-depth.)
DROP POLICY IF EXISTS "Admins have full access" ON public.firmalar;
DROP POLICY IF EXISTS "Staff can read all" ON public.firmalar;
DROP POLICY IF EXISTS firmalar_select ON public.firmalar;
DROP POLICY IF EXISTS firmalar_modify ON public.firmalar;

-- SELECT: admin, firmanın owner'ı, ya da owner'ın projelerinden birinin üyesi.
CREATE POLICY firmalar_select ON public.firmalar
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.proje_uyelikleri pu
      JOIN public.proje_uyelikleri po
        ON po.proje_id = pu.proje_id AND po.rol = 'owner'
      WHERE pu.user_id = auth.uid() AND po.user_id = firmalar.owner_id
    )
  );

-- INSERT/UPDATE/DELETE: admin, firmanın owner'ı, ya da owner'ın bir projesinde
-- owner/manager olan kullanıcı.
CREATE POLICY firmalar_modify ON public.firmalar
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.proje_uyelikleri pu
      JOIN public.proje_uyelikleri po
        ON po.proje_id = pu.proje_id AND po.rol = 'owner'
      WHERE pu.user_id = auth.uid()
        AND pu.rol IN ('owner','manager')
        AND po.user_id = firmalar.owner_id
    )
  )
  WITH CHECK (
    public.is_admin()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.proje_uyelikleri pu
      JOIN public.proje_uyelikleri po
        ON po.proje_id = pu.proje_id AND po.rol = 'owner'
      WHERE pu.user_id = auth.uid()
        AND pu.rol IN ('owner','manager')
        AND po.user_id = firmalar.owner_id
    )
  );

COMMIT;
