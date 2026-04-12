# KoopGenHes — Manuel Test Checklist

Bu checklist, Faz 12 kapsamında uçtan-uca el testi için hazırlandı. Her satır `[x]` işaretlendiğinde ilgili modülün temel akışı doğrulanmış olur.

## Ön hazırlık
- [ ] `cd server && npm run dev` çalışıyor
- [ ] `cd client && npm run dev` çalışıyor ve `http://localhost:5173` açılıyor
- [ ] Browser console'da hata yok (sayfa yüklendikten sonra)

## Kimlik doğrulama
- [ ] `/login` sayfası ekrana geliyor
- [ ] Hatalı şifre `message.error` gösteriyor
- [ ] Doğru giriş sonrası `/` Dashboard açılıyor
- [ ] Korumalı route'lar oturum yokken `/login`'e yönlendiriyor
- [ ] "Çıkış Yap" butonu oturumu sonlandırıyor

## Dashboard
- [ ] Özet kartları (üye sayısı, gelir, gider, bakiye) yükleniyor
- [ ] Gelir/Gider grafiği çiziliyor
- [ ] Aidat durum grafiği çiziliyor
- [ ] Son işlemler tablosu dolu
- [ ] Backend kapalıyken `ErrorState` gösteriliyor ve "Tekrar dene" butonu çalışıyor

## Üye Yönetimi
- [ ] Liste açılıyor, boş değilse kayıtlar görünüyor
- [ ] Arama (debounce) çalışıyor
- [ ] Durum/blok filtresi çalışıyor
- [ ] Yeni üye ekleme: TC 11 hane, ad/soyad zorunlu, daire seçimi
- [ ] TC'ye 10 hane girilince validation hatası çıkıyor
- [ ] Telefon yanlış format girildiğinde hata çıkıyor
- [ ] Üye detay sayfası açılıyor (aidat geçmişi + ödeme listesi)
- [ ] Düzenle ve Sil (pasif yapma) çalışıyor

## Aidat Yönetimi
- [ ] Aidat tanımı ekleme çalışıyor
- [ ] Yıllık aidat planı oluşturma modal'ı açılıyor
- [ ] Yıl/ay/durum filtresi aidat listesini filtreliyor
- [ ] Aidat ödeme modal'ı ile ödeme alınıyor, cari bakiye düşüyor
- [ ] Gecikme faizi hesaplama butonu çalışıyor

## Gelir/Gider
- [ ] Tip/kategori/tutar/tarih zorunlu alanları validate ediliyor
- [ ] Yeni gelir/gider kaydı listeye düşüyor
- [ ] Kategori modal üzerinden yeni kategori eklenebiliyor
- [ ] Düzenle ve Sil çalışıyor

## Firmalar & Sözleşmeler
- [ ] Firma listesi tip/aktiflik filtresi çalışıyor
- [ ] Modal ile firma CRUD çalışıyor
- [ ] Firma detay sekmeleri (bilgi / sözleşmeler / hakedişler / faturalar / cari ekstre) doluyor
- [ ] Yeni sözleşme formunda tarih validasyonu (bitiş ≥ başlangıç) çalışıyor
- [ ] Toplam tutar 0 girilince hata çıkıyor
- [ ] Sözleşme detayında iş kalemi ekleme + toplam hesaplama
- [ ] Cari ekstre sekmesinde bakiye doğru

## Hakediş
- [ ] Yeni hakediş modal'ı açılıyor
- [ ] Kalem tablosunda InputNumber ile "bu ay miktar" girilebiliyor
- [ ] Kümülatif hesaplama doğru (önceki + bu ay)
- [ ] Kesinti özet kartları (teminat/stopaj/diğer) hesaplanıyor
- [ ] Net tutar = toplam - kesintiler
- [ ] Onay (Popconfirm) → cari hareket otomatik oluşuyor
- [ ] Onaylı hakedişte düzenleme kilitli

## Fatura & Ödeme Planı
- [ ] Fatura modal'ı ile fatura kalemleri eklenip toplam hesaplanıyor
- [ ] KDV hesaplaması doğru
- [ ] Aynı fatura no tekrar girildiğinde form field üzerinde hata gösteriliyor (unique)
- [ ] Fatura listesinde "Ödeme Planı" butonu açıyor
- [ ] Ödeme planı sayfasında otomatik dağıtma (taksit sayısı + başlangıç) çalışıyor
- [ ] Kalan ≠ 0 iken Kaydet butonu devre dışı
- [ ] Taksit kaydedilince fatura detayında görünüyor

## Cari Hesap & Banka
- [ ] Cari ekstre tarih aralığı + firma filtresi çalışıyor
- [ ] Bakiye hesaplaması doğru
- [ ] Banka hesabı CRUD çalışıyor
- [ ] Banka uzlaştırma sayfasında hareket eşleştirme çalışıyor
- [ ] Eşleştirilen hareket tekrar eşleştirme listesinde görünmüyor

## Çek Takibi (Rev2)
- [ ] Çek listesi açılıyor
- [ ] Yeni çek ekleme formu zorunlu alanları doğruluyor
- [ ] Vade dolan çekler farklı tag'le gösteriliyor
- [ ] Durum güncelleme (tahsil/iade) çalışıyor

## Malzeme Teslim
- [ ] Liste açılıyor, firma filtresi çalışıyor
- [ ] Yeni teslim formu kalem eklemesi çalışıyor, toplam hesaplanıyor
- [ ] Düzenle/Sil çalışıyor

## Proje Yönetimi
- [ ] Proje listesi kartları yükleniyor
- [ ] Yeni proje + blok ekleme modal'ı çalışıyor
- [ ] Proje detayında iş kalemi ağacı hiyerarşik görünüyor
- [ ] Yeni yıllık plan oluşturma butonu çalışıyor
- [ ] Yıllık plan grid'inde 12 aylık tutar girişi + Kaydet
- [ ] Şerefiye sayfası (Rev2) daire listesini gösteriyor

## Raporlar
- [ ] Aylık rapor ay seçince yenileniyor
- [ ] Yıllık rapor yıl seçince yenileniyor
- [ ] Üye borç listesi sıralama ve genel toplam gösteriyor
- [ ] "PDF İndir" butonu disabled (henüz implement edilmedi)

## State & Error Behavior
- [ ] Her listeleme sayfasında veri boşken `EmptyState` görünüyor
- [ ] Query hatasında liste yerine `ErrorState` + Retry görünüyor
- [ ] Loading sırasında `LoadingState` veya DataTable `loading` spinner görünüyor
- [ ] ErrorBoundary: bilerek throw atılan bir komponent sayfayı crash etmiyor, fallback UI gösteriyor

## Responsive
- [ ] 360px (mobil): Sider drawer'a dönüyor, header/footer düzgün
- [ ] 768px (tablet): Sider collapsed/expanded geçiyor
- [ ] 1280px (desktop): Tam görünüm
- [ ] Tüm tablolar yatay scroll ile taşmıyor
- [ ] Dashboard kartları 1 sütuna düşüyor mobilde

## Typecheck & Build
- [ ] `cd client && npx tsc --noEmit` hatasız
- [ ] `cd server && npx tsc --noEmit` hatasız
- [ ] `cd client && npm run build` başarılı

## Bulunan Buglar (test sırasında doldurulacak)
- [ ] -
