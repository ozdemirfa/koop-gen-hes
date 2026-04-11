# KoopGenHes - Gereksinimler

Konut Yapı Kooperatifi - Genel Hesap Yönetim Sistemi

---

## Teknik Gereksinimler

| Parametre | Değer |
|-----------|-------|
| Ölçek | 50-200 üye, 5-10 kullanıcı |
| Rol | Tek rol - Yönetim Kurulu (tam yetki) |
| Dil | Sadece Türkçe |
| Para birimi | TL |
| Sayı Formatı | Türkiye Standartları (Binlik ayıracı ".", Ondalık ayıracı ",", örn: 1.234,56) |
| Frontend | React + Vite + Ant Design |
| Backend | Node.js + Express |
| Veritabanı | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |

---

## Modül 1: Üye Yönetimi

### Açıklama
Kooperatif üyelerinin kaydı, mali geçmiş takibi ve daire/blok ataması.

### Gereksinimler
- **Üye Kaydı:** TC kimlik no, ad, soyad, cinsiyet, telefon, email, adres, şerefiye oranı (3 ondalık basamaklı).
- **Üye Durumu:** aktif, pasif, ihraç, istifa. Üye "Aktif" dışına çekildiğinde bağlı olduğu daire otomatik boşa çıkar.
- **Daire Ataması:** Projedeki blok ve daire seçeneklerinden seçim yapılır. Bir dairede tek aktif üye bulunabilir.
- **Üye Detay Sayfası (Sekmeli):**
  - **Aidat Hesabı:** Ödenen, geciken ve gelecek aidatların özeti ve listesi.
  - **Ödemeler:** Üyenin yaptığı tüm ödemelerin listesi (tarih, tutar, yöntem, makbuz no).
  - **Bilgiler:** Üye profil ve iletişim bilgileri.
- **Aidat Kapama (FIFO):** Toplu ödeme girişinde tutar en eski borçtan başlayarak otomatik olarak aidatları kapatır (kısmi ödeme desteği ile).
- **Filtreleme:** Blok, durum ve isim bazlı gelişmiş arama.

---

## Modül 2: Aidat Yönetimi

### Açıklama
Aylık aidat tanımlama, otomatik borçlandırma ve tahsilat takibi.

### Gereksinimler
- **Aylık Aidat Tanımı:** Yıl, ay, tutar, son ödeme günü, gecikme faiz oranı (%) tanımlama.
- **Otomatik Borçlandırma:** Tanım oluşturulduğunda tüm aktif üyelere otomatik aidat kaydı oluşturulur.
- **Ödeme Kaydı:** Tutar, tarih, ödeme yöntemi (nakit, havale, EFT, kredi kartı, çek vb.), makbuz no.
- **Entegrasyon:** Aidat ödemesi girildiğinde hem üye mali geçmişine hem de gelir tablosuna (kaynak: aidat) otomatik yansır.
- **Gecikme Faizi:** Aylık oran üzerinden gün bazlı veya ay bazlı otomatik hesaplama.

---

## Modül 3: Gelir/Gider Takibi

### Açıklama
Kooperatifin tüm nakit akışının kategorili ve kaynak bazlı takibi.

### Gereksinimler
- **Hiyerarşik Kategoriler:** Gelir ve giderler için ana ve alt kategori yapısı.
- **Gelir Kaydı:** `uye_id` bağlantısı ile üye bazlı gelir takibi. Aidat ödemeleri otomatik gelir olarak kaydedilir (`kaynak_tipi='aidat'`).
- **Gider Kaydı:** `firma_id` bağlantısı ile firma bazlı gider takibi.
- **İzlenebilirlik:** Her kayıt için `kaynak_tipi` (manuel, aidat, fatura, hakediş) ve `kaynak_id` bilgisi tutulur.
- **Görünüm:** Tarih aralığı, tip, kategori ve proje bazlı filtreleme.

---

## Modül 4: Yüklenici / Tedarikçi Yönetimi

### Açıklama
Firma sözleşmeleri, hakedişler ve hiyerarşik iş kalemlerinin yönetimi.

### Gereksinimler
- **Firma Kartı:** Ünvan, vergi no, iletişim bilgileri, IBAN ve cari bakiye/birikmiş teminat özeti.
- **Sözleşme Yönetimi:**
  - Sözleşme no, konu, tutar, teminat/stopaj oranları.
  - **İş Kalemleri:** Poz no (arama destekli), tanım, birim (m2, m3, adet vb.), miktar, birim fiyat. 10'arlı artan otomatik sıra no.
  - Silme kısıtı: Altında iş kalemi veya hakediş olan sözleşmeler silinemez.
- **Detaylı Hakediş:**
  - Dönemlik ilerleme girişi (bu ay miktarı), kümülatif takip.
  - **Hesaplamalar:** Brüt tutar, teminat kesintisi (otomatik), stopaj, net tutar.
  - Onaylandığında otomatik cari hareket (alacak) oluşturur.
- **Mali Özet:** Firma bazında hakediş toplamı, birikmiş teminatlar, cari ödemeler, kesilen faturalar ve "fatura açığı" (hakediş - fatura) takibi.

---

## Modül 5: Cari Hesap, Fatura & Çek

### Açıklama
Firma bazlı borç-alacak takibi, fatura yönetimi ve değerli evrak takibi.

### Gereksinimler
- **Fatura Yönetimi:**
  - **Çoklu Satır Desteği:** Tek faturada birden fazla kalem (ürün/hizmet) girişi.
  - Ara toplam, KDV ve genel toplam otomatik hesaplama.
  - **Cari Mantığı:** Faturalar cari ekstreyi doğrudan etkilemez (çift sayımı önlemek için). Cari ekstre hakedişler ve ödemeler üzerinden yürür.
- **İrsaliye Girişi:** Çoklu satır desteği. İrsaliye kaydı cari hesaba borç olarak yansır.
- **Ödeme Planı:** Fatura bazlı taksitlendirme, vade takibi ve ödeme durumu.
- **Çek Takibi:** Kesilen ve alınan çeklerin vade, tutar ve durum takibi. Kesilen çekler otomatik cari harekete işlenir.
- **Cari Ekstre:** Borç, alacak ve bakiye listesi. Birikmiş teminat bilgisi üstte özetlenir. Filtrelenmiş verinin CSV olarak indirilmesi.

---

## Modül 6: Banka Hesapları & Uzlaştırma

### Açıklama
Banka hareketlerinin takibi ve muhasebe kayıtları ile mutabakatı.

### Gereksinimler
- **Banka Hesapları:** Banka, şube, IBAN ve güncel bakiye takibi.
- **Banka Uzlaştırma (Mutabakat):**
  - Manuel girilen banka hareketlerini cari hareketlerle (ödemeler) eşleştirme.
  - Tutar ve tarih (±3 gün) toleransı ile otomatik eşleştirme önerileri.
  - Eşleşmemiş kalemlerin "mutabakatsız" olarak vurgulanması.

---

## Modül 7: Proje ve Şerefiye Yönetimi

### Açıklama
Çoklu proje desteği (Workspace) ve teknik detayların (blok/daire/şerefiye) yönetimi.

### Gereksinimler
- **Proje Tanımlama:** Proje adı, süre, bütçe ve `proje_id` bazlı veri izolasyonu.
- **Dinamik Blok Yapısı:** Her proje için sınırsız blok tanımlama. Her blok için:
  - Blok kodu (A, B, 1...), daire sayısı, başlangıç no.
  - Daire no formatı: `{BlokKodu}-{SıraNo}` (örn: A-101).
- **Şerefiye Yönetimi:**
  - Proje bazlı tüm dairelerin listesi.
  - Her daire için şerefiye oranı girişi (3 ondalık basamak).
  - Üye kaydında bu tablodan veri çekilmesi.
- **İş Kalemleri Ağacı:** Hiyerarşik proje iş kalemleri, bütçe planlama ve gerçekleşen takibi.

---

## Modül 8: Raporlama & Dashboard

### Açıklama
Mali durumun görselleştirilmesi ve PDF/CSV çıktıları.

### Gereksinimler
- **Dashboard:** Toplam üye/aidat/gider özetleri, aylık grafikler, son işlemler.
- **Mali Raporlar:** Aylık/Yıllık gelir-gider tabloları, mizan.
- **Üye Borç Listesi:** Tüm üyelerin güncel borç ve gecikme durumu raporu.
- **Hakediş ve Cari Raporlar:** Firma bazlı özetler ve PDF dökümleri.
- **Validasyon:** Form girişlerinde alan bazlı inline hata gösterimi (kırmızı uyarı mesajları).
