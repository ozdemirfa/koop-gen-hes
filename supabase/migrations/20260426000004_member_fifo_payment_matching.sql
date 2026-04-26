-- Migration: 20260426000003_member_fifo_payment_matching.sql
-- Description: Implement FIFO matching for member payments and dues.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_match_member_payments_fifo(p_proje_id UUID, p_uye_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_total_unmatched_payment NUMERIC(14,2) := 0;
    v_aidat RECORD;
    v_payment RECORD;
    v_payment_split RECORD;
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
        
        -- While this specific payment has remaining amount, try matching with oldest dues
        WHILE v_total_unmatched_payment > 0 LOOP
            -- Find the oldest unpaid aidat
            -- We calculate remaining balance for each aidat dynamically
            SELECT 
                a.id, 
                ((at.katsayi_tutari * COALESCE(s.serefiye_orani, 1.00)) + COALESCE(a.gecikme_faizi, 0)) as toplam_borc,
                COALESCE((SELECT SUM(alacak) FROM public.cari_hareketler WHERE kaynak_tipi = 'aidat' AND kaynak_id = a.id), 0) as odenen_tutar
            INTO v_aidat
            FROM public.aidatlar a
            JOIN public.aidat_tanimlari at ON a.aidat_tanimi_id = at.id
            JOIN public.serefiye_tablosu s ON a.serefiye_id = s.id
            WHERE a.proje_id = p_proje_id 
              AND a.uye_id = p_uye_id 
              AND a.durum IN ('bekliyor', 'gecikti')
            ORDER BY a.son_odeme_tarihi ASC, a.created_at ASC
            LIMIT 1;

            -- No more dues to match
            IF v_aidat IS NULL THEN
                EXIT; 
            END IF;

            v_match_amount := LEAST(v_total_unmatched_payment, (v_aidat.toplam_borc - v_aidat.odenen_tutar));
            
            IF v_match_amount <= 0 THEN
                EXIT;
            END IF;

            -- Splitting Logic:
            -- If the payment is exactly the match amount, just update it.
            -- If the payment is larger, split it into two: one for this aidat, one remaining unmatched.
            IF v_total_unmatched_payment = v_match_amount THEN
                UPDATE public.cari_hareketler 
                SET kaynak_tipi = 'aidat', kaynak_id = v_aidat.id 
                WHERE id = v_payment.id;
                
                v_total_unmatched_payment := 0;
            ELSE
                -- Split: Update current movement to the match amount
                UPDATE public.cari_hareketler 
                SET borc = v_match_amount, kaynak_tipi = 'aidat', kaynak_id = v_aidat.id 
                WHERE id = v_payment.id;

                -- Create new movement for the remaining amount (keep it unmatched)
                INSERT INTO public.cari_hareketler (
                    proje_id, cari_hesap_id, islem_turu, odeme_turu, tarih, borc, alacak, aciklama, belge_no, banka_hesap_id
                ) VALUES (
                    p_proje_id, v_cari_id, 'gelen_odeme', v_payment.odeme_turu, v_payment.tarih, 
                    (v_total_unmatched_payment - v_match_amount), 0, v_payment.aciklama, v_payment.belge_no, v_payment.banka_hesap_id
                ) RETURNING id INTO v_payment.id; -- Update current payment ID for next iteration if needed

                v_total_unmatched_payment := (v_total_unmatched_payment - v_match_amount);
            END IF;

            -- Update Aidat Status
            IF (v_aidat.odenen_tutar + v_match_amount) >= v_aidat.toplam_borc THEN
                UPDATE public.aidatlar SET durum = 'odendi' WHERE id = v_aidat.id;
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

COMMIT;
