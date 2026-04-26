## Oluşturulan Dosyalar
| Dosya | Açıklama |
|-------|---------|
| supabase/migrations/20260427000001_birikmis_teminatlar.sql | Tablo oluşturma, trigger ve teminat iadesi fonksiyonu |

## Tablo Listesi
| Tablo | Satır Sayısı (seed) | Açıklama |
|-------|---------------------|---------|    
| birikmis_teminatlar | 0 | Proje ve firma bazlı teminat bakiyeleri |

## View Listesi
| View | Hesaplama | Kullanım |
|------|-----------|---------|
| N/A | - | - |

## RLS Politikaları Özeti
| Tablo | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| birikmis_teminatlar | Mevcut RLS | - | - | - |

## Doğrulama
| Kontrol | Beklenen | Sonuç |
|---------|---------|-------|
| Tablo sayısı | 1 | ✓ |
| FK constraint'ler | Tanımlı | ✓ |
| RLS aktif | Evet | ✓ |
| Seed verisi | N/A | - |

## Eksik / Beklemede
- Yok
