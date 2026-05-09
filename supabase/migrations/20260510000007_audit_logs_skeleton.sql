-- Migration: 20260510000007_audit_logs_skeleton.sql
-- Description: Finansal mutate tabloları için forensik audit_logs iskeleti.
-- Reversible işlemleri (undoClosure, fatura silme/update, hakedis onay-iptal,
-- aidat faiz toggle, banka hareket silme, çek durum değişimi) iz bırakacak şekilde
-- kaydeder. RLS: sadece admin okuyabilir, kimse silemez/güncelleyemez (immutable).

BEGIN;

-- 1. Tablo
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,                -- auth.uid() — service-role / cron çağrılarında NULL olabilir
    actor_email TEXT,             -- forensik kolaylığı için cache'lenmiş email (auth.users JOIN'siz)
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id UUID,               -- NEW.id veya OLD.id (genelde UUID); composite PK varsa NULL
    before_data JSONB,            -- UPDATE/DELETE için OLD satır
    after_data JSONB,             -- INSERT/UPDATE için NEW satır
    proje_id UUID,                -- proje bazlı filtreleme için ayrı kolon (eğer satırda varsa)
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index'ler — sorgu pattern'leri:
--    a) "Bu kaydın geçmişi": (table_name, record_id, changed_at)
--    b) "Şu projenin tüm değişiklikleri": (proje_id, changed_at)
--    c) "Şu kullanıcının yaptıkları": (actor_id, changed_at)
CREATE INDEX IF NOT EXISTS idx_audit_logs_record
    ON public.audit_logs (table_name, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_proje
    ON public.audit_logs (proje_id, changed_at DESC)
    WHERE proje_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
    ON public.audit_logs (actor_id, changed_at DESC)
    WHERE actor_id IS NOT NULL;

-- 3. Generic trigger fonksiyonu
-- SECURITY DEFINER: trigger insert'i RLS'i bypass etmeli, aksi halde policy "kimse insert edemez"
-- şeklinde kalırsa trigger fail eder ve esas mutation rollback olur.
-- record_id ve proje_id'i jsonb içinden çıkarıyoruz (kolon varsa).
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
        -- UPDATE'te eğer hiçbir alan değişmediyse (örn. RLS bypass UPDATE) log atlama
        IF v_before = v_after THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_before := to_jsonb(OLD);
    END IF;

    -- record_id: id alanı varsa al
    v_record_id := COALESCE((v_after ->> 'id')::UUID, (v_before ->> 'id')::UUID);

    -- proje_id: satırda varsa al (filtreleme için ayrı kolon)
    v_proje_id := COALESCE((v_after ->> 'proje_id')::UUID, (v_before ->> 'proje_id')::UUID);

    -- actor: auth.uid() service-role çağrılarında NULL olabilir
    v_actor_id := auth.uid();
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

-- 4. Kritik finansal mutate tablolarına trigger bağla
-- Hangileri: state değişince finansal kayıt etkileniyor ve geri alınması iz gerektiriyor.
DO $$
DECLARE
    tbl TEXT;
    audit_tables TEXT[] := ARRAY[
        'faturalar',
        'fatura_kalemleri',
        'cari_hareketler',
        'banka_hareketleri',
        'hakedisler',
        'hakedis_kalemleri',
        'aidatlar',
        'cekler'
    ];
BEGIN
    FOREACH tbl IN ARRAY audit_tables LOOP
        -- Önce var olanı düşür (idempotent migration için)
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_log ON public.%I', tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_audit_log
             AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log()',
            tbl
        );
    END LOOP;
END $$;

-- 5. RLS — audit_logs immutable, sadece admin okuyabilir
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- INSERT/UPDATE/DELETE policy yok → user'lar elle yazamaz; trigger SECURITY DEFINER ile bypass eder.
-- Yine de açıkça reddedelim (defense in depth):
DROP POLICY IF EXISTS audit_logs_no_direct_insert ON public.audit_logs;
CREATE POLICY audit_logs_no_direct_insert
    ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (false);

DROP POLICY IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE POLICY audit_logs_no_update
    ON public.audit_logs FOR UPDATE TO authenticated
    USING (false);

DROP POLICY IF EXISTS audit_logs_no_delete ON public.audit_logs;
CREATE POLICY audit_logs_no_delete
    ON public.audit_logs FOR DELETE TO authenticated
    USING (false);

-- 6. Admin'in geçmişe bakması için yardımcı RPC
CREATE OR REPLACE FUNCTION public.fn_audit_history(
    p_table_name TEXT DEFAULT NULL,
    p_record_id UUID DEFAULT NULL,
    p_proje_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS SETOF public.audit_logs AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Yetkisiz erişim — audit_logs sadece admin tarafından okunabilir';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.audit_logs
    WHERE (p_table_name IS NULL OR table_name = p_table_name)
      AND (p_record_id IS NULL OR record_id = p_record_id)
      AND (p_proje_id IS NULL OR proje_id = p_proje_id)
    ORDER BY changed_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
