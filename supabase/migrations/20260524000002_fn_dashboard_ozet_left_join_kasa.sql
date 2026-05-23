-- Migration: 20260524000002_fn_dashboard_ozet_left_join_kasa.sql
-- Description: fn_dashboard_ozet'in cari_hareketler ↔ cari_hesaplar INNER JOIN'ini LEFT JOIN'e çevir.
--
-- NEDEN:
--   Virman feature'ı bundan sonra nakit tarafa `cari_hareketler` satırı yazacak
--   (20260524000003) — bu satırlar `cari_hesap_id = NULL` olur (virmanın cari hesabı yok).
--   Mevcut INNER JOIN bu satırları SÜZGEÇ DIŞI bırakır → nakit kasa toplamı eksik kalır →
--   virman sonrası bakiye kartı yanlış görünür.
--
-- ETKİ:
--   Kasa SUM'ları (v_kasa_borc, v_kasa_alacak) sadece `ch.odeme_turu = 'nakit'` filtresine
--   bakıyor; cari_turu/cari_hesap kolonlarına bakmıyor → LEFT JOIN'den NULL gelen virman
--   satırları da otomatik dahil olur.
--   Diğer 5 SUM (v_toplam_gelir, v_toplam_tahsilat, v_toplam_odeme, v_firma_toplam_alacak,
--   v_firma_toplam_borc) `c.cari_turu IN ('uye','firma')` filtreli → cari_turu NULL olduğunda
--   CASE → 0 döner, regresyon yok.
--   `bekleyen_alacak/borc` CTE'sinde de LEFT JOIN'i kullan (zaten LEFT JOIN'di).
--   `odeme_sonrasi_nakit` türev (v_kasa_borc - v_kasa_alacak) → otomatik doğru sonuç.

CREATE OR REPLACE FUNCTION public.fn_dashboard_ozet(p_proje_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_proje_baslangic DATE;
    v_toplam_gelir NUMERIC := 0;
    v_toplam_tahsilat NUMERIC := 0;
    v_toplam_odeme NUMERIC := 0;
    v_kasa_borc NUMERIC := 0;
    v_kasa_alacak NUMERIC := 0;
    v_firma_toplam_alacak NUMERIC := 0;
    v_firma_toplam_borc NUMERIC := 0;
    v_bekleyen_alacak NUMERIC := 0;
    v_bekleyen_borc NUMERIC := 0;
    v_toplam_fatura NUMERIC := 0;
    v_cek_toplami NUMERIC := 0;
    v_banka_toplami NUMERIC := 0;
    v_birikmis_teminat NUMERIC := 0;
    v_hakedis_toplam_gider NUMERIC := 0;
    v_aktif_uye_sayisi INTEGER := 0;
    v_toplam_daire_sayisi INTEGER := 0;
    v_proje_suresi_ay INTEGER := 0;
    v_proje_suresi_gun INTEGER := 0;
BEGIN
    -- 1. Proje kontrolü
    SELECT baslangic_tarihi INTO v_proje_baslangic FROM public.projeler WHERE id = p_proje_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Proje bulunamadı', 'success', false);
    END IF;

    -- 2. Cari hareket toplamları
    -- LEFT JOIN: virman nakit hareketleri (cari_hesap_id IS NULL) kasa SUM'larına dahil
    -- olsun diye. cari_turu filtreli SUM'lar NULL durumda CASE → 0 verir, etki yok.
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu = 'gelen_odeme' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer') THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.borc ELSE 0 END), 0), 2)
    INTO
        v_toplam_gelir, v_toplam_tahsilat, v_toplam_odeme,
        v_kasa_borc, v_kasa_alacak, v_firma_toplam_alacak, v_firma_toplam_borc
    FROM public.cari_hareketler ch
    LEFT JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id;

    -- 3. Bekleyen alacak/borç (üye/firma bazlı bakiye)
    WITH balances AS (
        SELECT
            c.cari_turu,
            ROUND(SUM(ch.alacak) - SUM(ch.borc), 2) AS bakiye
        FROM public.cari_hesaplar c
        LEFT JOIN public.cari_hareketler ch ON c.id = ch.cari_hesap_id
        WHERE c.proje_id = p_proje_id
        GROUP BY c.id, c.cari_turu
    )
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN cari_turu = 'uye' AND bakiye > 0 THEN bakiye ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN cari_turu = 'firma' AND bakiye < 0 THEN ABS(bakiye) ELSE 0 END), 0), 2)
    INTO v_bekleyen_alacak, v_bekleyen_borc
    FROM balances;

    -- 4. Hakedişler
    SELECT
        ROUND(COALESCE(SUM(hakedis_toplam), 0), 2),
        ROUND(COALESCE(SUM(teminat_kesintisi), 0), 2)
    INTO v_hakedis_toplam_gider, v_birikmis_teminat
    FROM public.hakedisler
    WHERE proje_id = p_proje_id AND durum IN ('onaylandi', 'odendi');

    -- 5. Faturalar
    SELECT ROUND(COALESCE(SUM(toplam_tutar), 0), 2) INTO v_toplam_fatura
    FROM public.faturalar
    WHERE proje_id = p_proje_id AND fatura_tipi = 'gelen';

    -- 6. Çekler
    SELECT ROUND(COALESCE(SUM(tutar), 0), 2) INTO v_cek_toplami
    FROM public.cekler
    WHERE proje_id = p_proje_id AND durum = 'beklemede';

    -- 7. Banka bakiyeleri
    SELECT ROUND(COALESCE(SUM(CASE WHEN islem_tipi = 'gelir' THEN tutar ELSE -tutar END), 0), 2) INTO v_banka_toplami
    FROM public.banka_hareketleri
    WHERE proje_id = p_proje_id;

    -- 8. Üye ve daire sayıları
    SELECT COUNT(*) INTO v_aktif_uye_sayisi FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif';
    SELECT COALESCE(SUM(toplam_daire), 0) INTO v_toplam_daire_sayisi FROM public.bloklar WHERE proje_id = p_proje_id;

    -- 9. Proje süresi
    IF v_proje_baslangic IS NOT NULL THEN
        v_proje_suresi_ay := (EXTRACT(YEAR FROM age(CURRENT_DATE, v_proje_baslangic)) * 12 + EXTRACT(MONTH FROM age(CURRENT_DATE, v_proje_baslangic)));
        v_proje_suresi_gun := EXTRACT(DAY FROM age(CURRENT_DATE, v_proje_baslangic));
    END IF;

    -- 10. Sonuç
    v_result := jsonb_build_object(
        'success', true,
        'toplam_gelir', v_toplam_gelir,
        'toplam_gider', v_hakedis_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme,
        'toplam_fatura', v_toplam_fatura,
        'fatura_farki', ROUND(v_toplam_fatura - v_hakedis_toplam_gider, 2),
        'kasa_banka', v_banka_toplami,
        'kasa_nakit', ROUND(v_kasa_borc - v_kasa_alacak, 2),
        'kasa_borc', v_kasa_borc,
        'kasa_alacak', v_kasa_alacak,
        'bekleyen_alacak', v_bekleyen_alacak,
        'bekleyen_borc', v_bekleyen_borc,
        'aktif_uye_sayisi', v_aktif_uye_sayisi,
        'toplam_daire_sayisi', v_toplam_daire_sayisi,
        'cari_bakiye', ROUND(v_firma_toplam_alacak - v_firma_toplam_borc, 2),
        'cek_toplami', v_cek_toplami,
        'birikmis_teminat', v_birikmis_teminat,
        'banka_toplami', v_banka_toplami,
        'proje_suresi', jsonb_build_object('ay', v_proje_suresi_ay, 'gun', v_proje_suresi_gun),
        'odeme_sonrasi_nakit', ROUND(
            v_banka_toplami
            + (v_kasa_borc - v_kasa_alacak)
            + CASE WHEN (v_firma_toplam_alacak - v_firma_toplam_borc) < 0 THEN (v_firma_toplam_alacak - v_firma_toplam_borc) ELSE 0 END
            - v_cek_toplami
            - v_birikmis_teminat
        , 2)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_dashboard_ozet IS
  'Dashboard özet RPC. 20260524000002 ile cari_hesaplar JOIN''i LEFT JOIN''e çevrildi → virman nakit hareketleri (cari_hesap_id IS NULL) kasa toplamına dahil edilir.';
