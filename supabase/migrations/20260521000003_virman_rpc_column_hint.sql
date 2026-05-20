-- Migration: 20260521000003_virman_rpc_column_hint.sql
-- Sprint: role-system-modernization (PR-B yan bug fix)
-- Description: fn_create_virman_atomic RAISE EXCEPTION'larına `USING COLUMN`
--   hint ekler — errorHandler.ts 23502 case'i `supaErr.column` üzerinden
--   eksik field'ı tespit edip frontend'e doğru field path döndürebilsin.
--
-- BUG: Önceki sürümde virman POST 400 dönüyordu ama mesaj "Zorunlu alan
--   eksik: proje_id" şeklinde frontend'e ulaşıyordu — payload'da proje_id
--   varken. Sebep: errorHandler `column "..."` pattern'i RAISE EXCEPTION
--   metninde bulamıyor, ama PostgreSQL'in 23502 SQLSTATE'i column yoksa
--   default mesaj döndürüyor. `USING COLUMN = '...'` set edersek
--   supaErr.column property dolu gelir ve errorHandler doğru field path
--   üretir.

BEGIN;

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
    RAISE EXCEPTION 'proje_id zorunlu'
      USING ERRCODE = '23502', COLUMN = 'proje_id';
  END IF;
  IF v_tipi IS NULL THEN
    RAISE EXCEPTION 'virman_tipi zorunlu'
      USING ERRCODE = '23502', COLUMN = 'virman_tipi';
  END IF;
  IF v_tutar IS NULL OR v_tutar <= 0 THEN
    RAISE EXCEPTION 'tutar pozitif olmalı'
      USING ERRCODE = '22023', COLUMN = 'tutar';
  END IF;
  IF v_tarih IS NULL THEN
    RAISE EXCEPTION 'tarih zorunlu'
      USING ERRCODE = '23502', COLUMN = 'tarih';
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
  'PR-B fix: RAISE EXCEPTION''lara USING COLUMN hint eklendi — errorHandler ts 23502 case''i için doğru field path döndürmesi sağlandı.';

COMMIT;
