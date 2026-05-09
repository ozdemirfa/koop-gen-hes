// Test ortam değişkenleri — vitest setupFiles ile her test öncesi yüklenir.
// Gerçek Supabase'e bağlanmadan modüllerin import sırasında throw etmemesi için
// fake URL ve key'ler set edilir. Auth ve veritabanı çağrıları test'lerde mock'lanır.
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'
