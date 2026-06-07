-- Migration: 20260607000002_kurumsal_cari.sql
-- Sprint: kurumsal-cari-revizyonlar (2026-06-07) — Rev 1
-- Description: Kurumsal cari tipi + Kurum Ödemeleri.
--   SGK / Elektrik / Belediye gibi kurumlara yapılan giden ödemeler tek hamlede,
--   net-sıfır (borç+alacak) olarak kaydedilir = "anında hesap kapama".
--
--   Muhasebe modeli (kurum cari hareketi çifti, ortak kaynak_id=group):
--     - GİDER satırı : islem_turu='kurum_gider', borc=tutar, odeme_turu=NULL
--                      (tahakkuk; nakde/bankaya etki etmez — gider raporlarına yansır)
--     - ÖDEME satırı : islem_turu='giden_odeme', alacak=tutar, odeme_turu=<nakit|banka|kredi_karti>
--                      (gerçek para çıkışı; banka ise banka_hareketleri'ne bağlı)
--   → kurum cari bakiyesi = alacak - borc = 0 (kapalı); kasa/banka doğru azalır.
--
--   Kurum kapsamı = owner-geneli (firmalar pattern'i ile birebir, 20260531150000).
--
-- NOT: fn_create_kurum_payment_atomic huzur hakkı dağıtımını ÇAĞIRMAZ; o hook
--   20260607000003 (Rev 2) içinde eklenir (yonetim_huzur_hakki tablosu orada genelleşir).

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. kurumlar tablosu (owner-scoped, firmalar pattern'i)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kurumlar (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kurum_adi   VARCHAR(255) NOT NULL,
    kurum_turu  VARCHAR(100),            -- serbest etiket: 'SGK','Elektrik','Belediye', ...
    vergi_no    VARCHAR(11),
    telefon     VARCHAR(20),
    aciklama    TEXT,
    aktif       BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_kurumlar_owner_adi UNIQUE (owner_id, kurum_adi)
);

COMMENT ON TABLE public.kurumlar IS
  'Kurumsal cari kaynakları (SGK/Elektrik/Belediye vb.), owner-bazlı (firmalar pattern''i).';

CREATE INDEX IF NOT EXISTS idx_kurumlar_owner_id ON public.kurumlar (owner_id);

ALTER TABLE public.kurumlar ENABLE ROW LEVEL SECURITY;

-- RLS: firmalar (20260531150000) ile aynı owner-bazlı görünürlük.
DROP POLICY IF EXISTS kurumlar_select ON public.kurumlar;
CREATE POLICY kurumlar_select ON public.kurumlar
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.proje_uyelikleri pu
      JOIN public.proje_uyelikleri po
        ON po.proje_id = pu.proje_id AND po.rol = 'owner'
      WHERE pu.user_id = auth.uid() AND po.user_id = kurumlar.owner_id
    )
  );

DROP POLICY IF EXISTS kurumlar_modify ON public.kurumlar;
CREATE POLICY kurumlar_modify ON public.kurumlar
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.proje_uyelikleri pu
      JOIN public.proje_uyelikleri po
        ON po.proje_id = pu.proje_id AND po.rol = 'owner'
      WHERE pu.user_id = auth.uid()
        AND pu.rol IN ('owner','manager')
        AND po.user_id = kurumlar.owner_id
    )
  )
  WITH CHECK (
    public.is_admin()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.proje_uyelikleri pu
      JOIN public.proje_uyelikleri po
        ON po.proje_id = pu.proje_id AND po.rol = 'owner'
      WHERE pu.user_id = auth.uid()
        AND pu.rol IN ('owner','manager')
        AND po.user_id = kurumlar.owner_id
    )
  );

-- updated_at trigger (ortak public.update_updated_at fonksiyonu — 20260407130800)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS set_updated_at ON public.kurumlar;
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.kurumlar
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. cari_hesaplar genişletme: kurumsal tipi + kurum_id
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cari_hesaplar
  ADD COLUMN IF NOT EXISTS kurum_id UUID REFERENCES public.kurumlar(id) ON DELETE CASCADE;

-- cari_turu list CHECK → genişlet. İsimden bağımsız bırak: cari_turu'yu içeren ama
-- entite check'i (uye_id geçen) OLMAYAN tüm check constraint'leri düşür (inline auto-name
-- ortamlar arası farklı olabilir → stale 'uye/firma' constraint'i 'kurumsal'ı reddetmesin).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cari_hesaplar'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%cari_turu%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%uye_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.cari_hesaplar DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.cari_hesaplar
  ADD CONSTRAINT cari_hesaplar_cari_turu_check
  CHECK (cari_turu IN ('uye', 'firma', 'kurumsal'));

-- check_entite_exists → kurumsal kolu ekle (tam olarak bir entite dolu olmalı).
ALTER TABLE public.cari_hesaplar DROP CONSTRAINT IF EXISTS check_entite_exists;
ALTER TABLE public.cari_hesaplar
  ADD CONSTRAINT check_entite_exists CHECK (
    (cari_turu = 'uye'      AND uye_id   IS NOT NULL AND firma_id IS NULL AND kurum_id IS NULL) OR
    (cari_turu = 'firma'    AND firma_id IS NOT NULL AND uye_id   IS NULL AND kurum_id IS NULL) OR
    (cari_turu = 'kurumsal' AND kurum_id IS NOT NULL AND uye_id   IS NULL AND firma_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_cari_hesaplar_proje_kurum
  ON public.cari_hesaplar (proje_id, kurum_id) WHERE kurum_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cari_hesaplar_kurum_id ON public.cari_hesaplar (kurum_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. cari_hareketler.islem_turu CHECK → 'kurum_gider' ekle (mevcut tüm değerler korunur)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
    ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
  END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check
CHECK (islem_turu IN (
  'aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme',
  'gecikme_faizi', 'fatura', 'iade_odeme', 'uyelik_baslangic',
  'virman_nakit_giris', 'virman_nakit_cikis',
  'yonetim_odeme_nakit_giris', 'yonetim_odeme_nakit_cikis',
  'yonetim_odeme_banka_giris', 'yonetim_odeme_banka_cikis',
  'kurum_gider'
));

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Auto-create cari trigger'ları (firmalar pattern'i, 20260531150000)
-- ────────────────────────────────────────────────────────────────────────────
-- 4a. Kurum eklenince/güncellenince owner'ın TÜM projelerinde cari aç.
CREATE OR REPLACE FUNCTION public.fn_auto_create_cari_hesap_for_kurum()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, kurum_id)
    SELECT pu.proje_id, NEW.kurum_adi, 'kurumsal', NEW.id
    FROM public.proje_uyelikleri pu
    WHERE pu.user_id = NEW.owner_id AND pu.rol = 'owner'
    ON CONFLICT (proje_id, kurum_id) DO UPDATE
    SET cari_adi = EXCLUDED.cari_adi;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_auto_create_cari_hesap_kurum ON public.kurumlar;
CREATE TRIGGER trg_auto_create_cari_hesap_kurum
AFTER INSERT OR UPDATE ON public.kurumlar
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_cari_hesap_for_kurum();

-- 4b. Owner yeni projenin sahibi olunca, o owner'ın TÜM kurumları için cari aç.
CREATE OR REPLACE FUNCTION public.fn_auto_create_kurum_cari_for_owner_project()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rol = 'owner' THEN
        INSERT INTO public.cari_hesaplar (proje_id, cari_adi, cari_turu, kurum_id)
        SELECT NEW.proje_id, k.kurum_adi, 'kurumsal', k.id
        FROM public.kurumlar k
        WHERE k.owner_id = NEW.user_id
        ON CONFLICT (proje_id, kurum_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_kurum_cari_for_owner_project ON public.proje_uyelikleri;
CREATE TRIGGER trg_kurum_cari_for_owner_project
AFTER INSERT ON public.proje_uyelikleri
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_kurum_cari_for_owner_project();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. fn_create_kurum_payment_atomic — gider+ödeme çifti, net-sıfır, banka entegre
--    (bakiye kontrolü fn_create_payment_atomic 20260524000004 ile aynı strateji)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_create_kurum_payment_atomic(
  p_proje_id       UUID,
  p_kurum_cari_id  UUID,
  p_tutar          NUMERIC,
  p_odeme_turu     TEXT,
  p_banka_hesap_id UUID DEFAULT NULL,
  p_tarih          DATE DEFAULT CURRENT_DATE,
  p_aciklama       TEXT DEFAULT NULL,
  p_actor_id       UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_group_id        UUID := gen_random_uuid();
  v_gider_id        UUID;
  v_odeme_id        UUID;
  v_banka_hareket_id UUID;
  v_bakiye          NUMERIC;
  v_cari_turu       TEXT;
  v_aciklama        TEXT;
BEGIN
  PERFORM set_config('app.actor_id', COALESCE(p_actor_id::TEXT, ''), true);

  IF p_odeme_turu NOT IN ('nakit', 'banka', 'kredi_karti') THEN
    RAISE EXCEPTION 'Geçersiz ödeme türü: % (nakit/banka/kredi_karti)', p_odeme_turu
      USING ERRCODE = 'P0001';
  END IF;

  -- Cari hesap kurumsal mı? (defense-in-depth; servis zaten doğrular)
  SELECT cari_turu INTO v_cari_turu FROM public.cari_hesaplar
   WHERE id = p_kurum_cari_id AND proje_id = p_proje_id;
  IF v_cari_turu IS NULL THEN
    RAISE EXCEPTION 'Kurum cari hesabı bulunamadı' USING ERRCODE = 'P0001';
  END IF;
  IF v_cari_turu <> 'kurumsal' THEN
    RAISE EXCEPTION 'Bu işlem yalnızca kurumsal cari için yapılabilir' USING ERRCODE = 'P0001';
  END IF;

  v_aciklama := COALESCE(NULLIF(p_aciklama, ''), 'Kurum Ödemesi');

  -- Bakiye kontrolü (gerçek para çıkışı: nakit/banka)
  IF p_odeme_turu = 'banka' THEN
    IF p_banka_hesap_id IS NULL THEN
      RAISE EXCEPTION 'banka_hesap_id zorunlu (banka modunda)'
        USING ERRCODE = '23502', COLUMN = 'banka_hesap_id';
    END IF;
    PERFORM 1 FROM public.banka_hesaplari WHERE id = p_banka_hesap_id FOR UPDATE;
    SELECT bakiye INTO v_bakiye
      FROM public.fn_banka_hesaplari_with_bakiye(p_proje_id)
      WHERE id = p_banka_hesap_id;
    IF v_bakiye IS NULL THEN
      RAISE EXCEPTION 'Banka hesabı bulunamadı' USING ERRCODE = 'P0001';
    END IF;
    IF v_bakiye < p_tutar THEN
      RAISE EXCEPTION 'Banka bakiyesi yetersiz (mevcut: % TL, talep: % TL)', v_bakiye, p_tutar
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_odeme_turu = 'nakit' THEN
    PERFORM pg_advisory_xact_lock(hashtext('nakit_kasa:' || p_proje_id::text));
    SELECT COALESCE(SUM(borc) - SUM(alacak), 0) INTO v_bakiye
      FROM public.cari_hareketler
      WHERE proje_id = p_proje_id AND odeme_turu = 'nakit';
    IF v_bakiye < p_tutar THEN
      RAISE EXCEPTION 'Nakit kasa bakiyesi yetersiz (mevcut: % TL, talep: % TL)', v_bakiye, p_tutar
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- GİDER satırı (tahakkuk; odeme_turu=NULL → kasa/banka'yı etkilemez)
  INSERT INTO public.cari_hareketler (
    proje_id, cari_hesap_id, islem_turu, tarih, borc, alacak,
    aciklama, kaynak_tipi, kaynak_id
  ) VALUES (
    p_proje_id, p_kurum_cari_id, 'kurum_gider', p_tarih, p_tutar, 0,
    v_aciklama, 'kurum_odeme', v_group_id
  ) RETURNING id INTO v_gider_id;

  -- ÖDEME satırı (gerçek para çıkışı)
  INSERT INTO public.cari_hareketler (
    proje_id, cari_hesap_id, islem_turu, odeme_turu, odeme_yontemi, tarih,
    borc, alacak, aciklama, banka_hesap_id, kaynak_tipi, kaynak_id
  ) VALUES (
    p_proje_id, p_kurum_cari_id, 'giden_odeme', p_odeme_turu, p_odeme_turu::public.odeme_yontemi, p_tarih,
    0, p_tutar, v_aciklama, NULLIF(p_banka_hesap_id::text, '')::uuid, 'kurum_odeme', v_group_id
  ) RETURNING id INTO v_odeme_id;

  -- Banka hareketi (yalnız banka ödemesi)
  IF p_odeme_turu = 'banka' AND p_banka_hesap_id IS NOT NULL THEN
    INSERT INTO public.banka_hareketleri (
      banka_hesap_id, proje_id, tarih, tutar, islem_tipi,
      aciklama, eslesen_cari_hareket_id, eslesti
    ) VALUES (
      p_banka_hesap_id, p_proje_id, p_tarih, p_tutar, 'gider'::public.islem_tipi,
      v_aciklama, v_odeme_id, TRUE
    ) RETURNING id INTO v_banka_hareket_id;

    UPDATE public.cari_hareketler SET banka_hareket_id = v_banka_hareket_id WHERE id = v_odeme_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', v_group_id,
    'gider_id', v_gider_id,
    'odeme_id', v_odeme_id,
    'tutar', p_tutar
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.fn_create_kurum_payment_atomic IS
  'Kurum ödemesi: kurum_gider (borç, tahakkuk) + giden_odeme (alacak, gerçek para) çifti '
  'atomik; net-sıfır cari (anında hesap kapama). Banka ise banka_hareketleri bağlanır. '
  'Bakiye kontrolü nakit/banka için (FOR UPDATE / advisory lock). Huzur hakkı hook''u '
  '20260607000003''te eklenir.';

COMMIT;
