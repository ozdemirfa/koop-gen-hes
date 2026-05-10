Agent: database
Görev: session-20260509-qc-bugfix — RLS Revizyonu ve Aylık Rapor RPC
Durum: TAMAMLANDI
Sonraki adım: Backend Agent `fn_aylik_rapor_detay` RPC'sini kullanarak `aylikRapor` endpoint'ini güncelleyebilir.
---

## Oluşturulan Dosyalar
| Dosya | Açıklama |
|-------|---------|
| supabase/migrations/20260509000001_aylik_rapor_rpc_and_teminat_rls.sql | `birikmis_teminatlar` RLS güncellemesi, `islem_turu` kısıtlaması güncellemesi ve `fn_aylik_rapor_detay` RPC. |

## RPC Listesi
| RPC | Parametreler | Dönüş Tipi | Açıklama |
|-----|--------------|------------|----------|
| `fn_aylik_rapor_detay` | `p_proje_id UUID, p_yil INT, p_ay INT` | `JSONB` | Belirli bir ayın gelir, gider, tahsilat ve ödeme hareketlerini ve toplamlarını döner. |

## RLS Politikaları Özeti
| Tablo | Politika | Değişiklik |
|-------|----------|------------|
| `birikmis_teminatlar` | "Allow authenticated users to read guarantees" | `USING (true)` yerine `USING (public.is_admin() OR public.is_staff())` olarak daraltıldı. |

## Doğrulama
| Kontrol | Beklenen | Sonuç |
|---------|---------|-------|
| `islem_turu` Kısıtlaması | `odeme` dahil edildi | ✓ |
| RPC JSON Yapısı | Gereksinimlerle uyumlu | ✓ |
| RLS Güvenliği | Admin/Staff kontrolü | ✓ |
| SQL Syntax | Geçerli | ✓ |

## Eksik / Beklemede
- Yok.
