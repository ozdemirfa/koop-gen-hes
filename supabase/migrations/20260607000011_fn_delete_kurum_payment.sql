-- Migration: 20260607000011_fn_delete_kurum_payment.sql
-- Sprint: kurumsal-cari-bugfix (2026-06-07)
-- Description: Kurum ödemesini geri al / sil (hesap kapamayı çöz).
--
--   Kurum ödemesi net-sıfır çift satırdır (kurum_gider borç + giden_odeme alacak,
--   ortak kaynak_tipi='kurum_odeme', kaynak_id=group_id). Para Hareketleri'nde
--   giden_odeme satırının kaynak_id'si dolu olduğundan tekil Sil "kilitli" idi.
--   Bu RPC grubun TÜM satırlarını (gider + ödeme) + bağlı banka hareketini siler;
--   giden_odeme DELETE trigger'ı (trg_huzur_hakki_giden_odeme) huzur hakkını otomatik
--   geri alır.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_delete_kurum_payment(
  p_group_id UUID,
  p_proje_id UUID,
  p_actor_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  -- Bağlı banka hareketlerini sil (cari satırlar silinmeden önce).
  FOR r IN
    SELECT id, banka_hareket_id FROM public.cari_hareketler
    WHERE proje_id = p_proje_id AND kaynak_tipi = 'kurum_odeme' AND kaynak_id = p_group_id
  LOOP
    IF r.banka_hareket_id IS NOT NULL THEN
      DELETE FROM public.banka_hareketleri WHERE id = r.banka_hareket_id;
    END IF;
    DELETE FROM public.banka_hareketleri WHERE eslesen_cari_hareket_id = r.id;
  END LOOP;

  -- Cari hareketleri sil. giden_odeme satırının AFTER DELETE trigger'ı
  -- (trg_huzur_hakki_giden_odeme) huzur hakkı dağıtımını geri alır.
  DELETE FROM public.cari_hareketler
  WHERE proje_id = p_proje_id AND kaynak_tipi = 'kurum_odeme' AND kaynak_id = p_group_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Kurum ödemesi bulunamadı' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'deleted', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_delete_kurum_payment(UUID, UUID, UUID) IS
  'Kurum ödemesini (kaynak_tipi=kurum_odeme, kaynak_id=group_id) tamamen geri alır: '
  'gider+ödeme cari satırları + bağlı banka hareketi silinir; huzur hakkı DELETE trigger ile geri alınır.';

COMMIT;
