-- Migration: 20260423000001_sync_aidatlar_on_unit_assignment.sql
-- Description: Automatically assign member to existing unassigned dues when a member is assigned to a unit.

BEGIN;

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.fn_sync_aidatlar_on_unit_assignment()
RETURNS TRIGGER AS $$
BEGIN
    -- Eğer daireye yeni bir üye atandıysa (uye_id NULL iken bir değer atandıysa veya değiştiyse)
    IF (NEW.uye_id IS NOT NULL AND (OLD.uye_id IS NULL OR OLD.uye_id != NEW.uye_id)) THEN
        -- Bu daireye (serefiye_id) ait olan ve henüz bir üyeye atanmamış (uye_id NULL) 
        -- aidat borçlarını yeni üyeye aktar
        UPDATE public.aidatlar
        SET uye_id = NEW.uye_id,
            updated_at = NOW()
        WHERE serefiye_id = NEW.id 
          AND uye_id IS NULL;
          
        RAISE NOTICE 'Daireye (%) atanan yeni üye (%) için sahipsiz aidatlar güncellendi.', NEW.daire_no, NEW.uye_id;
    END IF;

    -- Eğer daireden üye çıkarıldıysa (isteğe bağlı, kullanıcı talep etmedi ama veri tutarlılığı için yararlı olabilir)
    -- Şimdilik sadece atama senaryosuna odaklanıyoruz.

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger on serefiye_tablosu
DROP TRIGGER IF EXISTS trg_sync_aidatlar_on_unit_assignment ON public.serefiye_tablosu;
CREATE TRIGGER trg_sync_aidatlar_on_unit_assignment
AFTER UPDATE OF uye_id ON public.serefiye_tablosu
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_aidatlar_on_unit_assignment();

COMMENT ON FUNCTION public.fn_sync_aidatlar_on_unit_assignment() IS 'Daireye üye atandığında, dairenin sahipsiz aidat borçlarını otomatik olarak yeni üyeye bağlar.';

COMMIT;
