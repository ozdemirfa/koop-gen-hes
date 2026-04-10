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
| Frontend | React + Vite + Ant Design |
| Backend | Node.js + Express |
| Veritabanı | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |

---

## Modül 1: Üye Yönetimi

### Açıklama
Kooperatif üyelerinin kaydı, bilgi güncelleme ve daire/blok ataması.

### Gereksinimler
- Üye kaydı: TC kimlik no, ad, soyad, cinsiyet, telefon, email, adres
- Blok tanımlama (blok adı, toplam daire sayısı)
- Üyeye blok ve daire no ataması (bir dairede tek aktif üye)
- Üyelik durumu yönetimi: aktif, pasif, ihraç, istifa
- Üye detay sayfasında aidat geçmişi görüntüleme
- Üye listesinde blok, durum ve isim bazlı filtreleme/arama

---

## Modül 2: Aidat Yönetimi

### Açıklama
Aylık üye aidatlarının tanımlanması, takibi, tahsilatı ve gecikme faizi hesaplaması.

### Gereksinimler
- Aylık aidat tanımı oluşturma: yıl, ay, tutar, son ödeme günü, gecikme faiz oranı (%)
- Aidat tanımı oluşturulduğunda tüm aktif üyelere otomatik aidat kaydı oluşturma
- Ödeme kaydı: tutar, tarih, ödeme yöntemi (nakit, havale, EFT, kredi kartı, diğer), makbuz no
- Kısmi ödeme desteği
- Gecikme faizi otomatik hesaplama (aylık oran x geciken ay sayısı)
- Aidat durumu: bekliyor, ödendi, gecikti, iptal
- Özet görünüm: toplam tahsilat, bekleyen, geciken tutarlar
- Üye bazında borç/alacak takibi

---

## Modül 3: Gelir/Gider Takibi

### Açıklama
Kooperatifin tüm gelir ve giderlerinin kategorili olarak kaydedilmesi ve raporlanması.

### Gereksinimler
- Hiyerarşik gelir/gider kategorileri (ana kategori → alt kategori)
- Gelir/gider kaydı: tip (gelir/gider), kategori, tutar, tarih, açıklama, belge no, ilgili firma
- Tarih aralığı, tip ve kategori bazlı filtreleme
- Kategori yönetim sayfası (ekleme, düzenleme)

---

## Modül 4: Yüklenici/Tedarikçi Hakediş

### Açıklama
Yüklenici ve tedarikçi firmalarla yapılan sözleşmelerin yönetimi ve detaylı hakediş takibi.

### Gereksinimler

#### Firma Yönetimi
- Firma kaydı: tip (yüklenici/tedarikçi), ünvan, vergi no, vergi dairesi, telefon, email, adres, IBAN, yetkili kişi
- Firma aktif/pasif durumu

#### Sözleşme Yönetimi
- Sözleşme kaydı: firma, sözleşme no, konu, toplam tutar, başlangıç/bitiş tarihi
- Teminat oranı (%) ve stopaj oranı (%) tanımlama
- İş kalemleri: poz no, tanım, birim (m2, m3, kg, adet vb.), miktar, birim fiyat

#### Detaylı Hakediş
- Hakediş oluşturma: sözleşme seçimi, dönem, hakediş no (otomatik artan)
- İş kalemi bazında ilerleme girişi (bu ay miktarı)
- Kümülatif takip: önceki toplam miktar otomatik önceki hakediş'ten alınır
- Hesaplamalar:
  - Bu ay tutar = bu ay miktar × birim fiyat
  - Toplam tutar = (önceki + bu ay) × birim fiyat
  - Teminat kesintisi = toplam × teminat oranı
  - Stopaj kesintisi = toplam × stopaj oranı
  - Net tutar = toplam - teminat - stopaj - diğer kesintiler
- Hakediş durumu: taslak → onaylandı → ödendi / iptal
- Hakediş onaylandığında otomatik cari hareket oluşturma
- Hakediş PDF çıktısı

---

## Modül 5: Cari Hesap & Fatura

### Açıklama
Firma bazında borç-alacak takibi, fatura yönetimi, ödeme planları ve banka mutabakatı.

### Gereksinimler

#### Fatura Yönetimi
- Fatura kaydı: firma, tip (gelen/giden), fatura no, tarih, vade tarihi
- Tutar hesaplama: ara toplam, KDV oranı, KDV tutar, toplam tutar
- Fatura durumu: bekliyor, ödendi, kısmi ödendi, iptal
- Hakediş ile fatura ilişkilendirme (opsiyonel)
- Fatura kaydında otomatik cari hareket oluşturma

#### Ödeme Planı
- Faturaya taksit planı oluşturma: taksit no, tutar, vade tarihi
- Taksit ödeme kaydı ve takibi

#### Cari Hesap
- Firma bazında cari hesap ekstresi (borç-alacak-bakiye listesi)
- Manuel cari hareket girişi
- Çalışan bakiye hesaplama

#### Banka Hesapları & Mutabakat
- Banka hesabı tanımlama: banka adı, şube, hesap no, IBAN
- Banka hareketi kaydı: tarih, tutar, işlem tipi (gelir/gider), açıklama
- Banka hareketi ↔ cari hareket eşleştirme (mutabakat)

---

## Modül 6: Malzeme/Ürün Teslim Takibi

### Açıklama
Kooperatife teslim edilen her türlü malzeme ve ürünün kayıt altına alınması.

### Gereksinimler
- Teslim kaydı: firma, sözleşme (opsiyonel), teslim tarihi
- Malzeme bilgileri: malzeme adı, tipi, birim, miktar, birim fiyat
- Toplam tutar otomatik hesaplama (miktar × birim fiyat)
- İrsaliye no, teslim alan kişi bilgisi
- Firma ve sözleşme bazlı filtreleme

---

## Modül 7: Proje Yönetimi

### Açıklama
Kooperatif projelerinin iş kalemleri bazında planlanması ve yıllık harcama planlarının oluşturulması.

### Gereksinimler
- Proje tanımlama: proje adı, açıklama, başlangıç/bitiş tarihi, toplam bütçe
-Proje blok sayısı, her bloktaki daire sayısı, daire kodlama sistemi (kaçtan başlayacak kaça kadar) // bu bilgiler üyelere daire ataması yapılırken referans alınacak
- Hiyerarşik iş kalemleri (ana kalem → alt kalemler, ağaç yapısı)
  - Her kalem: kalem kodu, tanım, birim, miktar, birim fiyat, bütçe tutarı
  - Kalem durumu: planlı, devam ediyor, tamamlandı, iptal
- Yıllık harcama planı oluşturma:
  - Proje ve yıl seçimi
  - 12 aylık grid görünümünde iş kalemi bazında planlanan tutar girişi
  - Gerçekleşen tutar takibi
  - Planlanan vs gerçekleşen karşılaştırma

---

## Modül 8: Raporlama & Dashboard

### Açıklama
Kooperatifin mali durumunu özetleyen gösterge paneli ve detaylı raporlar.

### Gereksinimler

#### Dashboard
- Özet kartlar: toplam üye sayısı, toplanan aidat, bekleyen aidat, toplam gider
- Aylık gelir/gider grafiği (çizgi veya çubuk grafik)
- Aidat tahsilat durumu grafiği (pasta grafik)
- Son işlemler tablosu

#### Raporlar
- Aylık mali rapor (yıl + ay seçimi)
- Yıllık mali rapor (yıl seçimi)
- Üye borç listesi (tüm üyelerin borç durumu)
- Hakediş özet raporu
- Tüm raporlarda PDF çıktı desteği
