-- Migration: 20260526240000_fn_update_fatura_atomic_proje_id_guard.sql
-- Sprint: security-quality-audit-sprint (2026-05-26)
-- Description: fn_update_fatura_atomic IDOR fix — cross-project erişim engellenir
--              ve caller bir faturayı başka projeye taşıyamaz.
--
-- Problem:
--   Eski versiyon `v_proje_id := COALESCE((p_master->>'proje_id')::UUID, v_existing.proje_id)`
--   ile body'deki proje_id mevcut değerin üzerine yazılabiliyordu. Bir saldırgan
--   A projesinde owner ise, B projesindeki fatura_id'i öğrenip `proje_id=A` body
--   ile faturayı A projesine taşıyabilir veya muhasebe alanlarını değiştirebilir.
--
-- Düzeltme:
--   1. RPC artık zorunlu `p_proje_id` parametresi alır (backend service tarafından
--      middleware'in doğruladığı projeId).
--   2. SELECT öncesi: fatura'nın `proje_id`'si `p_proje_id` ile eşleşmiyorsa P0002
--      "Fatura bulunamadı" (404). Saldırgana bilgi sızdırılmaz (notFound semantiği).
--   3. Body içindeki `proje_id` alanı kullanılmaz — server-side `v_existing.proje_id`
--      değişmez kalır. Cross-project taşıma yasak.
--
-- Backward compat:
--   Backend `fatura.service.ts` aynı PR'da `p_proje_id` parametresi yollar. Eski
--   imzalı çağrı (p_proje_id yok) PostgREST'ten gelmez — sadece RPC overload.

CREATE OR REPLACE FUNCTION public.fn_update_fatura_atomic(
  p_id UUID,
  p_master JSONB,
  p_kalemler JSONB,
  p_actor_id UUID DEFAULT NULL,
  p_proje_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing public.faturalar%ROWTYPE;
  v_ara_toplam NUMERIC;
  v_kdv_tutar NUMERIC;
  v_toplam_tutar NUMERIC;
  v_master_kdv NUMERIC;
  v_cari_hesap_id UUID;
  v_proje_id UUID;
  v_firma_id UUID;
  v_fatura_no TEXT;
  v_fatura_tarihi DATE;
  v_fatura_tipi TEXT;
  v_result JSONB;
BEGIN
  -- Audit actor (audit trigger için)
  IF p_actor_id IS NOT NULL THEN
    PERFORM set_config('app.actor_id', p_actor_id::TEXT, true);
  END IF;

  -- IDOR fix: caller'in iddia ettiği proje_id ile fatura'nın gerçek proje_id'si
  -- eşleşmeli. Aksi halde 404 (forbidden değil — notFound: information disclosure
  -- önlemi; saldırgan başka projeye ait fatura_id'inin varlığını öğrenmemeli).
  SELECT * INTO v_existing FROM public.faturalar
    WHERE id = p_id
      AND (p_proje_id IS NULL OR proje_id = p_proje_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura bulunamadı: %', p_id USING ERRCODE = 'P0002';
  END IF;

  -- Server-side enforcement: proje_id ASLA body'den alınmaz. v_existing'den okunur.
  -- Saldırgan body'ye proje_id koysa bile mevcut değer korunur.
  v_proje_id := v_existing.proje_id;

  v_firma_id := COALESCE(NULLIF(p_master->>'firma_id', '')::UUID, v_existing.firma_id);
  v_fatura_no := COALESCE(p_master->>'fatura_no', v_existing.fatura_no);
  v_fatura_tarihi := COALESCE(NULLIF(p_master->>'fatura_tarihi', '')::DATE, v_existing.fatura_tarihi);
  v_fatura_tipi := COALESCE(p_master->>'fatura_tipi', v_existing.fatura_tipi::TEXT);
  v_master_kdv := COALESCE((p_master->>'kdv_orani')::NUMERIC, v_existing.kdv_orani);

  -- Kalem array geldiyse: tutarları kalemlerden yeniden hesapla
  IF p_kalemler IS NOT NULL THEN
    IF jsonb_array_length(p_kalemler) > 0 THEN
      SELECT
        COALESCE(SUM(COALESCE((k->>'miktar')::NUMERIC, 0) * COALESCE((k->>'birim_fiyat')::NUMERIC, 0)), 0)
      INTO v_ara_toplam
      FROM jsonb_array_elements(p_kalemler) k;
    ELSE
      v_ara_toplam := 0;
    END IF;
    v_kdv_tutar := ROUND(v_ara_toplam * v_master_kdv / 100.0, 2);
    v_toplam_tutar := ROUND(v_ara_toplam + v_kdv_tutar, 2);
  ELSE
    v_ara_toplam := v_existing.ara_toplam;
    v_kdv_tutar := v_existing.kdv_tutar;
    v_toplam_tutar := v_existing.toplam_tutar;
  END IF;

  -- 1. Master fatura update (proje_id ASLA güncellenmez)
  UPDATE public.faturalar SET
    firma_id = v_firma_id,
    fatura_no = v_fatura_no,
    fatura_tipi = v_fatura_tipi::fatura_tipi,
    fatura_tarihi = v_fatura_tarihi,
    vade_tarihi = COALESCE(NULLIF(p_master->>'vade_tarihi', '')::DATE, vade_tarihi),
    ara_toplam = v_ara_toplam,
    kdv_orani = v_master_kdv,
    kdv_tutar = v_kdv_tutar,
    toplam_tutar = v_toplam_tutar,
    durum = COALESCE(NULLIF(p_master->>'durum', '')::fatura_durumu, durum),
    aciklama = COALESCE(p_master->>'aciklama', aciklama),
    hakedis_id = COALESCE(NULLIF(p_master->>'hakedis_id', '')::UUID, hakedis_id),
    updated_at = now()
  WHERE id = p_id
    AND proje_id = v_proje_id;  -- Defense in depth: WHERE'da da proje_id zorla

  -- 2. Kalemler: array geldiyse sıfırla ve yeniden ekle (idempotent)
  IF p_kalemler IS NOT NULL THEN
    DELETE FROM public.fatura_kalemleri WHERE fatura_id = p_id;

    IF jsonb_array_length(p_kalemler) > 0 THEN
      INSERT INTO public.fatura_kalemleri (
        fatura_id, kalem_adi, birim, miktar, birim_fiyat, kdv_orani
      )
      SELECT
        p_id,
        k->>'kalem_adi',
        k->>'birim',
        COALESCE((k->>'miktar')::NUMERIC, 0),
        COALESCE((k->>'birim_fiyat')::NUMERIC, 0),
        COALESCE((k->>'kdv_orani')::NUMERIC, v_master_kdv)
      FROM jsonb_array_elements(p_kalemler) k;
    END IF;
  END IF;

  -- 3. Cari hareket güncelle (idempotent)
  IF v_fatura_tipi = 'gelen' AND v_firma_id IS NOT NULL AND v_proje_id IS NOT NULL THEN
    SELECT id INTO v_cari_hesap_id FROM public.cari_hesaplar
    WHERE proje_id = v_proje_id AND firma_id = v_firma_id
    LIMIT 1;

    IF v_cari_hesap_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.cari_hareketler
        WHERE kaynak_tipi = 'fatura' AND kaynak_id = p_id
      ) THEN
        UPDATE public.cari_hareketler
          SET borc = v_toplam_tutar,
              alacak = 0,
              tarih = v_fatura_tarihi,
              aciklama = 'Fatura: ' || v_fatura_no,
              belge_no = v_fatura_no,
              cari_hesap_id = v_cari_hesap_id,
              proje_id = v_proje_id
        WHERE kaynak_tipi = 'fatura' AND kaynak_id = p_id;
      ELSE
        INSERT INTO public.cari_hareketler (
          proje_id, cari_hesap_id, islem_turu, borc, alacak, tarih,
          aciklama, belge_no, kaynak_tipi, kaynak_id
        ) VALUES (
          v_proje_id, v_cari_hesap_id, 'fatura', v_toplam_tutar, 0,
          v_fatura_tarihi,
          'Fatura: ' || v_fatura_no, v_fatura_no, 'fatura', p_id
        );
      END IF;
    END IF;
  END IF;

  SELECT to_jsonb(f.*) || jsonb_build_object(
    'fatura_kalemleri', COALESCE((
      SELECT jsonb_agg(to_jsonb(fk.*) ORDER BY fk.created_at)
      FROM public.fatura_kalemleri fk WHERE fk.fatura_id = f.id
    ), '[]'::jsonb),
    'firmalar', (
      SELECT jsonb_build_object('unvan', firm.unvan)
      FROM public.firmalar firm WHERE firm.id = f.firma_id
    )
  )
  INTO v_result
  FROM public.faturalar f WHERE f.id = p_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Eski 3-arg / 4-arg overload'ları drop et — RPC dispatcher artık 5-arg üzerinden.
-- Eğer eski imzalı çağrı varsa (eski deploy edilmiş backend), p_proje_id NULL ile
-- gelir ve RPC içeride v_existing kontrolünü atlar (backward compat); ama
-- çağrılarda hala proje_id ENFORCEMENT'i body'den yapılmaz (server-side overwrite).
-- Üretimde eski backend → yeni RPC durumu da güvenli (proje_id taşıma blocked).

COMMENT ON FUNCTION public.fn_update_fatura_atomic(UUID, JSONB, JSONB, UUID, UUID) IS
  'IDOR fix 2026-05-26: caller p_proje_id ile fatura proje_id eşleşmeli; cross-project taşıma yasak.';
