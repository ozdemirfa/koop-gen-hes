Agent: backend
Görev: session-20240421-cari-revizyon — US-CARI-04, 05: Proje Perspektifi Muhasebe Adaptasyonu
Durum: TAMAMLANDI
Sonraki adım: Frontend Agent spec.md ve output/backend/report.md'yi okuyarak UI'ı yazabilir
---

## Oluşturulan / Güncellenen Dosyalar
| Dosya | Açıklama |
|-------|---------|
| `server/src/services/bankaHesap.service.ts` | Gelen tahsilatın (Gelir) => BORC, giden ödemenin (Gider) => ALACAK olarak kaydedilmesi (`cari_hesap_id` ile birlikte) sağlandı. Eski `hareket_tipi` ve `firma_id` mantığı güncel tablo yapısına uyarlandı. |
| `server/src/services/fatura.service.ts` | Gelen faturaların proje perspektifine göre onaylandığında projenin borcunu artıracak (BORC kolonu) şekilde insert atması sağlandı. Yeni `cari_hesap_id` mantığına uyarlandı. |
| `server/src/services/rapor.service.ts` | Mizan (`getMizan`) metodunun, Node.js üzerinden in-memory (alacak-borç) hesaplamak yerine doğrudan veritabanı performanslı RPC fonksiyonu `get_cari_mizan` çağıracak şekilde optimize edilmesi sağlandı. |

## İncelenen Ancak Revize Edilmeyen Dosyalar
| Dosya | Açıklama |
|-------|---------|
| `server/src/services/gelirGider.service.ts` | Gelir/Gider (ve kasa) işlemleri kontrol edildi; mevcut durumda Gelir=Borç, Gider=Alacak olarak doğru bir 'Proje Perspektifi' yapısı kurulduğu için dokunulmadı. |
| `server/src/services/aidat.service.ts` | Manuel aidat tahsilatlarının (gelen_odeme) BORC olarak kaydedilmesi kuralı incelendi; `cariHesapService.createPayment` methodunun bu işlemi halihazırda doğru gerçekleştirdiği tespit edildi. |
| `server/src/services/hakedis.service.ts` | Onaylanan hakediş kayıtlarının BORC (`hakedis_toplam`) olarak işlenmesi kuralının halihazırda sorunsuz çalıştığı tespit edildi. |

## Endpoint Listesi
*(Endpointlerin mevcut rotaları değişmedi, arka plan servisleri Proje Perspektifine uyumlu hale getirildi.)*
| Metot | Yol | Açıklama | Auth? |
|-------|-----|---------|-------|
| POST  | `/api/fatura` | Gelen fatura kayıtlarında projenin borcunu artırır. | Evet |
| POST  | `/api/banka/hareketler` | Banka tahsilatı/ödemesi cari hesaba BORC/ALACAK yönüyle yansıtılır. | Evet |
| GET   | `/api/raporlar/mizan` | Cari hesapların mizan özetlerini `get_cari_mizan` RPC'si üzerinden döndürür. | Evet |

## Supabase Entegrasyonları
- **RPC:** `get_cari_mizan` (Mizan raporlarında performans amaçlı kullanıma alındı).

## Eksik / Beklemede
- Yok. Tüm gereksinimler Proje Perspektifi'ne (Bakiye = Alacak - Borç, Borç=Projenin Borcu/Gelen Para, Alacak=Projenin Hakkı/Giden Para) uygun olarak Node.js Express servislerine yansıtıldı.
