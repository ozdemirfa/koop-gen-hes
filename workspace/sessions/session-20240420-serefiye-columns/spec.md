# Spec: Şerefiye Tablosu Genişletme (m2 ve Oda Sayısı)
**Session:** session-20240420-serefiye-columns

## Hedef
Şerefiye tablosuna (serefiye_tablosu) dairelerin fiziksel özelliklerini (m2 ve oda sayısı) tutacak kolonlar eklemek ve bu tabloyu sıfırlayan RPC fonksiyonunu bu yeni kolonları destekleyecek şekilde güncellemek.

## Gereksinimler
1. `serefiye_tablosu` tablosuna aşağıdaki kolonlar eklenecek:
   - `m2`: NUMERIC(10,2) - Varsayılan: 0
   - `oda_sayisi`: VARCHAR(20) - Varsayılan: NULL
2. `reset_serefiye_table(p_proje_id UUID)` RPC fonksiyonu güncellenecek:
   - Yeni daireler oluşturulurken `m2` değeri 0, `oda_sayisi` değeri NULL olarak atanacak.
3. Migration dosyası standartlara uygun (temiz ve optimize) olacak.

## Sprint Backlog
- [x] [DB] Migration dosyasının oluşturulması (ALTER TABLE + RPC UPDATE)
- [ ] [BE] Daire güncelleme API'sinin yeni kolonları desteklemesi
- [ ] [FE] Şerefiye tablosu UI'ında m2 ve oda sayısı alanlarının gösterilmesi ve düzenlenmesi

## Database Report
Bkz: `output/database/report.md`
