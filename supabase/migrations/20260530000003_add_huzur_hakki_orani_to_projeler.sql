-- Migration: 20260530000003_add_huzur_hakki_orani_to_projeler.sql
-- Sprint: yonetim-ekibi (2026-05-30) — M1
-- Description: projeler tablosuna huzur_hakki_orani kolonu ekler.
--   Hakediş onayında yönetim ekibine dağıtılacak huzur hakkı yüzdesi.
--   Tam sayı, 0-100 arası (% ondalıksız — kullanıcı talebi).
-- Desen: 20260407160000_update_projeler_fields.sql

ALTER TABLE public.projeler
  ADD COLUMN IF NOT EXISTS huzur_hakki_orani INTEGER NOT NULL DEFAULT 0
    CHECK (huzur_hakki_orani BETWEEN 0 AND 100);

COMMENT ON COLUMN public.projeler.huzur_hakki_orani IS
  'Hakediş onayında yönetim ekibine dağıtılacak huzur hakkı yüzdesi (0-100, tam sayı). '
  'huzur_hakki_tutari = hakedis_toplam (KDV dahil) * huzur_hakki_orani / 100; '
  'yönetim oranlarına göre normalize edilerek dağıtılır.';
