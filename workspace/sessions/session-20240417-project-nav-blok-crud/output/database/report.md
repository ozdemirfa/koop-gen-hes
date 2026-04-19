Agent: database
Görev: session-20240417-project-nav-blok-crud — Şerefiye Tablosu Optimizasyonu ve RPC Fonksiyonu
Durum: TAMAMLANDI
Sonraki adım: Backend Agent spec.md ve output/database/report.md'yi okuyarak API'yi yazabilir
---

## Oluşturulan Dosyalar
| Dosya | Açıklama |
|-------|---------|
| supabase/migrations/20260419000001_serefiye_optimize_and_rpc.sql | Index tanımları ve `reset_serefiye_table` RPC fonksiyonu |

## Tablo Listesi
| Tablo | Satır Sayısı (seed) | Açıklama |
|-------|---------------------|---------|
| public.serefiye_tablosu | - | Proje bazlı daire/şerefiye tanımları |

## RLS Politikaları Özeti
| Tablo | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| public.serefiye_tablosu | authenticated | authenticated | authenticated | authenticated |

## Doğrulama
| Kontrol | Beklenen | Sonuç |
|---------|---------|-------|
| Tablo sayısı | 1 (Mevcut) | ✓ |
| Index'ler | Tanımlı (proje_id, durum) | ✓ |
| RPC Mevcut | `reset_serefiye_table` | ✓ |
| RPC Güvenlik | `SECURITY DEFINER` | ✓ |
| Daire No Formatı | `Blok.DaireNo` | ✓ |

## Eksik / Beklemede
- Yok.

## RPC Detayları
### `reset_serefiye_table(p_proje_id UUID)`
Bu fonksiyon, ağır şerefiye tablosu oluşturma mantığını veritabanı seviyesine taşır.
- **Girdi:** `p_proje_id` (UUID)
- **Kontrol:** Eğer ilgili projede en az bir dairenin `durum` alanı `'dolu'` ise (yani üye atanmışsa) `RAISE EXCEPTION` fırlatır.
- **İşlem:**
  1. Projenin mevcut tüm şerefiye kayıtlarını siler.
  2. Projeye ait tüm blokları (`bloklar` tablosundan) çeker.
  3. Her blok için `toplam_daire` sayısı kadar döner.
  4. `daire_no` formatını `Blok.No` şeklinde oluşturur.
  5. Kayıtları `serefiye_tablosu`'na ekler.
- **Dönüş:** Oluşturulan satır sayısı (INTEGER)
