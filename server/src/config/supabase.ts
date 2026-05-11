import { createClient } from '@supabase/supabase-js'

// TASK-BE-05 (sprint 20260511-backlog-batch1):
// Service role key icin VITE_ prefix'li fallback KALDIRILDI. VITE_ degiskenleri
// build-time'da client bundle'a sızabildiginden, service role key'in VITE_
// prefix ile gelmesi kritik bir guvenlik zaafiyetidir. Build/start'ta fail-fast.
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL zorunlu (.env veya Render env). VITE_ prefix kabul edilmez.')
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY zorunlu (.env veya Render env). VITE_ prefix YASAKTIR — client bundle sızıntısı riski.')
}

// Backend tüm tablo işlemlerini RLS pass geçerek güvenle yapması için admin client (Service Role Key)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
