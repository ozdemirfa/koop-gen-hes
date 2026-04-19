Agent: pm
Görev: Proje Yönetimi Sayfası Doğrulaması ve Düzeltmeleri
Durum: TAMAMLANDI
Sonraki adım: Master Agent, spec.md içerisinde oluşturulan "Sprint Backlog" biletlerini scrum-board.md'ye aktararak sprint'i başlatabilir.
---

## Proje ve SCRUM Vizyonu
İnşaat projeleri yönetim modülünde kullanıcıların verilere erişimini (Navigasyon) ve veri giriş güvenliğini (Blok Yönetimi) sağlamak için kritik düzeltmeler yapılacaktır. Hedef, hatasız bir proje-blok hiyerarşisi oluşturmak ve kullanıcı arayüzündeki navigasyon çakışmalarını (Event Propagation) önlemektir.

## Teknoloji Stack Önerisi
- **Frontend:** React + Next.js (Mevcut Stack)
- **Backend:** Node.js + Express + Supabase
- **Database:** PostgreSQL (Supabase)
- **Test:** Playwright (E2E)

## SPRINT BACKLOG (Görev / Bilet Listesi)

### Ticket [US-01]: Proje Kart Navigasyonu ve UI Stabilitesi
*İlgili Birim:* Frontend
**User Story:** Bir kooperatif yöneticisi olarak, proje kartının herhangi bir yerine (başlık, gövde, ok ikonu) tıkladığımda detay sayfasına gitmek, ancak "Düzenle" butonuna tıkladığımda detay sayfasına gitmeden sadece düzenleme formunu açmak istiyorum.
**Definition of Done (DoD):**
- [ ] Proje kartı başlık (`header`) tıklanabilir ve `/projeler/:id` rotasına yönlendiriyor.
- [ ] Proje kartı gövde (`body`) tıklanabilir ve `/projeler/:id` rotasına yönlendiriyor.
- [ ] Kart üzerindeki sağa ok ikonu tıklanabilir ve `/projeler/:id` rotasına yönlendiriyor.
- [ ] "Düzenle" butonu tıklandığında `e.stopPropagation()` kullanılarak navigasyon engellenmeli ve sadece modal açılmalı.
- [ ] Navigasyon esnasında state kaybolmamalı.

### Ticket [US-02]: Mükerrer Blok Kayıt Engelleme
*İlgili Birim:* Backend / Database
**User Story:** Bir yönetici olarak, bir projeye aynı isimde iki blok eklemeyi denediğimde sistemin bunu engellemesini veya mevcut olanı güncellemesini (Upsert) istiyorum.
**Definition of Done (DoD):**
- [ ] Veritabanında `bloklar` tablosuna `unique (proje_id, blok_adi)` kısıtlaması eklenmiş veya varlığı doğrulanmış olmalı.
- [ ] Backend servisi (`proje.service.ts`), blok ekleme/güncelleme işleminde aynı isimde blok varsa mükerrer kayıt oluşturmamalı.
- [ ] Hata durumunda (DB constraint violation) kullanıcıya anlamlı bir "Bu blok adı zaten mevcut" uyarısı dönmeli.

### Ticket [US-03]: Kalıcı Blok Silme ve Bağımlılık Kontrolü
*İlgili Birim:* Backend / Database
**User Story:** Bir yönetici olarak, bir bloğu sildiğimde bunun veritabanından kalıcı olarak kaldırılmasını ve eğer o bloğa bağlı veriler (üye, şerefiye) varsa işlemin güvenli şekilde engellenmesini istiyorum.
**Definition of Done (DoD):**
- [ ] Silinen bloklar veritabanından `DELETE` komutu ile fiziksel olarak kaldırılmalı.
- [ ] Silme öncesi `bloklar` tablosuyla ilişkili `uyeler` veya `serefiye_tablosu` kayıtları kontrol edilmeli.
- [ ] Eğer bağımlı kayıt varsa silme engellenmeli ve "Bu blokta kayıtlı üyeler/daireler olduğu için silinemez" mesajı gösterilmeli.
- [ ] Frontend tarafında başarılı silme sonrası liste senkronize şekilde güncellenmeli.

---

## Veritabanı Şeması Gereksinimleri
| Tablo | Amaç | İlişkiler | RLS İhtiyacı |
|-------|------|-----------|--------------|
| bloklar | Proje binaları | `proje_id` -> `projeler.id` | Authenticated Access |

**Kritik SQL:**
```sql
ALTER TABLE public.bloklar ADD CONSTRAINT unique_proje_blok_adi UNIQUE (proje_id, blok_adi);
```

## API / Servis Sözleşmesi
| Endpoint/RPC | Metot | Amacı | Auth Gerekli Mi? |
|--------------|-------|-------|------------------|
| /api/projeler/:id | PUT | Proje/Blok Güncelle (Upsert) | Evet |
| /api/bloklar/:id | DELETE | Blok Sil (Constraint Check) | Evet |

## Frontend ve Tasarım İhtiyaçları
| Sayfa/Bileşen | Sorumlu Ticket | Gerekli API Bağlantısı | Notlar |
|---------------|----------------|------------------------|--------|
| ProjeListPage | US-01          | GET /api/projeler     | Event propagation fix |
| ProjeModal    | US-02/US-03    | PUT /api/projeler/:id | Blok listesi CRUD yönetimi |

## Yüksek Öncelikli Riskler / Engelleyiciler
- **Data Integrity:** Bağımlı verilerin (üye vb.) kazara silinmesi.
- **UX Confusion:** Kartın tamamı tıklanabilir olduğunda "Düzenle" butonuna basmanın zorlaşması.
