-- Migration: 20260523000001_virman_rpc_banka_hareketleri_proje_id.sql
-- Sprint: fix/virman-banka-hareketleri-proje-id
--
-- ROOT CAUSE (nihayet):
--   `fn_create_virman_atomic` virman başlığını sorunsuz oluşturduktan sonra
--   `banka_hareketleri`'ne iki ek kayıt INSERT ediyordu (gider + gelir uçları),
--   AMA bu INSERT'ler `proje_id` kolonunu set etmiyordu.
--
--   `banka_hareketleri.proje_id` 2026-05-11 tarihli migration
--   `20260511000007_proje_id_not_null.sql` ile NOT NULL'a çevrilmişti.
--   Virman feature'ı 2026-05-20'de eklendi → kör nokta: ikincil tabloya proje_id
--   geçirme atlanmış.
--
-- HATA MESAJI ŞABLONU YANILTICIYDI:
--   PG 23502 hatası `column = 'proje_id'` döndü → errorHandler bunu
--   `"Zorunlu alan eksik: proje_id"` olarak formatladı → herkes (5 PR boyunca)
--   payload'da proje_id'yi aradı; halbuki bug `banka_hareketleri` INSERT'inde,
--   `virmanlar` INSERT'inden SONRA tetikleniyordu.
--
-- FIX: 2 banka_hareketleri INSERT'ine `proje_id` kolonu + `v_proje_id` değeri
-- ekle. Schema/CHECK/imza değişmiyor; tek fark INSERT cümlelerinin kolon listesi.

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

  -- 2. Banka tarafı kayıtları — proje_id zorunlu (NOT NULL, 20260511000007)
  IF v_kaynak_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      proje_id, banka_hesap_id, tarih, tutar, islem_tipi, aciklama, virman_id
    ) VALUES (
      v_proje_id, v_kaynak_id, v_tarih, v_tutar, 'gider',
      COALESCE('Virman (giden): ' || COALESCE(v_aciklama, ''), 'Virman (giden)'),
      v_virman_id
    )
    RETURNING id INTO v_gider_hareket_id;
  END IF;

  IF v_hedef_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      proje_id, banka_hesap_id, tarih, tutar, islem_tipi, aciklama, virman_id
    ) VALUES (
      v_proje_id, v_hedef_id, v_tarih, v_tutar, 'gelir',
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
  'Sprint fix/virman-banka-hareketleri-proje-id: banka_hareketleri INSERT''lerine proje_id eklendi (NOT NULL ihlali nedeniyle 5 sprint süren 23502 hatasının root cause''u).';

COMMIT;
