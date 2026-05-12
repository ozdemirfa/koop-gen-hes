# Requirements — FIFO Realokasyon & Durum Rozeti Tutarlılığı

**Tarih:** 2026-05-12
**Talep eden:** ozdemirfa
**Önceki ilgili sessionlar:** 20260511-fifo-odenen-bug-fix (root cause analizi var, fix uygulanmamış)

## Kullanıcı sözleri (orijinal)
> "hesap kapama FIFO mantığı ile olmalı. yani eski tarihli önce kapanmalı. fotoda gördüğün üzere 02/2026 dönemi kısmı ödenmiş ve diğer aylar bazıları tam ödenmiş. bunu düzeltmelisin."

## Sorun (Üye Detay → Aidat Hesapları ekranı)
- Toplam Tahakkuk 455K, Toplam Ödeme 450K, Geciken Borç 5K görünüyor.
- Tablo durum rozetleri: tüm satırlar "ÖDENDİ".
- Gerçek: 2/2026 (50K) → ödenen 10.381,23, kalan 39.618,77. 4/2026 → ödenen 2.412,49, kalan 47.587,51. 5/2026 → ödenen 12.501,95, kalan 37.498,05. Diğerleri tam.
- Toplam gerçek kalan: 124.704,33 TL. Geciken Borç 5K rakamı yanlış.

## İki ana bug
1. **FIFO ihlali (geçmiş ödemelerin yeniden dağıtımı yok).** Yeni gelen ödemelerde FIFO doğru çalışıyor ama eski yanlış allocation'lar geri alınmıyor. Bir kez parçalı bağlanan ödeme yerinde kalıyor.
2. **Durum etiketi tutarsızlığı.** `aidatlar.durum = 'odendi'` olabilirken aynı satırın `kalan_borc > 0` durumu var. View formula-based, trigger eski (cari'den total_accrued kullanıyor).
