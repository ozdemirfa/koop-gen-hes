-- Migration: 20260520000001_virmanlar.sql
-- Description: Virman (transfer) feature — banka↔banka, banka↔nakit, nakit↔banka
-- para transferleri.
--
-- Tasarım:
--   - `virmanlar` tablosu virman başlığını tutar.
--   - `kaynak_hesap_id` ve `hedef_hesap_id` NULL olabilir → NULL = nakit kasa
--     (proje düzeyinde ayrı bir nakit hesap tablosu YOK; cari aggregate
--     `odeme_turu='nakit'` üzerinden hesaplanır).
--   - `banka_hareketleri.virman_id` kolonu eklenir → virman silindiğinde CASCADE
--     ile ilgili banka hareketleri de silinir.
--   - `fn_create_virman_atomic` RPC: virman + 2 banka_hareketleri kaydını tek
--     transaction'da oluşturur. Nakit ucu için banka_hareketleri kaydı atlanır.
--   - `fn_delete_virman_atomic` RPC: opsiyonel (CASCADE FK zaten yapıyor, ama
--     audit/log için açıkça çağrılmak istenirse).

BEGIN;

CREATE TABLE IF NOT EXISTS public.virmanlar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id UUID NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  kaynak_hesap_id UUID REFERENCES public.banka_hesaplari(id) ON DELETE SET NULL,
  hedef_hesap_id UUID REFERENCES public.banka_hesaplari(id) ON DELETE SET NULL,
  virman_tipi VARCHAR(20) NOT NULL CHECK (virman_tipi IN ('banka_banka', 'banka_nakit', 'nakit_banka')),
  tutar NUMERIC(14, 2) NOT NULL CHECK (tutar > 0),
  tarih DATE NOT NULL,
  aciklama TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  -- Tip ile NULL kombinasyonunu DB tarafında zorla:
  --   banka_banka  → kaynak + hedef NOT NULL
  --   banka_nakit  → kaynak NOT NULL, hedef NULL
  --   nakit_banka  → kaynak NULL, hedef NOT NULL
  CONSTRAINT virman_tipi_uyumlu CHECK (
    (virman_tipi = 'banka_banka' AND kaynak_hesap_id IS NOT NULL AND hedef_hesap_id IS NOT NULL)
    OR (virman_tipi = 'banka_nakit' AND kaynak_hesap_id IS NOT NULL AND hedef_hesap_id IS NULL)
    OR (virman_tipi = 'nakit_banka' AND kaynak_hesap_id IS NULL AND hedef_hesap_id IS NOT NULL)
  ),
  -- banka_banka için aynı hesaba virman anlamsız
  CONSTRAINT virman_farkli_hesaplar CHECK (
    virman_tipi <> 'banka_banka' OR kaynak_hesap_id <> hedef_hesap_id
  )
);

CREATE INDEX IF NOT EXISTS idx_virmanlar_proje_tarih ON public.virmanlar(proje_id, tarih DESC);
CREATE INDEX IF NOT EXISTS idx_virmanlar_kaynak ON public.virmanlar(kaynak_hesap_id) WHERE kaynak_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_virmanlar_hedef ON public.virmanlar(hedef_hesap_id) WHERE hedef_hesap_id IS NOT NULL;

-- banka_hareketleri ↔ virmanlar bağlantısı — virman silinince CASCADE
ALTER TABLE public.banka_hareketleri
  ADD COLUMN IF NOT EXISTS virman_id UUID REFERENCES public.virmanlar(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_banka_hareketleri_virman ON public.banka_hareketleri(virman_id) WHERE virman_id IS NOT NULL;

-- ─── RPC: fn_create_virman_atomic ──────────────────────────────────────────
-- Tek transaction'da virman başlığı + 2 banka_hareketleri kaydı oluşturur.
-- p_data JSONB alanları:
--   proje_id, virman_tipi, kaynak_hesap_id (null OK), hedef_hesap_id (null OK),
--   tutar, tarih, aciklama
CREATE OR REPLACE FUNCTION public.fn_create_virman_atomic(
  p_data JSONB,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_proje_id UUID;
  v_kaynak_id UUID;
  v_hedef_id UUID;
  v_tipi TEXT;
  v_tutar NUMERIC(14, 2);
  v_tarih DATE;
  v_aciklama TEXT;
  v_virman_id UUID;
  v_gider_hareket_id UUID;
  v_gelir_hareket_id UUID;
BEGIN
  v_proje_id := (p_data->>'proje_id')::UUID;
  v_kaynak_id := NULLIF(p_data->>'kaynak_hesap_id', '')::UUID;
  v_hedef_id := NULLIF(p_data->>'hedef_hesap_id', '')::UUID;
  v_tipi := p_data->>'virman_tipi';
  v_tutar := (p_data->>'tutar')::NUMERIC(14, 2);
  v_tarih := (p_data->>'tarih')::DATE;
  v_aciklama := p_data->>'aciklama';

  IF v_proje_id IS NULL THEN
    RAISE EXCEPTION 'proje_id zorunlu' USING ERRCODE = '23502';
  END IF;
  IF v_tipi IS NULL THEN
    RAISE EXCEPTION 'virman_tipi zorunlu' USING ERRCODE = '23502';
  END IF;
  IF v_tutar IS NULL OR v_tutar <= 0 THEN
    RAISE EXCEPTION 'tutar pozitif olmalı' USING ERRCODE = '22023';
  END IF;
  IF v_tarih IS NULL THEN
    RAISE EXCEPTION 'tarih zorunlu' USING ERRCODE = '23502';
  END IF;

  -- 1. Virman başlığını oluştur (CHECK constraint'ler tipi doğrular)
  INSERT INTO public.virmanlar (
    proje_id, kaynak_hesap_id, hedef_hesap_id, virman_tipi,
    tutar, tarih, aciklama, created_by
  ) VALUES (
    v_proje_id, v_kaynak_id, v_hedef_id, v_tipi,
    v_tutar, v_tarih, v_aciklama, p_actor_id
  )
  RETURNING id INTO v_virman_id;

  -- 2. Banka tarafı kayıtları
  IF v_kaynak_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      banka_hesap_id, tarih, tutar, islem_tipi, aciklama, virman_id
    ) VALUES (
      v_kaynak_id, v_tarih, v_tutar, 'gider',
      COALESCE('Virman (giden): ' || COALESCE(v_aciklama, ''), 'Virman (giden)'),
      v_virman_id
    )
    RETURNING id INTO v_gider_hareket_id;
  END IF;

  IF v_hedef_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      banka_hesap_id, tarih, tutar, islem_tipi, aciklama, virman_id
    ) VALUES (
      v_hedef_id, v_tarih, v_tutar, 'gelir',
      COALESCE('Virman (gelen): ' || COALESCE(v_aciklama, ''), 'Virman (gelen)'),
      v_virman_id
    )
    RETURNING id INTO v_gelir_hareket_id;
  END IF;

  RETURN jsonb_build_object(
    'virman_id', v_virman_id,
    'gider_hareket_id', v_gider_hareket_id,
    'gelir_hareket_id', v_gelir_hareket_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_create_virman_atomic IS
  'Sprint 20260520-virman-feature: virman + banka_hareketleri kayıtlarını tek transaction''da oluşturur. CHECK constraint''ler virman_tipi ↔ NULL hesap kombinasyonunu DB tarafında garantiler.';

COMMIT;
