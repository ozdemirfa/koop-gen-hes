-- Migration: 20260423000007_ensure_irsaliye_columns.sql
-- Description: Ensure irsaliyeler has sozlesme_id column and correct constraints.

BEGIN;

-- Add sozlesme_id if it's missing (though it should be there, let's be safe)
ALTER TABLE public.irsaliyeler ADD COLUMN IF NOT EXISTS sozlesme_id UUID REFERENCES public.sozlesmeler(id) ON DELETE SET NULL;

-- Ensure proje_id exists
ALTER TABLE public.irsaliyeler ADD COLUMN IF NOT EXISTS proje_id UUID REFERENCES public.projeler(id) ON DELETE CASCADE;

COMMIT;
