-- Create birikmis_teminatlar table
CREATE TABLE IF NOT EXISTS public.birikmis_teminatlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proje_id UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
    firma_id UUID NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
    birikmis_teminat NUMERIC(15,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_proje_firma_teminat UNIQUE(proje_id, firma_id)
);

COMMENT ON TABLE public.birikmis_teminatlar IS 'Firmaların projeler bazındaki birikmiş teminat tutarlarını tutar.';
ALTER TABLE public.birikmis_teminatlar ENABLE ROW LEVEL SECURITY;

-- Add teminat_kesinti_orani to hakedisler if not present (assuming it exists based on requirements context)
-- If not, let's assume there is a teminat_tutari in hakedisler based on typical Hakedis schema
-- We'll create a function to handle the update
CREATE OR REPLACE FUNCTION public.fn_update_birikmis_teminat()
RETURNS TRIGGER AS $$
DECLARE
    v_proje_id UUID;
    v_firma_id UUID;
    v_teminat_tutari NUMERIC(15,2);
BEGIN
    -- Get project and firm from hakedis
    SELECT proje_id, firma_id, teminat_kesintisi INTO v_proje_id, v_firma_id, v_teminat_tutari
    FROM public.hakedisler WHERE id = NEW.id;

    IF v_proje_id IS NOT NULL AND v_firma_id IS NOT NULL AND v_teminat_tutari > 0 THEN
        INSERT INTO public.birikmis_teminatlar (proje_id, firma_id, birikmis_teminat)
        VALUES (v_proje_id, v_firma_id, v_teminat_tutari)
        ON CONFLICT (proje_id, firma_id)
        DO UPDATE SET
            birikmis_teminat = public.birikmis_teminatlar.birikmis_teminat + v_teminat_tutari,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_hakedis_teminat_update
AFTER INSERT OR UPDATE OF durum ON public.hakedisler
FOR EACH ROW
WHEN (NEW.durum = 'onaylandi' AND NEW.teminat_kesintisi > 0)
EXECUTE FUNCTION public.fn_update_birikmis_teminat();

-- Function for Teminat Iadesi
CREATE OR REPLACE FUNCTION public.fn_process_teminat_iadesi(
    p_proje_id UUID,
    p_firma_id UUID,
    p_tutar NUMERIC(15,2),
    p_cari_hesap_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Update birikmis_teminatlar
    UPDATE public.birikmis_teminatlar
    SET birikmis_teminat = birikmis_teminat - p_tutar,
        updated_at = NOW()
    WHERE proje_id = p_proje_id AND firma_id = p_firma_id;

    -- Insert into cari_hareketler
    INSERT INTO public.cari_hareketler (
        cari_hesap_id,
        proje_id,
        aciklama,
        odeme_turu,
        alacak,
        borc,
        tarih
    ) VALUES (
        p_cari_hesap_id,
        p_proje_id,
        'Teminat İadesi',
        'teminat',
        p_tutar, -- Proje perspektifinde ödeme çıkışı (alacak)
        0,
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
