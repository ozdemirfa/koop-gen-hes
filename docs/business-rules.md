# Proje Bilgi ve Kurallar Kaydı

## Muhasebe Hesaplama Kuralları

### Cari Bakiye Hesaplaması
- **Kural:** Pano (Dashboard) üzerindeki 'Cari Bakiye' hesaplaması sadece **firmaları (tedarikçileri)** kapsamalıdır.
- **Mantık:** Üyelerin (ortakların) borç/alacak durumları 'Geciken Aidatlar' (bekleyen_alacak) altında ayrıca takip edildiği için, 'Cari Bakiye' net firma borç/alacak durumunu yansıtacak şekilde filtrelenmiştir.
- **Teknik Detay:** `rapor.service.ts` içerisindeki `dashboardOzet` fonksiyonunda, `cari_hareketler` üzerinden dönülürken sadece `cari_turu === 'firma'` olan kayıtlar `cari_bakiye` toplamına dahil edilir.

### Proje Perspektifi (Accounting Standard)
- **ALACAK (Credit):** Projenin alacağı (Aidat/Faiz tahakkuku) veya borç ödemesi (Giden ödeme). (+) Bakiye.
- **BORC (Debit):** Projenin borcu (Hakediş/Fatura) veya alacak tahsilatı (Gelen ödeme). (-) Bakiye.
- **Bakiye Formülü:** `SUM(alacak) - SUM(borc)`
- **Yorumlama:** 
    - Pozitif Bakiye: Alacaklı durum (Üye borçlu veya firmaya fazla ödeme yapılmış).
    - Negatif Bakiye: Borçlu durum (Üye fazla ödeme yapmış veya firmaya borç var).

## E2E Test Notları
- Dashboard testleri `cari_bakiye` değerinin sadece firma hareketlerinden etkilendiğini doğrulamalıdır.
