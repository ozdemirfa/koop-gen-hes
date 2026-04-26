Agent: pm
Görev: Cari hareketler ve modüller arası finansal entegrasyon mantığının standartlaştırılması.
Durum: TAMAMLANDI
Sonraki adım: Master Agent, spec.md içerisinde oluşturulan "Sprint Backlog" biletlerini scrum-board.md'ye aktararak sprint'i başlatabilir.
---

## Proje ve SCRUM Vizyonu
KoopGenHes platformunun finansal tutarlılığını sağlamak için tüm modüllerin (Aidat, Fatura, Hakediş, Banka/Kasa) cari hesaplarla olan ilişkisi muhasebe standartlarına göre yeniden yapılandırılmaktadır. Temel amaç, her finansal işlemin izlenebilir (traceable), çift taraflı (borç/alacak) ve tutarlı bir bakiye oluşturacak şekilde kaydedilmesidir.

## Teknoloji Stack Önerisi
- **Frontend:** React + Ant Design (Mevcut yapı korunacak)
- **Backend:** Node.js/Express + Supabase (PostgreSQL)
- **Veritabanı:** PostgreSQL (Triggers & RPCs için PL/pgSQL)

## SPRINT BACKLOG (Görev / Bilet Listesi)

### Ticket [US-CARI-01]: Cari Hareket Mantığının Standartlaştırılması (Proje Perspektifi)
*İlgili Birim:* Database/Backend
**User Story:** Bir yönetici olarak, cari hareketlerdeki 'borç' ve 'alacak' kolonlarının projenin finansal durumunu (Project-Centric) yansıtacak şekilde çalışmasını istiyorum.
**Definition of Done (DoD):**
- [ ] `cari_hareketler` tablosundaki `borc` ve `alacak` kullanım mantığı 'Proje Perspektifi'ne göre şu şekilde sabitlenmeli:
  - **Alacak (Credit):** Projenin alacaklı olduğu durumlar (Üye aidat/faiz tahakkuku, Firmaya yapılan ödemeler/avanslar).
  - **Borç (Debit):** Projenin borçlu olduğu veya yükümlülük altına girdiği durumlar (Üyeden alınan tahsilatlar, Firmanın kestiği faturalar/hakedişler).
- [ ] Mevcut `islem_turu` değerleri (`aidat_kayit`, `hakedis`, `gelen_odeme`, `giden_odeme`) bu yeni mantığa göre güncellenmeli.
- [ ] `kaynak_tipi` ve `kaynak_id` kolonlarının her harekette doldurulması zorunlu hale getirilmeli.

### Ticket [US-CARI-02]: Üye Finansal Entegrasyonu (Aidat ve Faiz)
*İlgili Birim:* Database (PL/pgSQL)
**User Story:** Bir üye olarak, tarafıma yansıtılan aidatların projenin bir alacağı (Alacak) olarak, yaptığım ödemelerin ise projenin bir yükümlülüğü (Borç) olarak kaydedilmesini istiyorum.
**Definition of Done (DoD):**
- [ ] `fn_charge_aidat_tanimi` fonksiyonu revize edilerek tahakkuk eden aidat tutarı `alacak` kolonuna yazılmalı (Proje alacaklanır).
- [ ] `hesapla_gecikme_faizi` RPC'si revize edilerek hesaplanan faiz tutarı `alacak` kolonuna yazılmalı.
- [ ] Üyeden gelen ödemeler (`gelen_odeme`) cari harekete `borc` olarak yansıtılmalı (Projenin tahsilat yükümlülüğü/bakiyesi azalır).
- [ ] `sync_aidatlar_on_unit_assignment` trigger'ı revize edilerek devralınan bakiyeler bu mantığa (Alacak=Tahakkuk, Borç=Tahsilat) göre işlenmeli.

### Ticket [US-CARI-03]: Firma Finansal Entegrasyonu (Hakediş ve Fatura)
*İlgili Birim:* Database / Backend
**User Story:** Bir yönetici olarak, firmalardan gelen hakedişlerin projenin borcu (Borç) olarak, firmalara yapılan ödemelerin ise projenin bir alacağı (Alacak) olarak kaydedilmesini istiyorum.
**Definition of Done (DoD):**
- [ ] Hakediş onaylandığında veya fatura kaydedildiğinde otomatik olarak `cari_hareketler` tablosuna `borc` kaydı atılmalı (Proje borçlanır).
- [ ] Firmaya yapılan ödemeler (`giden_odeme`) cari harekete `alacak` olarak yansıtılmalı (Projenin alacağı artar/borcu kapanır).
- [ ] `kaynak_tipi` hakedişler için 'hakedis', faturalar için 'fatura' olarak set edilmeli.

### Ticket [US-CARI-04]: Banka ve Kasa Entegrasyonu (Proje Odaklı)
*İlgili Birim:* Backend / Database
**User Story:** Finans sorumlusu olarak, banka/kasa hareketlerinin projenin borç/alacak dengesine doğru yansımasını istiyorum.
**Definition of Done (DoD):**
- [ ] `islem_tipi = gelir` (Üyeden tahsilat vb.) ise cari hesapta `borc` (Proje borçlanır/para alır) oluşturulmalı.
- [ ] `islem_tipi = gider` (Firmaya ödeme vb.) ise cari hesapta `alacak` (Proje alacaklanır/para gönderir) oluşturulmalı.
- [ ] `cari_hareketler` içindeki `banka_hareket_id` veya `kasa_hareket_id` (varsa) doğru şekilde bağlanmalı.

### Ticket [US-CARI-05]: Bakiye Hesaplama ve Proje Odaklı Raporlama
*İlgili Birim:* Backend / Frontend
**User Story:** Yönetici olarak, projenin kimden ne kadar alacağı olduğunu veya kime ne kadar borcu olduğunu tek bir formülle görmek istiyorum.
**Definition of Done (DoD):**
- [ ] `Bakiye = SUM(alacak) - SUM(borc)` formülü tüm sistemde (Mizan, Ekstre, Dashboard) standartlaştırılmalı.
- [ ] **Bakiye > 0 (Pozitif):** Proje Alacaklı (Üye borçlu veya Firmaya fazla ödeme yapıldı).
- [ ] **Bakiye < 0 (Negatif):** Proje Borçlu (Üye fazla ödeme yaptı veya Firmaya borcumuz var).
- [ ] `MizanPage.tsx` ve `CariEkstrePage.tsx` bu mantığa göre güncellenmeli.
- [ ] Görselleştirme: Pozitif Bakiye (Yeşil/Alacaklı Proje), Negatif Bakiye (Kırmızı/Borçlu Proje).

---

## Veritabanı Şeması Gereksinimleri
| Tablo | Amaç | İlişkiler | RLS İhtiyacı |
|-------|------|-----------|--------------|
| cari_hareketler | Tüm finansal izleri tutar | cari_hesaplar, banka_hareketleri, aidatlar, faturalar | Proje bazlı izolasyon |

## API / Servis Sözleşmesi
| Endpoint/RPC | Metot | Amacı | Auth Gerekli Mi? |
|--------------|-------|-------|------------------|
| /api/cari/ekstre | GET | Belirli bir cari hesabın tüm hareketlerini döner | Evet |
| /api/cari/mizan  | GET | Tüm carilerin borç/alacak/bakiye özetini döner | Evet |

## Frontend ve Tasarım İhtiyaçları
| Sayfa/Bileşen | Sorumlu Ticket | Gerekli API Bağlantısı | Notlar |
|---------------|----------------|------------------------|--------|
| Cari Ekstre   | US-CARI-05     | /api/cari/ekstre      | Borç/Alacak kolonları net ayrılmalı |
| Mizan Raporu  | US-CARI-05     | /api/cari/mizan       | Proje bazlı toplam alacak/borç özeti |

## Yüksek Öncelikli Riskler / Engelleyiciler
- **Mevcut Veri Tutarsızlığı:** Önceki mantıkla (ters) kaydedilmiş verilerin migration ile düzeltilmesi gerekmektedir.
- **Race Condition:** Banka hareketi ve Cari hareket oluşturma işlemlerinin atomik (Transaction) olması şarttır.
