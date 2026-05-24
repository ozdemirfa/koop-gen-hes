-- Migration: 20260524140000_fn_dashboard_ozet_date_range.sql
-- Description: fn_dashboard_ozet'e opsiyonel p_baslangic / p_bitis tarih parametreleri ekler.
--
-- Sebep: Dashboard üstündeki RangePicker tarih seçimi UI'da görünüyordu ama backend'e
-- iletilmiyordu (controller okumuyor, RPC almıyordu). Kullanıcı tarih seçse de hep
-- tüm-zaman değerleri dönüyordu — sessiz yanlış davranış.
--
-- Tasarım: Metrikler iki kategoriye ayrıldı:
--   - FLOW (dönem içi hareket): toplam_gelir, toplam_gider (hakedis), toplam_tahsilat,
--     toplam_odeme, toplam_fatura → tarih filtresi uygulanır.
--   - SNAPSHOT (anlık durum): kasa_nakit, banka_toplami, cari_bakiye, bekleyen_alacak/borc,
--     cek_toplami, birikmis_teminat, aktif_uye_sayisi, toplam_daire_sayisi,
--     odeme_sonrasi_nakit, proje_suresi → tarihten BAĞIMSIZ (her zaman tüm proje).
--
-- Tarih kaynakları:
--   - cari_hareketler.tarih          (FLOW: gelir, tahsilat, odeme)
--   - hakedisler.onay_tarihi         (FLOW: toplam_gider — sadece onaylı/ödenmiş)
--   - faturalar.fatura_tarihi        (FLOW: toplam_fatura)
--
-- Geriye uyumluluk: imza DEFAULT NULL — eski çağrılar (yalnız p_proje_id) tüm-zaman
-- davranışını korur.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_dashboard_ozet(UUID);
DROP FUNCTION IF EXISTS public.fn_dashboard_ozet(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.fn_dashboard_ozet(
    p_proje_id UUID,
    p_baslangic DATE DEFAULT NULL,
    p_bitis DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_proje_baslangic DATE;

    -- FLOW (dönem içi)
    v_toplam_gelir NUMERIC := 0;
    v_toplam_tahsilat NUMERIC := 0;
    v_toplam_odeme NUMERIC := 0;
    v_hakedis_toplam_gider NUMERIC := 0;
    v_toplam_fatura NUMERIC := 0;

    -- SNAPSHOT (anlık)
    v_kasa_borc NUMERIC := 0;
    v_kasa_alacak NUMERIC := 0;
    v_firma_toplam_alacak NUMERIC := 0;
    v_firma_toplam_borc NUMERIC := 0;
    v_bekleyen_alacak NUMERIC := 0;
    v_bekleyen_borc NUMERIC := 0;
    v_cek_toplami NUMERIC := 0;
    v_banka_toplami NUMERIC := 0;
    v_birikmis_teminat NUMERIC := 0;
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

    -- 2. FLOW: cari_hareketler — tarih filtresi uygulanır (verilmişse).
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu IN ('aidat_kayit', 'gecikme_faizi') THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'uye' AND ch.islem_turu = 'gelen_odeme' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' AND ch.islem_turu IN ('giden_odeme', 'odeme', 'cek_odeme', 'banka_transfer') THEN ch.alacak ELSE 0 END), 0), 2)
    INTO
        v_toplam_gelir, v_toplam_tahsilat, v_toplam_odeme
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id
      AND (p_baslangic IS NULL OR ch.tarih >= p_baslangic)
      AND (p_bitis IS NULL OR ch.tarih <= p_bitis);

    -- 3. SNAPSHOT: cari_hareketler — kasa & firma bakiyeleri (tarih filtresiz, anlık durum).
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.borc ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN ch.odeme_turu = 'nakit' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.alacak ELSE 0 END), 0), 2),
        ROUND(COALESCE(SUM(CASE WHEN c.cari_turu = 'firma' THEN ch.borc ELSE 0 END), 0), 2)
    INTO
        v_kasa_borc, v_kasa_alacak, v_firma_toplam_alacak, v_firma_toplam_borc
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.proje_id = p_proje_id;

    -- 4. SNAPSHOT: bekleyen alacak/borç (üye/firma bazlı bakiye, tarih filtresiz).
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

    -- 5. FLOW: Hakedişler — onay_tarihi filtresi (taslakların onay_tarihi NULL, zaten dışarıda).
    SELECT ROUND(COALESCE(SUM(hakedis_toplam), 0), 2)
    INTO v_hakedis_toplam_gider
    FROM public.hakedisler
    WHERE proje_id = p_proje_id
      AND durum IN ('onaylandi', 'odendi')
      AND (p_baslangic IS NULL OR onay_tarihi >= p_baslangic)
      AND (p_bitis IS NULL OR onay_tarihi <= p_bitis);

    -- 6. SNAPSHOT: Birikmiş teminat (trigger ile net tutulur).
    SELECT ROUND(COALESCE(SUM(birikmis_teminat), 0), 2)
    INTO v_birikmis_teminat
    FROM public.birikmis_teminatlar
    WHERE proje_id = p_proje_id;

    -- 7. FLOW: Gelen faturalar — fatura_tarihi filtresi.
    SELECT ROUND(COALESCE(SUM(toplam_tutar), 0), 2) INTO v_toplam_fatura
    FROM public.faturalar
    WHERE proje_id = p_proje_id
      AND fatura_tipi = 'gelen'
      AND (p_baslangic IS NULL OR fatura_tarihi >= p_baslangic)
      AND (p_bitis IS NULL OR fatura_tarihi <= p_bitis);

    -- 8. SNAPSHOT: Bekleyen çekler (durum=beklemede — tarih filtresi anlam taşımaz).
    SELECT ROUND(COALESCE(SUM(tutar), 0), 2) INTO v_cek_toplami
    FROM public.cekler
    WHERE proje_id = p_proje_id AND durum = 'beklemede';

    -- 9. SNAPSHOT: Banka bakiyesi (tüm zaman, anlık tutar).
    SELECT ROUND(COALESCE(SUM(CASE WHEN islem_tipi = 'gelir' THEN tutar ELSE -tutar END), 0), 2)
    INTO v_banka_toplami
    FROM public.banka_hareketleri
    WHERE proje_id = p_proje_id;

    -- 10. SNAPSHOT: Üye ve daire sayıları.
    SELECT COUNT(*) INTO v_aktif_uye_sayisi
    FROM public.uyeler WHERE proje_id = p_proje_id AND durum = 'aktif';

    SELECT COALESCE(SUM(toplam_daire), 0) INTO v_toplam_daire_sayisi
    FROM public.bloklar WHERE proje_id = p_proje_id;

    -- 11. SNAPSHOT: Proje süresi.
    IF v_proje_baslangic IS NOT NULL THEN
        v_proje_suresi_ay := (EXTRACT(YEAR FROM age(CURRENT_DATE, v_proje_baslangic)) * 12
                              + EXTRACT(MONTH FROM age(CURRENT_DATE, v_proje_baslangic)));
        v_proje_suresi_gun := EXTRACT(DAY FROM age(CURRENT_DATE, v_proje_baslangic));
    END IF;

    -- 12. Sonuç
    v_result := jsonb_build_object(
        'success', true,
        -- FLOW (filtre uygulanmış)
        'toplam_gelir', v_toplam_gelir,
        'toplam_gider', v_hakedis_toplam_gider,
        'toplam_tahsilat', v_toplam_tahsilat,
        'toplam_odeme', v_toplam_odeme,
        'toplam_fatura', v_toplam_fatura,
        'fatura_farki', ROUND(v_toplam_fatura - v_hakedis_toplam_gider, 2),
        -- SNAPSHOT (filtreden bağımsız)
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

COMMENT ON FUNCTION public.fn_dashboard_ozet(UUID, DATE, DATE) IS
    'Proje pano özetini hesaplar. v5 (20260524140000): opsiyonel p_baslangic/p_bitis '
    'tarih filtreleri eklendi — FLOW metrikleri (gelir, gider, tahsilat, odeme, fatura) '
    'filtrelenirken SNAPSHOT metrikleri (kasa, banka, cari_bakiye, teminat, cek, odeme_sonrasi_nakit) '
    'her zaman tüm-proje anlık değerini gösterir.';

COMMIT;
