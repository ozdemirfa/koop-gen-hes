-- Migration: 20260519000002_fn_undo_baslangic_bedeli_closure.sql
-- Description: Üyelik başlangıç bedeli tahakkuku üzerine FIFO ile eşleşmiş tahsilat
-- kayıtlarını geri al (kapama iptal). fn_undo_aidat_closure pattern'iyle aynı —
-- sadece kaynak_tipi 'baslangic_bedeli' filtresi kullanır.
--
-- Bug bağlamı: UyeDetailPage Aidat Hesapları sekmesinde başlangıç bedeli
-- tahakkukları virtual row olarak gösteriliyor; "Geri Al" butonu önceden aidat
-- undo endpoint'ine "bb-<uuid>" malformed id ile request atıp 400 alıyordu.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_undo_baslangic_bedeli_closure(
  p_tahakkuk_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_cleared_count INT;
    v_tahakkuk_exists BOOLEAN;
BEGIN
    -- Audit actor binding
    PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

    -- 1. Tahakkuk var mı? (uyelik_baslangic + alacak>0 satırı)
    SELECT EXISTS (
        SELECT 1 FROM public.cari_hareketler
        WHERE id = p_tahakkuk_id
          AND islem_turu = 'uyelik_baslangic'
          AND COALESCE(alacak, 0) > 0
    ) INTO v_tahakkuk_exists;

    IF NOT v_tahakkuk_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Başlangıç bedeli tahakkuku bulunamadı.'
        );
    END IF;

    -- 2. Bu tahakkuka bağlı tüm eşleşmeleri temizle
    UPDATE public.cari_hareketler
    SET kaynak_tipi = NULL,
        kaynak_id   = NULL
    WHERE kaynak_tipi = 'baslangic_bedeli'
      AND kaynak_id   = p_tahakkuk_id;

    GET DIAGNOSTICS v_cleared_count = ROW_COUNT;

    IF v_cleared_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Bu başlangıç bedeli tahakkukuna bağlı kapama (eşleşme) bulunamadı.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', format('%s eşleşme kaldırıldı.', v_cleared_count),
        'cleared_count', v_cleared_count,
        'tahakkuk_id', p_tahakkuk_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_undo_baslangic_bedeli_closure(UUID, UUID) IS
'Üyelik başlangıç bedeli tahakkukuna bağlı FIFO eşleşmelerini temizler. '
'fn_undo_aidat_closure muadili, kaynak_tipi=''baslangic_bedeli'' filtresi kullanır.';

COMMIT;
