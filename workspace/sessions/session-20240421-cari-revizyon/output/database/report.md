Agent: database
Görev: session-20260421-add-uye-id-to-serefiye — Serefiye tablosuna uye_id eklenmesi ve 1:1 senkronizasyonu
Durum: TAMAMLANDI
Sonraki adım: Backend Agent `serefiye_tablosu.uye_id` üzerinden üye-daire atamalarını yapabilir.
---

## Oluşturulan Dosyalar
| Dosya | Açıklama |
|-------|---------|
| `supabase/migrations/20260421000005_add_uye_id_to_serefiye.sql` | `uye_id` kolonu, UNIQUE kısıtlamaları, veri senkronizasyonu ve trigger güncellemelerini içeren migration. |

## Tablo Listesi (Değişiklik Yapılanlar)
| Tablo | Değişiklik | Açıklama |
|-------|------------|---------|    
| `serefiye_tablosu` | `uye_id` (UUID, FK, UNIQUE) eklendi. | Dairelerin hangi üyeye ait olduğunu tutan yeni kolon. |
| `uyeler` | `serefiye_id` kolonu üzerine UNIQUE kısıtlaması eklendi. | 1:1 ilişkinin tutarlılığını sağlamak için. |

## RLS Politikaları Özeti
- `serefiye_tablosu` için mevcut "authenticated_full_access" politikası devam etmektedir.
- Yeni `uye_id` kolonu bu politikadan otomatik olarak etkilenmektedir.

## Doğrulama
| Kontrol | Beklenen | Sonuç |
|---------|---------|-------|
| `uye_id` FK | `uyeler.id` referansı | ✓ |
| `UNIQUE` kısıtlaması | Her iki tabloda (1:1) | ✓ |  
| Data Sync | Mevcut verilerin taşınması | ✓ |      
| Trigger Güncelleme | `func_uye_durum_degisti_daire_bosalt` | ✓ |
| RPC Güncelleme | `create_yillik_aidat_plani` | ✓ |

## Detaylar ve Gözlemler
1. **1:1 İlişki Enforce Edildi**: `serefiye_tablosu.uye_id` UNIQUE yapılarak her üyenin en fazla 1 dairesi olması; `uyeler.serefiye_id` UNIQUE yapılarak her dairenin en fazla 1 üyesi olması garantilendi.
2. **Geriye Dönük Uyumluluk**: Uygulama kodunun ve view'ların kırılmaması için `uyeler.serefiye_id` kolonu şimdilik kaldırılmadı ancak UNIQUE kısıtlaması eklenerek tutarsız girişler engellendi.
3. **Trigger ve RPC Güncellemeleri**: Üye pasife çekildiğinde dairenin boşaltılması mantığı yeni kolona göre güncellendi. Ayrıca yıllık aidat planı oluşturulurken kullanılan üye sorgusu yeni kolonu önceliklendirecek şekilde optimize edildi.
4. **Data Sync**: Migration sırasında `uyeler.serefiye_id` verisi `serefiye_tablosu.uye_id` kolonuna taşındı.

## Eksik / Beklemede
- Backend servislerindeki `serefiye_id` kullanımının zamanla `uye_id` (serefiye_tablosu üzerinden) kullanımına geçirilmesi önerilir.
- Tüm sistemin yeni yapıya geçtiği doğrulandıktan sonra `uyeler.serefiye_id` kolonu tamamen kaldırılabilir.
