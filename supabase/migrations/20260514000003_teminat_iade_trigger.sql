-- Migration: 20260514000003_teminat_iade_trigger.sql
-- Description: Teminat iadesi (cari_hareketler kaynak_tipi='teminat' giden_odeme/odeme
-- kayıtları) artık birikmis_teminatlar tablosunu trigger ile otomatik günceller.
--
-- ÖNCEDEN:
--   - Hakediş onayında trg_hakedis_teminat_update tabloyu ARTIRIYORDU.
--   - İADELER tabloya hiç dokunmuyordu; raporlama kodu (firma.service.ts üç farklı
--     yerde) "tablo değeri − SUM(cari_hareketler.alacak WHERE kaynak_tipi='teminat')"
--     ile runtime'da düşüyordu.
--   - fn_dashboard_ozet bu runtime düşümünü yapmıyordu → Pano "Birikmiş Teminatlar"
--     kartı iadeleri görmüyordu (kullanıcı raporu).
--
-- ŞİMDİ:
--   - cari_hareketler üzerinde AFTER INSERT/UPDATE/DELETE trigger ile her teminat
--     iadesi birikmis_teminatlar.birikmis_teminat'tan düşülür.
--   - fn_dashboard_ozet artık birikmis_teminatlar tablosunu okur (hakedisler.
--     teminat_kesintisi'nden değil).
--   - firma.service.ts'in runtime düşümü ayrı PR'da kaldırılır; aksi takdirde
--     çift düşüm olur. Backfill + service değişikliği aynı deploy'da olmalı.
--
-- Backfill: Mevcut iadeleri tek seferlik tabloya işler (bu migration uygulandıktan
-- sonra runtime düşümü kaldırıldığında değerler tutarlı kalır).

BEGIN;

-- =====================================================================
-- 1. Trigger fonksiyonu: cari_hareketler → birikmis_teminatlar sync
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_sync_teminat_iade_on_cari_hareket()
RETURNS TRIGGER AS $$
DECLARE
    v_firma_id UUID;
    v_old_etki NUMERIC := 0;
    v_new_etki NUMERIC := 0;
    v_proje_id UUID;
    v_cari_hesap_id UUID;
BEGIN
    -- Eski satırın teminat iadesi etkisi (UPDATE/DELETE'te geçerli)
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        IF OLD.kaynak_tipi = 'teminat' AND OLD.islem_turu IN ('giden_odeme','odeme') THEN
            v_old_etki := COALESCE(OLD.alacak, 0);
        END IF;
    END IF;

    -- Yeni satırın teminat iadesi etkisi (INSERT/UPDATE'te geçerli)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.kaynak_tipi = 'teminat' AND NEW.islem_turu IN ('giden_odeme','odeme') THEN
            v_new_etki := COALESCE(NEW.alacak, 0);
        END IF;
    END IF;

    -- Etki değişmiyorsa erken çık
    IF v_old_etki = v_new_etki THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- proje_id ve cari_hesap_id'yi NEW veya OLD'dan al (UPDATE'te ikisi de var)
    v_proje_id := COALESCE(NEW.proje_id, OLD.proje_id);
    v_cari_hesap_id := COALESCE(NEW.cari_hesap_id, OLD.cari_hesap_id);

    -- Firma_id'yi cari_hesap üzerinden bul; üye cari ise teminat anlamsız, pas geç
    SELECT firma_id INTO v_firma_id
    FROM public.cari_hesaplar
    WHERE id = v_cari_hesap_id;

    IF v_firma_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Tabloya etkiyi UPSERT ile uygula: yeni − eski kadar düş (yeni > eski ise daha fazla düşer).
    -- Birikmiş teminat satırı yoksa (henüz hakediş kesintisi yapılmamış ama iade yazılmış
    -- gibi anormal durumlar için) negatif değerle oluşturulur — raporlamada anomali bayrağı.
    INSERT INTO public.birikmis_teminatlar (proje_id, firma_id, birikmis_teminat, updated_at)
    VALUES (v_proje_id, v_firma_id, -(v_new_etki - v_old_etki), NOW())
    ON CONFLICT (proje_id, firma_id)
    DO UPDATE SET
        birikmis_teminat = public.birikmis_teminatlar.birikmis_teminat - (v_new_etki - v_old_etki),
        updated_at = NOW();

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_sync_teminat_iade_on_cari_hareket() IS
    'cari_hareketler kaynak_tipi=teminat + islem_turu IN (giden_odeme,odeme) kayıtlarını'
    ' birikmis_teminatlar tablosundan otomatik düşer. INSERT/UPDATE/DELETE her üç durumda'
    ' net delta (yeni−eski alacak) uygulanır.';

-- =====================================================================
-- 2. Backfill: Mevcut iadeleri tek seferlik tabloya işle
-- =====================================================================
WITH iade_per_firma AS (
    SELECT
        ch.proje_id,
        c.firma_id,
        SUM(ch.alacak) AS toplam_iade
    FROM public.cari_hareketler ch
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
    WHERE ch.kaynak_tipi = 'teminat'
      AND ch.islem_turu IN ('giden_odeme','odeme')
      AND c.firma_id IS NOT NULL
    GROUP BY ch.proje_id, c.firma_id
)
INSERT INTO public.birikmis_teminatlar (proje_id, firma_id, birikmis_teminat, updated_at)
SELECT
    ipf.proje_id,
    ipf.firma_id,
    -ipf.toplam_iade,
    NOW()
FROM iade_per_firma ipf
ON CONFLICT (proje_id, firma_id)
DO UPDATE SET
    birikmis_teminat = public.birikmis_teminatlar.birikmis_teminat - EXCLUDED.birikmis_teminat * (-1),
    updated_at = NOW();

-- =====================================================================
-- 3. Trigger'ı attach et (backfill TAMAMLANDIKTAN SONRA — yoksa çift düşüm)
-- =====================================================================
DROP TRIGGER IF EXISTS trg_cari_hareket_teminat_iade ON public.cari_hareketler;
CREATE TRIGGER trg_cari_hareket_teminat_iade
AFTER INSERT OR UPDATE OR DELETE ON public.cari_hareketler
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_teminat_iade_on_cari_hareket();

-- =====================================================================
-- 4. fn_dashboard_ozet RPC'sini birikmis_teminatlar tablosunu okuyacak şekilde güncelle
-- Önceden v_birikmis_teminat hakedisler.teminat_kesintisi SUM'undan geliyordu (iadeleri
-- görmüyor); artık birikmis_teminatlar tablosundan okunur (trigger ile net tutulur).
-- =====================================================================
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
    JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
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

    -- 4. Hakedişler — sadece toplam gider, teminat hesabı ayrı sorgudan
    SELECT
        ROUND(COALESCE(SUM(hakedis_toplam), 0), 2)
    INTO v_hakedis_toplam_gider
    FROM public.hakedisler
    WHERE proje_id = p_proje_id AND durum IN ('onaylandi', 'odendi');

    -- 4b. Birikmiş teminat: artık birikmis_teminatlar tablosundan (trigger ile net tutulur)
    SELECT ROUND(COALESCE(SUM(birikmis_teminat), 0), 2)
    INTO v_birikmis_teminat
    FROM public.birikmis_teminatlar
    WHERE proje_id = p_proje_id;

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

COMMENT ON FUNCTION public.fn_dashboard_ozet(UUID) IS
    'Proje pano özetini hesaplar. v4 (20260514000003): birikmis_teminat artık'
    ' birikmis_teminatlar tablosundan okunur — iade trigger''ı net değeri korur.';

COMMIT;
