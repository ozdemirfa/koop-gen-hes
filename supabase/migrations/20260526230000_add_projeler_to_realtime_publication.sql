-- Migration: projeler tablosunu supabase_realtime publication'a ekle.
-- Sprint: post-offline-mode (2026-05-26).
--
-- Neden:
--   PR #130 ile eklenen client/src/contexts/ProjectContext.tsx, projeler
--   tablosundaki offline_mode değişikliğini Realtime ile dinleyerek banner'ı
--   anlık günceller. Ancak publication'da bu tablo yoktu — fallback olarak
--   yalnız window focus + 5sn cooldown ile refresh oluyordu. Bu migration
--   publication'a ekleyerek push tabanlı update'i etkinleştirir.
--
--   proje_uyelikleri da eklenir: owner online'a döndüğünde eklediği üye
--   non-owner ekranlarında push ile görünsün (offline modda mutation'lar
--   zaten 20260526210000_offline_mode_rls_propagation ile bloklanıyor).
--
-- Production'a önceden MCP apply_migration ile uygulandı (2026-05-26).
-- Bu dosya version-control referansıdır; idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'projeler'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.projeler';
    RAISE NOTICE 'projeler tablosu supabase_realtime publication''ına eklendi';
  ELSE
    RAISE NOTICE 'projeler tablosu zaten publication''da';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'proje_uyelikleri'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.proje_uyelikleri';
    RAISE NOTICE 'proje_uyelikleri tablosu supabase_realtime publication''ına eklendi';
  ELSE
    RAISE NOTICE 'proje_uyelikleri tablosu zaten publication''da';
  END IF;
END $$;
