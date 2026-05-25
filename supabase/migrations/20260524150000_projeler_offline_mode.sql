-- Migration: 20260524150000_projeler_offline_mode.sql
-- Sprint: desktop-offline-mode — 2026-05-24
-- Description:
--   projeler tablosuna offline_mode bayrağı + audit kolonları eklenir.
--   Owner çevrimdışı moda aldığında:
--     - offline_mode = true, offline_mode_owner_id = <owner_id>, offline_mode_set_at = now()
--     - Diğer kullanıcılar (web/desktop) UI'da write butonlarını disable görür
--     - Yalnız owner bu projeyi güncelleyebilir (RLS + middleware iki kat)
--   Owner online'a döndüğünde pending writes flush'tan sonra flag false'a çekilir.
--
-- Yeni RLS kuralı: projeler_update_offline_lock
--   offline_mode = true && auth.uid() != offline_mode_owner_id ise UPDATE engellenir.
--   Aşağıdaki write-heavy tablolar için de proje bazlı guard helper eklenir:
--   uyeler, aidatlar, banka_hareketleri, odemeler, faturalar, …
--   Bu PR'da YALNIZ projeler tablosu için flag + helper + flag policy eklenir;
--   alt tablolarda guard ileri PR'da (v0.4 — pending queue) eklenir.
--
-- Bağımlılıklar:
--   20260520000010_role_v2_expand.sql  → is_project_owner(p_proje_id)
--   20260407130100_core_and_uyeler.sql → projeler tablosu

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Kolonlar
-- ---------------------------------------------------------------------------

ALTER TABLE public.projeler
  ADD COLUMN IF NOT EXISTS offline_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offline_mode_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offline_mode_set_at timestamptz;

COMMENT ON COLUMN public.projeler.offline_mode IS
  'true ise proje çevrimdışı modda — yalnızca offline_mode_owner_id güncelleyebilir. desktop-offline-mode sprint, 2026-05-24.';
COMMENT ON COLUMN public.projeler.offline_mode_owner_id IS
  'Çevrimdışı modu açan owner. NULL ise mod kapalı. ON DELETE SET NULL — user silinirse flag temizlenir (online sayılır).';
COMMENT ON COLUMN public.projeler.offline_mode_set_at IS
  'offline_mode son değişim zamanı. Audit + stale-lock tespiti için.';

-- ---------------------------------------------------------------------------
-- 2. Helper: çevrimdışı projede yazma izni var mı?
-- ---------------------------------------------------------------------------
-- Çevrimdışı modda yazma izni: ya offline değil, ya da çağıran offline_mode_owner_id.
-- Global admin her durumda yazabilir (legacy davranış korunur).

CREATE OR REPLACE FUNCTION public.can_write_offline_project(p_proje_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR NOT EXISTS (
      SELECT 1 FROM public.projeler p
      WHERE p.id = p_proje_id
        AND p.offline_mode = true
        AND (p.offline_mode_owner_id IS NULL OR p.offline_mode_owner_id <> auth.uid())
    );
$$;

COMMENT ON FUNCTION public.can_write_offline_project(uuid) IS
  'Çağıran kullanıcı bu projede write yapabilir mi? offline_mode aktifse yalnız '
  'offline_mode_owner_id veya global admin true döner. RLS write policy''lerinde '
  'AND clause olarak kullanılır. desktop-offline-mode sprint, 2026-05-24.';

GRANT EXECUTE ON FUNCTION public.can_write_offline_project(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. projeler UPDATE policy — offline lock
-- ---------------------------------------------------------------------------
-- Mevcut projeler_update policy'sini DROP edip yeniden yaratıyoruz; offline
-- lock'u USING/WITH CHECK clause'larına AND'liyoruz. Önceki kural (owner+) yine
-- geçerli; sadece offline modda non-owner UPDATE'leri tamamen engellenir.

DROP POLICY IF EXISTS projeler_update ON public.projeler;

CREATE POLICY projeler_update ON public.projeler
  FOR UPDATE TO authenticated
  USING (
    public.is_project_owner(id) OR public.is_admin()
  )
  WITH CHECK (
    (public.is_project_owner(id) OR public.is_admin())
    AND public.can_write_offline_project(id)
  );

COMMENT ON POLICY projeler_update ON public.projeler IS
  'Proje meta güncelleme: owner + global admin. offline_mode aktif iken yalnız '
  'offline_mode_owner_id geçer. desktop-offline-mode sprint, 2026-05-24.';

-- ---------------------------------------------------------------------------
-- 4. Audit trigger — offline_mode_set_at otomatik güncelle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_projeler_offline_mode_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.offline_mode IS DISTINCT FROM OLD.offline_mode THEN
    NEW.offline_mode_set_at := now();
    IF NEW.offline_mode = true AND NEW.offline_mode_owner_id IS NULL THEN
      NEW.offline_mode_owner_id := auth.uid();
    END IF;
    IF NEW.offline_mode = false THEN
      -- Online'a dönüşte owner referansı temizlenir; bir sonraki offline'da yeniden set.
      NEW.offline_mode_owner_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projeler_offline_mode_audit ON public.projeler;

CREATE TRIGGER trg_projeler_offline_mode_audit
  BEFORE UPDATE ON public.projeler
  FOR EACH ROW
  WHEN (NEW.offline_mode IS DISTINCT FROM OLD.offline_mode)
  EXECUTE FUNCTION public.trg_projeler_offline_mode_audit();

COMMIT;
