# Gereksinimler (Proje Yönetimi Sayfası Doğrulaması ve Düzeltmeleri)

Kullanıcı, proje yönetimi modülünde navigasyon ve veri bütünlüğü ile ilgili aşağıdaki kritik hataların düzeltilmesini talep etmektedir.

## Kapsam
1. **Navigasyon (US-01):** Proje kartlarının her bölgesinin (başlık, gövde, sağa ok ikonu) tıklandığında `/projeler/:id` detay sayfasına gitmesi.
2. **Blok Yönetimi (US-02):** Proje düzenleme formunda blokların mükerrer (duplicate) kaydedilmesinin önlenmesi (proje_id ve blok_adi kombinasyonu bazlı).
3. **Blok Silme (US-03):** Listeden silinen blokların veritabanından kalıcı olarak kaldırılması ve bağımlılık (üye/şerefiye) kontrollerinin yapılması.
4. **UI Stabilite:** 'Düzenle' butonunun navigasyonu tetiklememesi (propagation fix).

## Beklenen Sonuçlar
- Kullanıcı kartın herhangi bir yerine tıkladığında detay sayfasına ulaşabilmeli.
- Proje düzenlerken aynı isimde blok eklenmesi engellenmeli veya tekil kalmalı.
- Silinen bir blok DB'den gerçekten silinmeli, ancak üzerinde üye varsa sistem uyarı vermeli.
- "Düzenle" butonuna tıklandığında hem modal açılıp hem sayfa değişmemeli.
