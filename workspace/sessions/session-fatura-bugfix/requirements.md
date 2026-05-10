# Requirements: Fatura Modülü Hata Düzeltme Sprinti

## Problem Tanımı
1. **404 "Fatura bulunamadı" Hatası:**
   - `POST /api/faturalar` işlemi veritabanına kayıt atmasına rağmen 404 dönüyor.
   - Bu durum genellikle `GET` isteğinde (liste veya tekil) verinin bulunamaması veya rotanın yanlış yapılandırılmasından kaynaklanır.
   - Veritabanına kayıt atıldığına göre `POST` başarılı oluyor ancak yanıt dönerken veya takip eden bir `GET` işleminde sorun çıkıyor olabilir.

2. **Ant Design Drawer Deprecation:**
   - `antd: Drawer` bileşeninde `width` yerine `size` kullanılması uyarısı temizlenmeli.

## Görevler

### Task 1: UI Uyarılarının Temizlenmesi
- Tüm projede `Drawer` kullanımı taranacak.
- `width` prop'u yerine `size` (default, large) veya Ant Design 5.x standartlarına göre güncellenecek.

### Task 2: 404 Hatası Analizi
- `fatura.service.ts` incelenecek.
- `list` ve `getById` metodlarındaki JOIN ve filtreleme mantığı kontrol edilecek.
- `proje_id` bazlı filtrelemede bir hata olup olmadığına bakılacak.

### Task 3: RLS ve Trigger Denetimi
- `faturalar` tablosu üzerindeki RLS politikaları (`select`, `insert`) incelenecek.
- Kayıt sonrası çalışan bir trigger'ın kaydı silip silmediği veya statüsünü değiştirip değiştirmediği kontrol edilecek.

### Task 4: Rota Dağıtımı Kontrolü
- `server/src/routes/index.ts` dosyasında `faturalar` rotasının tanımlanma sırası ve diğer rotalarla (örneğin `/api/:id` gibi genel rotalar) çakışması incelenecek.

## Başarı Kriterleri (DoD)
- Yeni fatura eklendiğinde 201/200 OK dönmesi ve veri UI'da listelenmesi.
- Konsolda `Drawer` ile ilgili deprecation uyarısı kalmaması.
- RLS politikalarının doğru çalıştığının doğrulanması.
