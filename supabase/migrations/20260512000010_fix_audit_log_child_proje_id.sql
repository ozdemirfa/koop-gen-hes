-- Migration: 20260512000010_fix_audit_log_child_proje_id.sql
-- Description: Audit trigger child-table proje_id resolution + audit_logs.proje_id NULLABLE.
--
-- Bug:
--   audit_logs.proje_id 20260511000007 ile NOT NULL yapildi. fn_audit_log()
--   trigger fonksiyonu proje_id'yi satirdaki NEW/OLD JSONB'den okuyor. Ancak
--   child tablo'larda (hakedis_kalemleri, fatura_kalemleri) proje_id kolonu
--   yok — RLS parent tablo (hakedisler/faturalar) uzerinden yapiliyor. Sonuc:
--   bu tablolara INSERT/UPDATE/DELETE atildiginda trigger v_proje_id=NULL
--   ile audit_logs'a yazmaya calisiyor ve 23502 not-null violation patliyor.
--   Kullanici uzerinde gorulen: POST /api/hakedisler/:id/kalemler -> 400
--   "Zorunlu alan eksik: proje_id".
--
-- Fix (iki katmanli):
--   1) fn_audit_log: proje_id satirda yoksa child tablo icin parent tablodan
--      resolve et (hakedis_kalemleri -> hakedisler.proje_id, fatura_kalemleri
--      -> faturalar.proje_id). SECURITY DEFINER oldugu icin SELECT RLS bypass
--      eder.
--   2) audit_logs.proje_id'yi NULLABLE'a geri cevir. Bu defensive belt: yeni
--      bir child tablo eklenip trigger fallback'i unutulsa bile audit
--      kaydedilebilir (proje_id NULL gider), mutate islemi patlamaz.
--
-- Etkilenenler: hakedis_kalemleri ve fatura_kalemleri uzerindeki tum
-- INSERT/UPDATE/DELETE'ler (Hakedis Detay -> Kaydet/Onayla, Fatura kalem
-- ekleme/silme, vs).

BEGIN;

-- 1) audit_logs.proje_id NULLABLE'a geri cevir (defensive)
ALTER TABLE public.audit_logs ALTER COLUMN proje_id DROP NOT NULL;

COMMENT ON COLUMN public.audit_logs.proje_id IS
    'Audit edilen satirdaki proje_id (varsa). Child tablolarda (hakedis_kalemleri, '
    'fatura_kalemleri) trigger parent tablodan resolve eder. Resolve mumkun degilse '
    'NULL kalir — kayit yine olusur (forensic continuity).';

-- 2) fn_audit_log: child tablo icin parent lookup ile proje_id resolve
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_record_id UUID;
    v_proje_id UUID;
    v_before JSONB;
    v_after JSONB;
    v_actor_id UUID;
    v_actor_email TEXT;
BEGIN
    -- before/after payload
    IF TG_OP = 'INSERT' THEN
        v_after := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_before := to_jsonb(OLD);
        v_after := to_jsonb(NEW);
        IF v_before = v_after THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_before := to_jsonb(OLD);
    END IF;

    v_record_id := COALESCE((v_after ->> 'id')::UUID, (v_before ->> 'id')::UUID);

    -- proje_id: once satirda dogrudan varsa al
    v_proje_id := COALESCE((v_after ->> 'proje_id')::UUID, (v_before ->> 'proje_id')::UUID);

    -- Child tablo fallback: proje_id satirda yoksa parent'tan resolve
    IF v_proje_id IS NULL THEN
        IF TG_TABLE_NAME = 'hakedis_kalemleri' THEN
            SELECT proje_id INTO v_proje_id
            FROM public.hakedisler
            WHERE id = COALESCE((v_after ->> 'hakedis_id')::UUID, (v_before ->> 'hakedis_id')::UUID);
        ELSIF TG_TABLE_NAME = 'fatura_kalemleri' THEN
            SELECT proje_id INTO v_proje_id
            FROM public.faturalar
            WHERE id = COALESCE((v_after ->> 'fatura_id')::UUID, (v_before ->> 'fatura_id')::UUID);
        END IF;
    END IF;

    -- actor: fn_get_session_actor() helper'i kullan (auth.uid() veya app.actor_id)
    v_actor_id := public.fn_get_session_actor();
    IF v_actor_id IS NOT NULL THEN
        SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;
    END IF;

    INSERT INTO public.audit_logs (
        actor_id, actor_email, table_name, operation,
        record_id, before_data, after_data, proje_id
    ) VALUES (
        v_actor_id, v_actor_email, TG_TABLE_NAME, TG_OP,
        v_record_id, v_before, v_after, v_proje_id
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_audit_log IS
    'Generic audit trigger. Child tablolarda (hakedis_kalemleri, fatura_kalemleri) '
    'proje_id satirda yoksa parent tablodan resolve eder. actor_id icin '
    'fn_get_session_actor() cagirir (RLS context veya app.actor_id session var).';

COMMIT;
