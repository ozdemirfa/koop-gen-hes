-- 1. In-Memory Aggregation Fix (RPC)
CREATE OR REPLACE FUNCTION get_aidat_summary()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'toplam_aidat', COALESCE(SUM(tutar + COALESCE(gecikme_faizi, 0)), 0),
    'toplam_tahsilat', COALESCE(SUM(odenen_tutar), 0),
    'bekleyen', COALESCE(SUM(CASE WHEN durum = 'bekliyor' THEN tutar ELSE 0 END), 0),
    'geciken', COALESCE(SUM(CASE WHEN durum = 'gecikti' THEN tutar + COALESCE(gecikme_faizi, 0) ELSE 0 END), 0),
    'toplam_gecikme_faizi', COALESCE(SUM(COALESCE(gecikme_faizi, 0)), 0)
  ) INTO result
  FROM aidatlar;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Wide-Open RLS Policy Fix
-- user_roles tablosu oluştur
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- RLS'yi aktif et
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- user_roles için policy (sadece adminler görebilir/yönetebilir)
CREATE POLICY "Admins can manage user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Rol kontrol fonksiyonları
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_staff() 
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'staff')
  );
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mevcut blanket policy'leri kaldır ve yenilerini ekle
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'user_roles'
  LOOP
    -- Eski policy'yi sil
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON public.%I', tbl);
    
    -- Yeni kısıtlayıcı policy'ler:
    -- 1. Adminler her şeyi yapabilir
    EXECUTE format(
      'CREATE POLICY "Admins have full access" ON public.%I FOR ALL TO authenticated USING (public.is_admin())',
      tbl
    );
    
    -- 2. Staff üyeleri okuma yapabilir
    EXECUTE format(
      'CREATE POLICY "Staff can read all" ON public.%I FOR SELECT TO authenticated USING (public.is_staff())',
      tbl
    );
    
    -- 3. Staff üyeleri belirli tablolarda (örn. aidat ödemeleri) ekleme yapabilir
    IF tbl IN ('aidat_odemeleri', 'gelir_giderler', 'cari_hareketler', 'irsaliyeler', 'irsaliye_kalemleri') THEN
      EXECUTE format(
        'CREATE POLICY "Staff can insert activity" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_staff())',
        tbl
      );
    END IF;
  END LOOP;
END $$;
