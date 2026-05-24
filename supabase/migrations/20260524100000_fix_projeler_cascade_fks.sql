-- Migration: 20260524100000_fix_projeler_cascade_fks.sql
-- Sprint: proje-silme-akisi (2026-05-24) — bug fix (#103 takip)
-- Description:
--   `fn_proje_hard_delete` RPC (kalıcı silme) yalnızca `DELETE FROM public.projeler`
--   yapar ve tüm alt tabloların `ON DELETE CASCADE` ile temizleneceğine güvenir.
--   Ancak geçmişte birçok alt tablonun `proje_id` kolonu önce CASCADE'siz eklenmiş,
--   sonraki migration'lar `ADD COLUMN IF NOT EXISTS ... ON DELETE CASCADE` ile
--   eklendiği için kolon zaten varken FK ayarı güncellenmemiş. Sonuç: hard delete
--   yaparken `23503 foreign_key_violation` — "Bu kayıt başka verilerle ilişkili
--   olduğu için işlem yapılamaz".
--
-- Bilinen CASCADE'siz adaylar (en az):
--   yillik_harcama_planlari, cekler, irsaliyeler, faturalar, cari_hareketler,
--   banka_hesaplari, banka_hareketleri, gelir_giderler, bloklar.
--
-- Yaklaşım:
--   1) pg_constraint üzerinden `public.projeler(id)`'e referans veren TÜM FK'leri
--      bul; confdeltype <> 'c' olanları DROP + recreate ile CASCADE'e taşı.
--   2) `check_sozlesme_deletion` trigger'ı CASCADE sırasında (hakedisler henüz
--      silinmemişken sozlesmeler silinmeye başlarsa) yanlış pozitif P0001 hatası
--      verebilir. `fn_proje_hard_delete` içinde session GUC ile bypass et;
--      trigger bu GUC set ise OLD'i geri döndürür (sessizce geçer).
--
-- Audit: trg_audit_log DELETE event'ini before_data ile audit_logs'a yazmaya
-- devam eder (audit_logs.proje_id FK değil, basit UUID kolonu; CASCADE etkilemez).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tüm public.* tablolarının public.projeler(id)'e referans veren FK'lerini
--    CASCADE'e normalize et.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_fixed INT := 0;
BEGIN
    FOR r IN
        SELECT
            con.conname  AS constraint_name,
            cl.relname   AS table_name,
            att.attname  AS column_name,
            con.confdeltype
        FROM pg_constraint con
        JOIN pg_class      cl  ON cl.oid  = con.conrelid
        JOIN pg_namespace  ns  ON ns.oid  = cl.relnamespace
        JOIN pg_class      rcl ON rcl.oid = con.confrelid
        JOIN pg_namespace  rns ON rns.oid = rcl.relnamespace
        JOIN pg_attribute  att ON att.attrelid = con.conrelid
                              AND att.attnum   = con.conkey[1]
        WHERE con.contype     = 'f'
          AND ns.nspname      = 'public'
          AND rns.nspname     = 'public'
          AND rcl.relname     = 'projeler'
          AND con.confdeltype <> 'c'  -- 'c' = CASCADE; diğerleri: 'a' NO ACTION, 'r' RESTRICT, 'n' SET NULL, 'd' SET DEFAULT
          AND array_length(con.conkey, 1) = 1  -- composite FK beklemiyoruz; defensive
    LOOP
        RAISE NOTICE 'CASCADE eksik FK düzeltiliyor: %.% (constraint=%, eski confdeltype=%)',
            r.table_name, r.column_name, r.constraint_name, r.confdeltype;

        EXECUTE format(
            'ALTER TABLE public.%I DROP CONSTRAINT %I',
            r.table_name, r.constraint_name
        );
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.projeler(id) ON DELETE CASCADE',
            r.table_name, r.constraint_name, r.column_name
        );
        v_fixed := v_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Toplam % FK CASCADE''e taşındı.', v_fixed;
END $$;

-- ---------------------------------------------------------------------------
-- 2. check_sozlesme_deletion — projeler cascade'inde sessizce geç.
-- ---------------------------------------------------------------------------
-- Trigger projelere bağlı sözleşmelerin doğrudan silinmesini engellemek için
-- yazılmış (hakedişi varsa silmeyi yasakla). Ama projeler hard-delete'inde tüm
-- alt tablolar CASCADE ile silinirken sibling tabloların silinme sırası
-- garantili değil: hakedisler henüz silinmemişken sozlesmeler için cascade
-- DELETE tetiklenirse trigger EXISTS check'i true döner ve P0001 hata atar.
--
-- `fn_proje_hard_delete` aşağıda `app.cascade_from_projeler='true'` GUC'unu
-- transaction-local set eder; trigger bu flag'i görürse direkt OLD'u döndürür.
CREATE OR REPLACE FUNCTION public.check_sozlesme_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Projeler hard-delete cascade'i sırasında trigger guard'ı devre dışı bırak.
  IF current_setting('app.cascade_from_projeler', true) = 'true' THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.hakedisler WHERE sozlesme_id = OLD.id) THEN
    RAISE EXCEPTION 'Bu sözleşmeye ait hakediş kayıtları bulunduğu için silinemez.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger zaten kuruluydu; CREATE OR REPLACE FUNCTION ile davranış güncellendi.
-- (DROP/CREATE TRIGGER gerekmiyor.)

-- ---------------------------------------------------------------------------
-- 3. fn_proje_hard_delete — GUC'u set et, sonra DELETE.
-- ---------------------------------------------------------------------------
-- Önceki sürüm 20260524081601_projeler_silme_akisi.sql'den; sadece
-- set_config(...) çağrısı eklendi.
CREATE OR REPLACE FUNCTION public.fn_proje_hard_delete(p_proje_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_silindi BOOLEAN;
  v_proje_adi TEXT;
  v_counts JSONB;
  v_toplam INT;
BEGIN
  -- Proje arşivde mi?
  SELECT silindi_mi, proje_adi INTO v_silindi, v_proje_adi
  FROM public.projeler
  WHERE id = p_proje_id;

  IF v_silindi IS NULL THEN
    RAISE EXCEPTION 'Proje bulunamadı' USING ERRCODE = 'P0002';
  END IF;

  IF v_silindi = false THEN
    RAISE EXCEPTION 'Kalıcı silmeden önce proje arşivlenmiş olmalı'
      USING ERRCODE = '22023';
  END IF;

  -- Alt kayıt sayıları (audit log için döndürülür).
  -- NOT: fn_proje_silme_onizleme ile aynı liste; yeni proje-bazlı tablo eklenirse
  -- iki yerde de güncellenmeli.
  SELECT jsonb_build_object(
    'uyeler',              (SELECT COUNT(*) FROM public.uyeler              WHERE proje_id = p_proje_id),
    'bloklar',             (SELECT COUNT(*) FROM public.bloklar             WHERE proje_id = p_proje_id),
    'sozlesmeler',         (SELECT COUNT(*) FROM public.sozlesmeler         WHERE proje_id = p_proje_id),
    'faturalar',           (SELECT COUNT(*) FROM public.faturalar           WHERE proje_id = p_proje_id),
    'hakedisler',          (SELECT COUNT(*) FROM public.hakedisler          WHERE proje_id = p_proje_id),
    'aidat_tanimlari',     (SELECT COUNT(*) FROM public.aidat_tanimlari     WHERE proje_id = p_proje_id),
    'aidatlar',            (SELECT COUNT(*) FROM public.aidatlar            WHERE proje_id = p_proje_id),
    'banka_hesaplari',     (SELECT COUNT(*) FROM public.banka_hesaplari     WHERE proje_id = p_proje_id),
    'banka_hareketleri',   (SELECT COUNT(*) FROM public.banka_hareketleri   WHERE proje_id = p_proje_id),
    'cari_hareketler',     (SELECT COUNT(*) FROM public.cari_hareketler     WHERE proje_id = p_proje_id),
    'cekler',              (SELECT COUNT(*) FROM public.cekler              WHERE proje_id = p_proje_id),
    'irsaliyeler',         (SELECT COUNT(*) FROM public.irsaliyeler         WHERE proje_id = p_proje_id),
    'virmanlar',           (SELECT COUNT(*) FROM public.virmanlar           WHERE proje_id = p_proje_id),
    'proje_is_kalemleri',  (SELECT COUNT(*) FROM public.proje_is_kalemleri  WHERE proje_id = p_proje_id),
    'yillik_harcama_planlari', (SELECT COUNT(*) FROM public.yillik_harcama_planlari WHERE proje_id = p_proje_id),
    'birikmis_teminatlar', (SELECT COUNT(*) FROM public.birikmis_teminatlar WHERE proje_id = p_proje_id),
    'cari_hesaplar',       (SELECT COUNT(*) FROM public.cari_hesaplar       WHERE proje_id = p_proje_id)
  ) INTO v_counts;

  SELECT COALESCE(SUM((value)::int), 0)::int INTO v_toplam
  FROM jsonb_each_text(v_counts);

  -- Cascade sırasında check_sozlesme_deletion trigger'ı bypass'lasın.
  -- 3. parametre = true → transaction-local set (LOCAL): commit/rollback sonunda
  -- otomatik temizlenir, başka bağlantıyı etkilemez.
  PERFORM set_config('app.cascade_from_projeler', 'true', true);

  -- CASCADE silme — alt tablolar otomatik temizlenir.
  -- trg_audit_log DELETE event'ini before_data ile audit_logs'a yazar.
  DELETE FROM public.projeler WHERE id = p_proje_id;

  RETURN jsonb_build_object(
    'success',     true,
    'proje_id',    p_proje_id,
    'proje_adi',   v_proje_adi,
    'toplam_kayit', v_toplam,
    'etkilenen',   v_counts
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.fn_proje_hard_delete(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_proje_hard_delete(UUID) TO authenticated;

COMMIT;
