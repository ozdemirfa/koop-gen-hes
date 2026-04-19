Agent: database
Görev: session-20240420-serefiye-columns — Şerefiye tablosuna m2 ve oda_sayisi eklenmesi       
Durum: TAMAMLANDI
Sonraki adım: Backend Agent spec.md ve output/database/report.md'yi okuyarak API'yi yazabilir
---

## Oluşturulan Dosyalar
| Dosya | Açıklama |
|-------|---------|
| supabase/migrations/20260419000003_add_m2_oda_sayisi_to_serefiye.sql | m2 ve oda_sayisi kolonlarının eklenmesi ve `reset_serefiye_table` RPC güncellemesi |

## Tablo Listesi
| Tablo | Satır Sayısı (seed) | Açıklama |
|-------|---------------------|---------|    
| public.serefiye_tablosu | 0 | Proje bazlı daire/şerefiye tanımları (m2 ve oda_sayisi eklendi) |

## RLS Politikaları Özeti
| Tablo | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| public.serefiye_tablosu | authenticated | authenticated | authenticated | authenticated |

## Doğrulama
| Kontrol | Beklenen | Sonuç |
|---------|---------|-------|
| Tablo sayısı | 1 | ✓ |
| Yeni Kolonlar | m2, oda_sayisi | ✓ |
| RPC Güncel | reset_serefiye_table | ✓ |
| RLS aktif | Evet | ✓ |

## Eksik / Beklemede
- Yok.
