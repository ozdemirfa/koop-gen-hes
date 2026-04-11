# E2E Tests — KoopGenHes

Playwright tabanlı uçtan uca testler. İlk dalga (P1–P3) auth guard, üye oluşturma ve aidat akışlarını kapsar.

## Çalıştırma

```bash
# İlk kez: tarayıcıyı indir
npx playwright install chromium

# Tüm testler (dev server'ı otomatik başlatır)
npx playwright test

# Tek dosya
npx playwright test e2e/auth-guard.spec.ts

# UI modu
npx playwright test --ui

# Dev server'ı elle başlattıysan server'ı otomatik başlatma
E2E_NO_SERVER=1 npx playwright test
```

## Ortam değişkenleri

- `E2E_BASE_URL` — varsayılan `http://localhost:5173`
- `E2E_USER` / `E2E_PASSWORD` — login testleri için geçerli Supabase kullanıcısı
- `E2E_NO_SERVER=1` — webServer'ı devre dışı bırakır

## Kapsam

| Dosya | Öncelik | Senaryo |
|-------|---------|---------|
| `auth-guard.spec.ts` | P1 | Kimliksiz /uyeler → /login yönlendirmesi, login formu hatası |
| `uye-crud.spec.ts` | P2 | Üye oluştur, listede görünüm, pasif yap |
| `aidat-flow.spec.ts` | P3 | Aylık tanım, tek ödeme, toplu ödeme |

## Geliştirme notları

- `E2E_USER` ve `E2E_PASSWORD` set değilse login gerektiren testler `test.skip` olur — CI'da mutlaka tanımla.
- `uye-crud` ve `aidat-flow` regresyon koruması içindir; aynı test datası tekrar çalıştırılabilir olmalı (benzersiz suffix kullanılır).
- C1 (kasa_durumu çift sayım) ve H5 (banka path) regresyonları ilerideki dalgalarda eklenecek.
