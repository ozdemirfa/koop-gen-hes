-- Migration: 20260530000006_fn_yonetim_huzur_hakki.sql
-- Sprint: yonetim-ekibi (2026-05-30) — M4 + M5
-- Description: Hakediş onayında huzur hakkı dağıtımı (dagit) ve onay-iptalinde
--   geri alma (iptal) RPC'leri.
--   - fn_yonetim_huzur_hakki_dagit: huzur_hakki_tutari = hakedis_toplam (KDV dahil)
--     * projeler.huzur_hakki_orani / 100; yönetim üyelerine NORMALIZE oranlarına
--     göre (oran_i / SUM(oran)) dağıtılır → her üyenin borc'una eklenir + defter.
--     Yuvarlama: her pay ROUND(.,2); kalan, en yüksek oranlı üyeye yazılır →
--     payların toplamı = huzur_hakki_tutari (kuruş kaybı yok).
--   - fn_yonetim_huzur_hakki_iptal: defterdeki tutarları borc'tan düşer + defteri siler.
--   İkisi de idempotent.
-- Bağımlılık: 20260530000003 (huzur_hakki_orani), 20260530000004 (tablolar).

BEGIN;

-- ─── M4: Dağıt ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_yonetim_huzur_hakki_dagit(
  p_hakedis_id UUID,
  p_proje_id   UUID
)
RETURNS JSONB AS $$
DECLARE
  v_orani          INTEGER;
  v_hakedis_toplam NUMERIC(14, 2);
  v_tutar          NUMERIC(14, 2);
  v_sum_oran       BIGINT;
  v_total          INTEGER;
  v_running        NUMERIC(14, 2) := 0;
  v_share          NUMERIC(14, 2);
  v_remainder      NUMERIC(14, 2);
  v_count          INTEGER := 0;
  v_max_oran       INTEGER := -1;
  v_max_id         UUID;
  r                RECORD;
BEGIN
  -- İdempotanlık: zaten dağıtılmışsa dokunma (çift sayım koruması)
  IF EXISTS (
    SELECT 1 FROM public.yonetim_huzur_hakki_kayitlari WHERE hakedis_id = p_hakedis_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_distributed');
  END IF;

  SELECT hakedis_toplam INTO v_hakedis_toplam
    FROM public.hakedisler
   WHERE id = p_hakedis_id AND proje_id = p_proje_id;
  IF v_hakedis_toplam IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'hakedis_not_found');
  END IF;

  SELECT COALESCE(huzur_hakki_orani, 0) INTO v_orani
    FROM public.projeler WHERE id = p_proje_id;

  v_tutar := ROUND(v_hakedis_toplam * COALESCE(v_orani, 0) / 100.0, 2);
  IF v_tutar IS NULL OR v_tutar <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'zero_amount', 'orani', v_orani);
  END IF;

  SELECT COALESCE(SUM(oran), 0), COUNT(*) INTO v_sum_oran, v_total
    FROM public.yonetim_ekibi WHERE proje_id = p_proje_id;
  IF v_sum_oran = 0 OR v_total = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_managers_or_zero_total');
  END IF;

  -- Pay dağıt (deterministik sıra: created_at, id)
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
      (proje_id, hakedis_id, yonetim_id, tutar, normalized_oran)
    VALUES
      (p_proje_id, p_hakedis_id, r.id, v_share, ROUND(r.oran::NUMERIC / v_sum_oran, 6));

    IF r.oran > v_max_oran THEN
      v_max_oran := r.oran;
      v_max_id := r.id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Yuvarlama kalanını en yüksek oranlı üyeye ekle → toplam = v_tutar
  v_remainder := v_tutar - v_running;
  IF v_remainder <> 0 AND v_max_id IS NOT NULL THEN
    UPDATE public.yonetim_ekibi
       SET borc = borc + v_remainder, updated_at = now()
     WHERE id = v_max_id;
    UPDATE public.yonetim_huzur_hakki_kayitlari
       SET tutar = tutar + v_remainder
     WHERE hakedis_id = p_hakedis_id AND yonetim_id = v_max_id;
  END IF;

  RETURN jsonb_build_object(
    'toplam', v_tutar,
    'uye_sayisi', v_count,
    'kalan', v_remainder
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_yonetim_huzur_hakki_dagit IS
  '20260530: Hakediş onayında huzur hakkını yönetim üyelerine normalize oranlarına '
  'göre dağıtır (borc += pay) + defter yazar. İdempotent (defter varsa atlar). '
  'Kalan kuruş en yüksek oranlı üyeye eklenir.';

-- ─── M5: İptal (geri al) ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_yonetim_huzur_hakki_iptal(
  p_hakedis_id UUID,
  p_proje_id   UUID
)
RETURNS JSONB AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT yonetim_id, tutar FROM public.yonetim_huzur_hakki_kayitlari
     WHERE hakedis_id = p_hakedis_id AND proje_id = p_proje_id
  LOOP
    UPDATE public.yonetim_ekibi
       SET borc = borc - r.tutar, updated_at = now()
     WHERE id = r.yonetim_id;
    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.yonetim_huzur_hakki_kayitlari
   WHERE hakedis_id = p_hakedis_id AND proje_id = p_proje_id;

  RETURN jsonb_build_object('reversed', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_yonetim_huzur_hakki_iptal IS
  '20260530: Hakediş onay-iptalinde defterdeki huzur hakkı tutarlarını yonetim_ekibi.borc''tan '
  'düşer + defteri siler. Oranlar sonradan değişse bile tersine alma birebir doğru. İdempotent.';

COMMIT;
