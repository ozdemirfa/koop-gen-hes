-- Migration: 20260429000001_fix_accounting_and_fifo.sql
-- Description: Fix FIFO payment matching for members, interest toggle security, and aidat views following Project Perspective.

BEGIN;

-- 1. Optimized Indexes for Financial Operations
CREATE INDEX IF NOT EXISTS idx_cari_hareketler_kaynak_id_tipi ON public.cari_hareketler(kaynak_id, kaynak_tipi);
CREATE INDEX IF NOT EXISTS idx_cari_hareketler_islem_turu ON public.cari_hareketler(islem_turu);

-- 2. Fix aidat_detaylari view to correctly handle interest and project perspective
-- Proje Perspektifi: ALACAK (Accrued/Credit), BORC (Paid/Debit)
DROP VIEW IF EXISTS public.aidat_detaylari CASCADE;

CREATE OR REPLACE VIEW public.aidat_detaylari AS
WITH aidat_cari_totals AS (
    SELECT 
        kaynak_id as aidat_id,
        SUM(alacak) as total_accrued, -- Projenin alacağı (Tahakkuk)
        SUM(borc) as total_paid,       -- Projenin borçlandığı/tahsilat (Ödeme)
        SUM(CASE WHEN kaynak_tipi = 'gecikme_faizi' THEN alacak ELSE 0 END) as total_interest
    FROM public.cari_hareketler
    WHERE kaynak_tipi IN ('aidat', 'gecikme_faizi')
    GROUP BY kaynak_id
)
SELECT 
    a.id,
    a.proje_id,
    a.serefiye_id,
    COALESCE(a.uye_id, s.uye_id) as uye_id,
    a.aidat_tanimi_id,
    a.durum,
    a.son_odeme_tarihi,
    a.faiz_yansitildi,
    a.created_at,
    a.updated_at,
    at.yil,
    at.ay,
    at.tur as aidat_turu,
    s.daire_no,
    b.id as filter_blok_id,
    b.blok_adi,
    u.ad,
    u.soyad,
    u.uye_no,
    -- Ana Borç (Tanımdan gelen baz tutar)
    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) as baz_tutar,
    -- Cari Hareketlerden Gelen Gerçek Veriler
    COALESCE(ct.total_accrued, 0) as toplam_tahakkuk,
    COALESCE(ct.total_paid, 0) as toplam_odenen,
    COALESCE(ct.total_interest, 0) as toplam_faiz,
    (COALESCE(ct.total_accrued, 0) - COALESCE(ct.total_paid, 0)) as kalan_borc,
    -- Gecikme Gün Sayısı
    CASE 
        WHEN a.durum != 'odendi' AND a.son_odeme_tarihi < CURRENT_DATE 
        THEN (CURRENT_DATE - a.son_odeme_tarihi)::INTEGER 
        ELSE 0 
    END as gecikme_gun_sayisi
FROM public.aidatlar a
JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
JOIN public.bloklar b ON s.blok_id = b.id
LEFT JOIN public.uyeler u ON u.id = COALESCE(a.uye_id, s.uye_id)
LEFT JOIN aidat_cari_totals ct ON ct.aidat_id = a.id;

-- 3. Redefine the summary function (was dropped by CASCADE)
CREATE OR REPLACE FUNCTION public.get_aidat_summary_v4(
  p_proje_id UUID DEFAULT NULL,
  p_yil INTEGER DEFAULT NULL,
  p_ay INTEGER DEFAULT NULL,
  p_durum TEXT DEFAULT NULL,
  p_blok_id UUID DEFAULT NULL,
  p_has_daire BOOLEAN DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_durum_enum public.aidat_durumu;
BEGIN
    IF p_durum IS NOT NULL AND p_durum <> '' THEN
        BEGIN
            v_durum_enum := p_durum::public.aidat_durumu;
        EXCEPTION WHEN OTHERS THEN
            v_durum_enum := NULL;
        END;
    END IF;

  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(toplam_tahakkuk), 0),
    'toplam_tahsilat', COALESCE(SUM(toplam_odenen), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN kalan_borc ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN kalan_borc ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(toplam_faiz), 0)
  ) INTO result
  FROM public.aidat_detaylari
  WHERE (p_proje_id IS NULL OR proje_id = p_proje_id)
    AND (p_yil IS NULL OR yil = p_yil)
    AND (p_ay IS NULL OR ay = p_ay)
    AND (p_durum IS NULL OR p_durum = '' OR durum = v_durum_enum)
    AND (p_blok_id IS NULL OR filter_blok_id = p_blok_id)
    AND (p_has_daire IS NULL OR (p_has_daire = TRUE AND uye_id IS NOT NULL) OR (p_has_daire = FALSE AND uye_id IS NULL));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Fix FIFO payment matching for members (Core Bug Fix)
CREATE OR REPLACE FUNCTION public.fn_match_member_payments_fifo(p_proje_id UUID, p_uye_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_total_unmatched_payment NUMERIC(14,2) := 0;
    v_aidat RECORD;
    v_payment RECORD;
    v_match_amount NUMERIC(14,2);
    v_matched_count INTEGER := 0;
    v_cari_id UUID;
    v_unmatched_movements CURSOR FOR 
        SELECT ch.id, ch.borc as tutar, ch.tarih, ch.aciklama, ch.odeme_turu, ch.banka_hesap_id, ch.belge_no
        FROM public.cari_hareketler ch
        JOIN public.cari_hesaplar c ON ch.cari_hesap_id = c.id
        WHERE c.proje_id = p_proje_id 
          AND c.uye_id = p_uye_id 
          AND ch.islem_turu = 'gelen_odeme' 
          AND ch.kaynak_tipi IS NULL
        ORDER BY ch.tarih ASC, ch.created_at ASC;
BEGIN
    -- 1. Get Cari ID
    SELECT id INTO v_cari_id FROM public.cari_hesaplar WHERE proje_id = p_proje_id AND uye_id = p_uye_id;
    IF v_cari_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cari hesap bulunamadı');
    END IF;

    -- 2. Process each unmatched payment movement
    FOR v_payment IN v_unmatched_movements LOOP
        v_total_unmatched_payment := v_payment.tutar;
        
        WHILE v_total_unmatched_payment > 0 LOOP
            -- Find the oldest unpaid aidat
            -- We use the maximum of current recorded debt or the calculated target debt (includes unapplied interest)
            SELECT 
                a.id, 
                GREATEST(
                    COALESCE(ct.total_accrued, 0), 
                    (at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) + COALESCE(a.gecikme_faizi, 0)
                ) as toplam_borc,
                COALESCE(ct.total_paid, 0) as odenen_tutar
            INTO v_aidat
            FROM public.aidatlar a
            JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
            JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
            LEFT JOIN (
                SELECT kaynak_id, SUM(alacak) as total_accrued, SUM(borc) as total_paid
                FROM public.cari_hareketler
                WHERE kaynak_tipi IN ('aidat', 'gecikme_faizi')
                GROUP BY kaynak_id
            ) ct ON ct.kaynak_id = a.id
            WHERE a.proje_id = p_proje_id 
              AND a.uye_id = p_uye_id 
              AND a.durum IN ('bekliyor', 'gecikti')
            ORDER BY a.son_odeme_tarihi ASC, a.created_at ASC
            LIMIT 1;

            IF v_aidat IS NULL THEN
                EXIT; 
            END IF;

            v_match_amount := LEAST(v_total_unmatched_payment, (v_aidat.toplam_borc - v_aidat.odenen_tutar));
            
            IF v_match_amount <= 0.009 THEN
                EXIT;
            END IF;

            -- Assign payment to this aidat
            IF ABS(v_total_unmatched_payment - v_match_amount) < 0.009 THEN
                UPDATE public.cari_hareketler 
                SET kaynak_tipi = 'aidat', kaynak_id = v_aidat.id 
                WHERE id = v_payment.id;
                
                v_total_unmatched_payment := 0;
            ELSE
                -- Split movement
                UPDATE public.cari_hareketler 
                SET borc = v_match_amount, kaynak_tipi = 'aidat', kaynak_id = v_aidat.id 
                WHERE id = v_payment.id;

                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, odeme_turu, tarih, borc, alacak, aciklama, belge_no, banka_hesap_id
                ) VALUES (
                    p_proje_id, v_cari_id, 'gelen_odeme', v_payment.odeme_turu, v_payment.tarih, 
                    (v_total_unmatched_payment - v_match_amount), 0, v_payment.aciklama, v_payment.belge_no, v_payment.banka_hesap_id
                ) RETURNING id INTO v_payment.id;

                v_total_unmatched_payment := (v_total_unmatched_payment - v_match_amount);
            END IF;

            v_matched_count := v_matched_count + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'FIFO eşleştirme tamamlandı', 
        'matched_count', v_matched_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fix fn_sync_aidat_status_on_payment to include all related types
CREATE OR REPLACE FUNCTION public.fn_sync_aidat_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_aidat_id UUID;
    v_balance NUMERIC;
    v_son_odeme DATE;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_aidat_id := OLD.kaynak_id;
    ELSE
        v_aidat_id := NEW.kaynak_id;
    END IF;

    IF (TG_OP <> 'DELETE' AND NEW.kaynak_tipi NOT IN ('aidat', 'gecikme_faizi')) OR (TG_OP = 'DELETE' AND OLD.kaynak_tipi NOT IN ('aidat', 'gecikme_faizi')) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Proje Perspektifi: ALACAK (Tahakkuk) - BORC (Tahsilat)
    SELECT 
        (COALESCE(SUM(ch.alacak), 0) - COALESCE(SUM(ch.borc), 0)),
        MAX(a.son_odeme_tarihi)
    INTO v_balance, v_son_odeme
    FROM public.aidatlar a
    LEFT JOIN public.cari_hareketler ch ON a.id = ch.kaynak_id AND ch.kaynak_tipi IN ('aidat', 'gecikme_faizi')
    WHERE a.id = v_aidat_id
    GROUP BY a.id;

    IF v_balance <= 0.009 THEN
        UPDATE public.aidatlar SET durum = 'odendi' WHERE id = v_aidat_id;
    ELSIF v_son_odeme < CURRENT_DATE THEN
        UPDATE public.aidatlar SET durum = 'gecikti' WHERE id = v_aidat_id;
    ELSE
        UPDATE public.aidatlar SET durum = 'bekliyor' WHERE id = v_aidat_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Fix fn_toggle_aidat_faiz security check
CREATE OR REPLACE FUNCTION public.fn_toggle_aidat_faiz(p_aidat_id UUID, p_active BOOLEAN)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_uye_id UUID;
    v_cari_id UUID;
    v_faiz NUMERIC(12,2);
    v_hareket_id UUID;
    v_eslesme_var BOOLEAN;
BEGIN
    -- Aidat ve mevcut üye bilgisini al
    SELECT a.*, COALESCE(a.uye_id, s.uye_id) as final_uye_id,
           at.yil, at.ay,
           (CURRENT_DATE - a.son_odeme_tarihi) as gecikme_gun
    INTO v_record 
    FROM public.aidatlar a
    JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
    JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
    WHERE a.id = p_aidat_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Aidat bulunamadı.');
    END IF;

    v_uye_id := v_record.final_uye_id;
    IF v_uye_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bu aidatın henüz bir üyesi yok.');
    END IF;

    v_faiz := COALESCE(v_record.gecikme_faizi, 0);
    
    IF v_faiz < 0.01 AND p_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Yansıtılacak anlamlı bir faiz tutarı bulunamadı.');
    END IF;

    SELECT id INTO v_cari_id FROM public.cari_hesaplar 
    WHERE proje_id = v_record.proje_id AND uye_id = v_uye_id;

    IF p_active THEN
        UPDATE public.aidatlar SET faiz_yansitildi = TRUE WHERE id = p_aidat_id;

        IF v_cari_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.cari_hareketler WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id) THEN
                UPDATE public.cari_hareketler 
                SET alacak = v_faiz,
                    aciklama = v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_record.gecikme_gun || ' gün)'
                WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id;
            ELSE
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, tarih, alacak, borc, kaynak_tipi, kaynak_id, aciklama
                ) VALUES (
                    v_record.proje_id, v_cari_id, 'aidat_kayit', CURRENT_DATE, v_faiz, 0, 'gecikme_faizi', p_aidat_id, 
                    v_record.ay || '/' || v_record.yil || ' Gecikme Faizi Tahakkuku (' || v_record.gecikme_gun || ' gün)'
                );
            END IF;
        END IF;
    ELSE
        -- Enhanced Security Check: If any payment (BORC) exists for this aidat or its interest
        SELECT EXISTS (
            SELECT 1 FROM public.cari_hareketler 
            WHERE kaynak_id = p_aidat_id 
              AND kaynak_tipi IN ('aidat', 'gecikme_faizi')
              AND borc > 0.009
        ) INTO v_eslesme_var;

        IF v_eslesme_var THEN
            RETURN jsonb_build_object('success', false, 'message', 'Bu aidata veya faizine ödeme yapılmış. Önce ödeme eşleştirmesini kaldırınız (Undo Closure).');
        END IF;

        -- Check if it's linked to bank movements
        SELECT id INTO v_hareket_id FROM public.cari_hareketler 
        WHERE kaynak_tipi = 'gecikme_faizi' AND kaynak_id = p_aidat_id LIMIT 1;
        
        IF v_hareket_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.banka_hareketleri WHERE eslesen_cari_hareket_id = v_hareket_id) THEN
                RETURN jsonb_build_object('success', false, 'message', 'Bu faize ait banka hareketi eşleştirmesi yapılmış.');
            END IF;
            
            DELETE FROM public.cari_hareketler WHERE id = v_hareket_id;
        END IF;

        UPDATE public.aidatlar SET faiz_yansitildi = FALSE WHERE id = p_aidat_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'faiz_yansitildi', p_active);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
