-- Davet akışı yeniden tasarımı
-- Spec: docs/superpowers/specs/2026-05-21-invitation-flow-design.md
--
-- Yeni invitations tablosu pending davetleri tutar; proje_uyelikleri dokunulmaz,
-- yalnız kabul edilen davetler oraya INSERT eder. Bu sayede mevcut RLS
-- (is_project_member) pending kullanıcıları otomatik olarak engelliyor.
--
-- İki akış tek tabloda:
--   1. Yeni kullanıcı: token + otp_hash dolu, user_id NULL
--   2. Kayıtlı kullanıcı: token + otp_hash NULL, user_id mevcut

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id      UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  email         CITEXT NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_role  VARCHAR(16) NOT NULL CHECK (invited_role IN ('manager','user')),
  invited_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- "Yeni kullanıcı" akışı için; kayıtlı kullanıcıda NULL
  token         TEXT UNIQUE,
  otp_hash      TEXT,
  attempt_count INT NOT NULL DEFAULT 0,

  status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected','expired')),

  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  rejected_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at otomatik dolsun (mevcut public.update_updated_at trigger fonksiyonu,
-- supabase/migrations/20260407130800_rls_and_functions.sql)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Aynı (proje, email) için aktif birden fazla pending davet engellensin
CREATE UNIQUE INDEX uniq_invite_active
  ON public.invitations (proje_id, email)
  WHERE status = 'pending';

CREATE INDEX idx_invite_user_pending
  ON public.invitations (user_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_invite_proje_status
  ON public.invitations (proje_id, status);

CREATE INDEX idx_invite_token
  ON public.invitations (token)
  WHERE token IS NOT NULL;

-- RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Owner/manager kendi projesinin davetlerini görür.
-- is_project_manager(p_proje_id) helper'ı owner VEYA manager için TRUE döner
-- (supabase/migrations/20260520000010_role_v2_expand.sql)
CREATE POLICY invitations_read_owner_manager
  ON public.invitations FOR SELECT
  USING (public.is_project_manager(proje_id));

-- Kullanıcı kendi user_id'sine ait davetleri görür (banner sorgusu).
CREATE POLICY invitations_read_self
  ON public.invitations FOR SELECT
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE service-role üzerinden (anon erişim yok).
-- Public accept-by-token endpoint backend service-role kullanır.

COMMENT ON TABLE public.invitations IS
  'Proje üyelik davetleri (yeni + kayıtlı kullanıcı). Spec: 2026-05-21-invitation-flow-design.md';
