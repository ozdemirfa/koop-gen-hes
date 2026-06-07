-- Migration: 20260607000003_huzur_hakki_odeme_bazli.sql
-- Sprint: kurumsal-cari-revizyonlar (2026-06-07) — Rev 2
-- Description: Yönetim ekibi huzur hakkı tetikleyicisi hakkediş onayından →
--   firma + kurumsal carilerinden yapılan GİDEN ÖDEME tutarlarına taşınır.
--
--   Tasarım: cari_hareketler üzerinde AFTER INSERT/DELETE trigger. Böylece TÜM
--   giden ödeme yolları (fn_create_payment_atomic, fn_create_kurum_payment_atomic,
--   çek ödemesi cari hareketi, gelecekteki yollar) otomatik kapsanır ve ödeme
--   silindiğinde dağıtım otomatik geri alınır. (Per-RPC hook yerine tek nokta.)
--
--   Kapsam: islem_turu='giden_odeme' AND alacak>0 AND kaynak_tipi<>'teminat'
--           AND cari_turu IN ('firma','kurumsal').  (teminat iadesi hariç.)
--
--   Geçiş kararı (kullanıcı): SIFIRLA & YENİDEN KUR — mevcut huzur hakkı borçları
--   sıfırlanır, defter temizlenir, mevcut firma+kurumsal giden ödemelerden yeniden
--   hesaplanır. (yonetim_ekibi.alacak = yapılan ödemeler korunur.)
--
-- Bağımlılık: 20260607000002 (kurumsal cari_turu), 20260530000004/000006 (yönetim tabloları/RPC).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Defter tablosunu genelleştir: cari_hareket_id (ödeme bazlı kaynak)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.yonetim_huzur_hakki_kayitlari
  ALTER COLUMN hakedis_id DROP NOT NULL;

ALTER TABLE public.yonetim_huzur_hakki_kayitlari
  ADD COLUMN IF NOT EXISTS cari_hareket_id UUID;

-- Aynı cari hareket için üye başına tek defter satırı.
CREATE UNIQUE INDEX IF NOT EXISTS uq_yhhk_cari_hareket_yonetim
  ON public.yonetim_huzur_hakki_kayitlari (cari_hareket_id, yonetim_id)
  WHERE cari_hareket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_yhhk_cari_hareket
  ON public.yonetim_huzur_hakki_kayitlari (cari_hareket_id);

COMMENT ON COLUMN public.yonetim_huzur_hakki_kayitlari.cari_hareket_id IS
  'Ödeme bazlı huzur hakkı kaynağı (giden_odeme cari hareketi). hakedis_id ile '
  'mutually-exclusive: yeni kayıtlar cari_hareket_id ile yazılır.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Dağıt (ödeme bazlı) — 20260530000006 mantığı, kaynak=cari_hareket_id
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_yonetim_huzur_hakki_dagit_odeme(
  p_proje_id        UUID,
  p_cari_hareket_id UUID,
  p_tutar           NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_orani     INTEGER;
  v_tutar     NUMERIC(14, 2);
  v_sum_oran  BIGINT;
  v_total     INTEGER;
  v_running   NUMERIC(14, 2) := 0;
  v_share     NUMERIC(14, 2);
  v_remainder NUMERIC(14, 2);
  v_count     INTEGER := 0;
  v_max_oran  INTEGER := -1;
  v_max_id    UUID;
  r           RECORD;
BEGIN
  -- İdempotanlık: bu cari hareket için zaten dağıtılmışsa dokunma.
  IF EXISTS (
    SELECT 1 FROM public.yonetim_huzur_hakki_kayitlari WHERE cari_hareket_id = p_cari_hareket_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_distributed');
  END IF;

  SELECT COALESCE(huzur_hakki_orani, 0) INTO v_orani
    FROM public.projeler WHERE id = p_proje_id;

  v_tutar := ROUND(COALESCE(p_tutar, 0) * COALESCE(v_orani, 0) / 100.0, 2);
  IF v_tutar IS NULL OR v_tutar <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'zero_amount', 'orani', v_orani);
  END IF;

  SELECT COALESCE(SUM(oran), 0), COUNT(*) INTO v_sum_oran, v_total
    FROM public.yonetim_ekibi WHERE proje_id = p_proje_id;
  IF v_sum_oran = 0 OR v_total = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_managers_or_zero_total');
  END IF;

  FOR r IN
    SELECT id, oran FROM public.yonetim_ekibi
     WHERE proje_id = p_proje_id
     ORDER BY created_at ASC, id ASC
  LOOP
    v_share := ROUND(v_tutar * r.oran / v_sum_oran, 2);
    v_running := v_running + v_share;

    UPDATE public.yonetim_ekibi
       SET borc = borc + v_share, updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.yonetim_huzur_hakki_kayitlari
      (proje_id, hakedis_id, cari_hareket_id, yonetim_id, tutar, normalized_oran)
    VALUES
      (p_proje_id, NULL, p_cari_hareket_id, r.id, v_share, ROUND(r.oran::NUMERIC / v_sum_oran, 6));

    IF r.oran > v_max_oran THEN
      v_max_oran := r.oran;
      v_max_id := r.id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Yuvarlama kalanını en yüksek oranlı üyeye ekle → toplam = v_tutar (kuruş kaybı yok)
  v_remainder := v_tutar - v_running;
  IF v_remainder <> 0 AND v_max_id IS NOT NULL THEN
    UPDATE public.yonetim_ekibi
       SET borc = borc + v_remainder, updated_at = now()
     WHERE id = v_max_id;
    UPDATE public.yonetim_huzur_hakki_kayitlari
       SET tutar = tutar + v_remainder
     WHERE cari_hareket_id = p_cari_hareket_id AND yonetim_id = v_max_id;
  END IF;

  RETURN jsonb_build_object('toplam', v_tutar, 'uye_sayisi', v_count, 'kalan', v_remainder);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_yonetim_huzur_hakki_dagit_odeme IS
  '20260607: Giden ödeme bazlı huzur hakkı dağıtımı (kaynak=cari_hareket_id). '
  'tutar = ödeme * proje.huzur_hakki_orani/100; normalize oranlarla dağıtılır. İdempotent.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. İptal (ödeme bazlı) — ödeme silinince defterdeki tutarları borc''tan düş
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_yonetim_huzur_hakki_iptal_odeme(
  p_cari_hareket_id UUID
)
RETURNS JSONB AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT yonetim_id, tutar FROM public.yonetim_huzur_hakki_kayitlari
     WHERE cari_hareket_id = p_cari_hareket_id
  LOOP
    UPDATE public.yonetim_ekibi
       SET borc = borc - r.tutar, updated_at = now()
     WHERE id = r.yonetim_id;
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.yonetim_huzur_hakki_kayitlari
   WHERE cari_hareket_id = p_cari_hareket_id;

  RETURN jsonb_build_object('reversed', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_yonetim_huzur_hakki_iptal_odeme IS
  '20260607: Giden ödeme silinince huzur hakkı borçlarını geri alır + defteri siler. İdempotent.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Trigger: cari_hareketler giden ödeme (firma+kurumsal) → huzur hakkı
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_huzur_hakki_giden_odeme()
RETURNS TRIGGER AS $$
DECLARE
  v_cari_turu TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.islem_turu = 'giden_odeme'
       AND COALESCE(NEW.alacak, 0) > 0
       AND NEW.kaynak_tipi IS DISTINCT FROM 'teminat' THEN
      SELECT cari_turu INTO v_cari_turu FROM public.cari_hesaplar WHERE id = NEW.cari_hesap_id;
      IF v_cari_turu IN ('firma', 'kurumsal') THEN
        PERFORM public.fn_yonetim_huzur_hakki_dagit_odeme(NEW.proje_id, NEW.id, NEW.alacak);
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Teminat/üye giden ödemelerinde defter boştur → iptal no-op (güvenli).
    IF OLD.islem_turu = 'giden_odeme' THEN
      PERFORM public.fn_yonetim_huzur_hakki_iptal_odeme(OLD.id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_huzur_hakki_giden_odeme ON public.cari_hareketler;
CREATE TRIGGER trg_huzur_hakki_giden_odeme
AFTER INSERT OR DELETE ON public.cari_hareketler
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_huzur_hakki_giden_odeme();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. SIFIRLA & YENİDEN KUR
--    - yonetim_ekibi.borc = 0 (alacak = yapılan ödemeler korunur)
--    - defteri temizle
--    - mevcut firma+kurumsal giden ödemelerden yeniden dağıt (trigger ATEŞLENMEZ;
--      mevcut satırlar re-insert edilmez, doğrudan RPC çağrılır)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.yonetim_ekibi SET borc = 0, updated_at = now();

TRUNCATE public.yonetim_huzur_hakki_kayitlari;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT ch.proje_id, ch.id, ch.alacak
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON c.id = ch.cari_hesap_id
    WHERE ch.islem_turu = 'giden_odeme'
      AND COALESCE(ch.alacak, 0) > 0
      AND ch.kaynak_tipi IS DISTINCT FROM 'teminat'
      AND c.cari_turu IN ('firma', 'kurumsal')
  LOOP
    PERFORM public.fn_yonetim_huzur_hakki_dagit_odeme(r.proje_id, r.id, r.alacak);
  END LOOP;
END $$;

COMMIT;
