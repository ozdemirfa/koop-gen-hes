-- Migration: 20260530000004_yonetim_ekibi.sql
-- Sprint: yonetim-ekibi (2026-05-30) — M2
-- Description: Yönetim ekibi (management team) tabloları + RLS.
--   - yonetim_ekibi: proje bazlı, STANDALONE yönetim carileri (cari_hesaplar'a
--     bağlanmaz). ad_soyad + oran (huzur hakkı payı %) + borc/alacak koşan toplam.
--   - yonetim_huzur_hakki_kayitlari: hakediş × üye bazlı huzur hakkı defteri
--     (onay anında yazılır; onay-iptal'de bu kayıtlardan tam tutar geri alınır —
--     oranlar sonradan değişse bile tersine alma doğru kalır).
-- RLS deseni: 20260520000013_role_v2_rls_refactor.sql + offline guard
--   (20260526210000): is_project_user (select/insert/update) +
--   is_project_manager (delete) + can_write_offline_project.

BEGIN;

-- ─── 1. yonetim_ekibi ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.yonetim_ekibi (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id    UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  ad_soyad    VARCHAR(255) NOT NULL,
  oran        INTEGER NOT NULL DEFAULT 0 CHECK (oran BETWEEN 0 AND 100),
  borc        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  alacak      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yonetim_ekibi_proje_id ON public.yonetim_ekibi(proje_id);

COMMENT ON TABLE public.yonetim_ekibi IS
  'Proje bazlı yönetim ekibi carileri (standalone — cari_hesaplar''a bağlı değil). '
  'oran: girilen huzur hakkı payı (0-100); dağıtımda proje toplamına göre normalize edilir. '
  'borc: hakedişlerden hak edilen huzur hakkı toplamı; alacak: yapılan ödemeler. '
  'bakiye = borc - alacak (pozitif = üyeye borçluyuz).';

ALTER TABLE public.yonetim_ekibi ENABLE ROW LEVEL SECURITY;

CREATE POLICY yonetim_ekibi_select ON public.yonetim_ekibi
  FOR SELECT TO authenticated
  USING (public.is_project_user(proje_id));

CREATE POLICY yonetim_ekibi_insert ON public.yonetim_ekibi
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

CREATE POLICY yonetim_ekibi_update ON public.yonetim_ekibi
  FOR UPDATE TO authenticated
  USING (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  )
  WITH CHECK (
    public.is_project_user(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

CREATE POLICY yonetim_ekibi_delete ON public.yonetim_ekibi
  FOR DELETE TO authenticated
  USING (
    public.is_project_manager(proje_id)
    AND public.can_write_offline_project(proje_id)
  );

-- ─── 2. yonetim_huzur_hakki_kayitlari (audit/reversal defteri) ────────────────
CREATE TABLE IF NOT EXISTS public.yonetim_huzur_hakki_kayitlari (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id        UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  hakedis_id      UUID NOT NULL REFERENCES public.hakedisler(id) ON DELETE CASCADE,
  yonetim_id      UUID NOT NULL REFERENCES public.yonetim_ekibi(id) ON DELETE CASCADE,
  tutar           NUMERIC(14, 2) NOT NULL,   -- bu hakediş için üyeye eklenen tam borç payı
  normalized_oran NUMERIC(9, 6) NOT NULL,    -- audit: onay anındaki normalize oran
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_yhhk_hakedis_yonetim UNIQUE (hakedis_id, yonetim_id)
);

CREATE INDEX IF NOT EXISTS idx_yhhk_hakedis ON public.yonetim_huzur_hakki_kayitlari(hakedis_id);
CREATE INDEX IF NOT EXISTS idx_yhhk_yonetim ON public.yonetim_huzur_hakki_kayitlari(yonetim_id);
CREATE INDEX IF NOT EXISTS idx_yhhk_proje ON public.yonetim_huzur_hakki_kayitlari(proje_id);

COMMENT ON TABLE public.yonetim_huzur_hakki_kayitlari IS
  'Hakediş onayında yönetim ekibine dağıtılan huzur hakkı defteri (hakedis × üye). '
  'Onay-iptal''de bu satırların tutar''ı yonetim_ekibi.borc''tan düşülür → oranlar '
  'sonradan değişse bile tersine alma birebir doğru. Yalnız SECURITY DEFINER RPC yazar.';

ALTER TABLE public.yonetim_huzur_hakki_kayitlari ENABLE ROW LEVEL SECURITY;

-- SELECT açık (üye okuyabilir). Mutasyonlar yalnız SECURITY DEFINER RPC /
-- service-role üzerinden yapılır (authenticated için direct write yok).
CREATE POLICY yonetim_huzur_hakki_kayitlari_select ON public.yonetim_huzur_hakki_kayitlari
  FOR SELECT TO authenticated
  USING (public.is_project_user(proje_id));

COMMIT;
