-- Migration: 20260531140002_backfill_yonetim_banka_cari.sql
-- Sprint: para-hareketleri-yonetim (2026-05-31)
-- Description: 20260531140001 öncesi yapılmış yönetim BANKA ödemeleri için
--   banka_hareketleri'nde cari karşılığı yok → para hareketlerinde görünmüyor,
--   bankada "Eşleşmemiş". En iyi-çaba backfill: aciklama 'Yönetim ödemesi%' olan,
--   henüz eşleşmemiş (eslesen_cari_hareket_id NULL) ve virman olmayan banka
--   hareketleri için cari görünürlük satırı oluştur + çift yönlü bağla.
--   kaynak_id NULL bırakılır (eski kayıtta yonetim_id güvenilir çözülemez; İlgili
--   Cari gösterimi islem_turu + aciklama üzerinden çalışır).

DO $$
DECLARE
  r RECORD;
  v_cari_id UUID;
BEGIN
  FOR r IN
    SELECT bh.id, bh.proje_id, bh.tarih, bh.tutar, bh.islem_tipi, bh.aciklama
    FROM public.banka_hareketleri bh
    WHERE bh.aciklama LIKE 'Yönetim ödemesi%'
      AND bh.eslesen_cari_hareket_id IS NULL
      AND bh.virman_id IS NULL
  LOOP
    INSERT INTO public.cari_hareketler (
      proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi,
      tarih, borc, alacak, aciklama, kaynak_tipi, kaynak_id, banka_hareket_id
    ) VALUES (
      r.proje_id, NULL,
      CASE WHEN r.islem_tipi = 'gider' THEN 'yonetim_odeme_banka_cikis' ELSE 'yonetim_odeme_banka_giris' END,
      'banka', 'banka', r.tarih,
      CASE WHEN r.islem_tipi = 'gider' THEN 0 ELSE r.tutar END,
      CASE WHEN r.islem_tipi = 'gider' THEN r.tutar ELSE 0 END,
      r.aciklama, 'yonetim_odeme', NULL, r.id
    )
    RETURNING id INTO v_cari_id;

    UPDATE public.banka_hareketleri
       SET eslesen_cari_hareket_id = v_cari_id, eslesti = TRUE
     WHERE id = r.id;
  END LOOP;
END $$;
