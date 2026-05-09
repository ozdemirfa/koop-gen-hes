-- Migration: 20260510000003_cari_hareket_idempotency_unique.sql
-- Description: cari_hareketler tablosunda (kaynak_tipi, kaynak_id) çifti üzerinde
-- partial unique index. RPC'lerimiz (fn_create_fatura_atomic, fn_bulk_charge_interest)
-- zaten idempotent EXISTS-then-update mantığı uyguluyor; bu constraint race condition
-- senaryosunda iki paralel insert'in çift kayıt üretmesini engeller.
--
-- WHERE kaynak_id IS NOT NULL: manuel cari hareketlerde (örn. açılış kaydı, manuel
-- düzeltme) kaynak_id boş olabilir; onları kapsam dışında tutar.

-- 1. Önce mevcut duplicate kayıtları rapor et ve varsa migration'ı durdur
DO $$
DECLARE
    dup_count INTEGER;
    dup_record RECORD;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT kaynak_tipi, kaynak_id
        FROM public.cari_hareketler
        WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL
        GROUP BY kaynak_tipi, kaynak_id
        HAVING COUNT(*) > 1
    ) t;

    IF dup_count > 0 THEN
        RAISE WARNING 'cari_hareketler: % adet (kaynak_tipi, kaynak_id) çifti birden fazla satıra sahip', dup_count;
        FOR dup_record IN
            SELECT kaynak_tipi, kaynak_id, COUNT(*) AS cnt
            FROM public.cari_hareketler
            WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL
            GROUP BY kaynak_tipi, kaynak_id
            HAVING COUNT(*) > 1
            ORDER BY cnt DESC
            LIMIT 10
        LOOP
            RAISE WARNING '  duplicate: kaynak_tipi=%, kaynak_id=%, count=%',
                dup_record.kaynak_tipi, dup_record.kaynak_id, dup_record.cnt;
        END LOOP;
        RAISE EXCEPTION 'Migration durduruldu: önce duplicate cari_hareketler manuel olarak temizlenmelidir. (En sık 10 çift yukarıda)';
    END IF;
END $$;

-- 2. Partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_cari_hareketler_kaynak
    ON public.cari_hareketler (kaynak_tipi, kaynak_id)
    WHERE kaynak_id IS NOT NULL AND kaynak_tipi IS NOT NULL;
