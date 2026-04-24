Agent: backend
Görev: session-20240421-aidat-charging — Aidat planlama ve borçlandırma mantığı ayrımı
Durum: TAMAMLANDI
Sonraki adım: Frontend Agent spec.md ve output/backend/report.md'yi okuyarak UI'ı yazabilir
---

## Oluşturulan / Güncellenen Dosyalar
| Dosya | Açıklama |
|-------|---------|
| `server/src/config/constants.ts` | `AIDAT_TANIMI_DURUMLARI` eklendi. |
| `server/src/services/aidat.service.ts` | `createTanim`, `updateTanim`, `deleteTanim` ve `executeCharging` metodları eklendi. |
| `server/src/controllers/aidat.controller.ts` | Yeni servis metodları için controller'lar eklendi. |
| `server/src/routes/aidatlar.routes.ts` | Yeni route tanımları eklendi. |
| `server/src/index.ts` | Uygulama başlangıcında `executeCharging` çağrısı eklendi. |

## Endpoint Listesi
| Metot | Yol | Açıklama | Auth? |
|-------|-----|---------|-------|
| POST  | `/api/aidatlar/tanimlar` | Tekil aidat tanımı oluşturur. | Evet |
| PUT   | `/api/aidatlar/tanimlar/:id` | Aidat tanımını günceller (Sadece `plan` durumunda). | Evet |
| DELETE| `/api/aidatlar/tanimlar/:id` | Aidat tanımını siler (Sadece `plan` durumunda). | Evet |
| POST  | `/api/aidatlar/execute-charging` | Borçlandırma işlemini manuel tetikler. | Evet |
| POST  | `/api/aidatlar/yillik-plan` | Yıllık aidat planı oluşturur (RPC üzerinden). | Evet |

## Supabase Entegrasyonları
- RPC: `fn_execute_aidat_charging` -> Aidat tanımlarını borçlandırır ve `aidatlar` tablosunda kayıtlar oluşturur.
- RLS: `aidat_tanimlari` tablosundaki `durum` kolonuna bağlı olarak güncellemeler DB seviyesinde de tetikleyicilerle korunmaktadır.

## Test Özeti
- Derleme kontrolü: `npm run build` BAŞARILI.
- Birim testleri: Bu aşamada sadece manuel kod doğrulaması yapıldı (Server tarafında test altyapısı eksik).

## Eksik / Beklemede
- Yok.
