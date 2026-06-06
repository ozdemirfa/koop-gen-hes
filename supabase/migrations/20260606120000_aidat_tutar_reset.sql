-- Migration: 20260606120000_aidat_tutar_reset.sql
-- Description: Aidat satırı tutarını "aidat tanımı varsayılanı"na sıfırlama.
--   20260531170000_aidat_tutar_override.sql `tutar_override` (NULL = türetilmiş)
--   kolonunu + fn_update_aidat_row (override yazar) ekledi. Ama fn_update_aidat_row
--   `tutar_override = COALESCE(p_tutar, tutar_override)` yaptığı için override'ı
--   TEMİZLEYEMEZ (NULL'a çekemez). Bu migration:
--     fn_reset_aidat_tutar(p_aidat_id, p_actor_id) RPC'sini ekler:
--       - tutar_override = NULL (→ view yeniden türetir:
--         fn_aidat_yuvarla(katsayi_tutari * serefiye_orani))
--       - cari tahakkuku (kaynak_tipi='aidat') türetilmiş varsayılana eşitler.
--       - Ödeme (tahsilat) yapılmış aidatta P0001 ile reddeder (tutar değişemez).
--   SEC-1 (2026-06-02): SECURITY DEFINER fonksiyon `SET search_path = public, pg_temp`.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_reset_aidat_tutar(
  p_aidat_id  UUID,
  p_actor_id  UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aidat    RECORD;
  v_paid     NUMERIC;
  v_uye      UUID;
  v_cari_id  UUID;
  v_default  NUMERIC;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  SELECT a.id, a.proje_id, a.uye_id, a.serefiye_id,
         s.uye_id AS serefiye_uye_id, s.serefiye_orani,
         at.katsayi_tutari
  INTO v_aidat
  FROM public.aidatlar a
  JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
  JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
  WHERE a.id = p_aidat_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı');
  END IF;

  -- Bu aidata ödeme (tahsilat) yapılmış mı? Yapılmışsa tutar sıfırlanamaz.
  SELECT COALESCE(SUM(borc), 0) INTO v_paid
  FROM public.cari_hareketler
  WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id;

  IF v_paid > 0 THEN
    RAISE EXCEPTION 'Bu aidata ödeme yapılmış; tutar sıfırlanamaz. Önce ödeme eşleştirmesini geri alın.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Türetilmiş varsayılan tutar (override yokken view'in hesapladığı değer).
  v_default := public.fn_aidat_yuvarla(v_aidat.katsayi_tutari * COALESCE(v_aidat.serefiye_orani, 1.00));

  UPDATE public.aidatlar
    SET tutar_override = NULL,
        updated_at     = NOW()
    WHERE id = p_aidat_id;

  -- Cari tahakkuku varsayılana eşitle (varsa güncelle, yoksa oluştur).
  v_uye := COALESCE(v_aidat.uye_id, v_aidat.serefiye_uye_id);
  IF v_uye IS NOT NULL THEN
    SELECT id INTO v_cari_id FROM public.cari_hesaplar
     WHERE proje_id = v_aidat.proje_id AND uye_id = v_uye;
    IF v_cari_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id) THEN
        UPDATE public.cari_hareketler
          SET alacak = v_default
          WHERE kaynak_tipi = 'aidat' AND kaynak_id = p_aidat_id;
      ELSE
        INSERT INTO public.cari_hareketler (
          proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
        ) VALUES (
          v_aidat.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_default, 0, 'aidat', p_aidat_id,
          'Aidat Tahakkuku (varsayılana sıfırlandı)'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'varsayilan_tutar', v_default);
END;
$$;

COMMENT ON FUNCTION public.fn_reset_aidat_tutar(UUID, UUID) IS
  'Aidat satırı tutarını varsayılana sıfırlar: tutar_override=NULL + cari tahakkuku '
  'fn_aidat_yuvarla(katsayi_tutari*serefiye_orani) değerine eşitler. Ödeme yapılmışsa P0001.';

COMMIT;
