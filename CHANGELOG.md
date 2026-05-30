# Changelog

Bu dosya kullanıcı yüzü değişiklikleri kapsar. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versiyonlama: sprint adı + tarih.

## [Unreleased]

### Eklendi
- **Firma Listesi'nde firma bazında "Fatura Açığı" sütunu + sıralama:** "Birikmiş Teminat" sütununun sağına her firma için **Fatura Açığı** (kesilen gelen fatura − onaylanan/ödenen hakediş) eklendi. Ayrıca liste artık **Ünvan, Cari Bakiye, Birikmiş Teminat ve Fatura Açığı** sütunlarına göre artan/azalan sıralanabiliyor. Sıralama server-side ve tüm firma kümesi üzerinde çalışır (yalnızca görünen sayfa değil); bu sayede çok firmalı listelerde de "en yüksek/en düşük" doğru gelir.
- **Aidat hatalı girişleri artık düzeltilebilir/silinebilir:** Borçlandırılmış bir aidat tanımı için Aidat Tanımları sayfasına **"Borçlandırmayı Geri Al"** eklendi — o aya ait tahakkuklar kaldırılır ve tanım tekrar "plan" durumuna döner (düzenle/sil açılır). Ayrıca Aidat Listesi ve Üye Detay > Aidat Hesapları'nda **tekil aidat satırı silme** eklendi. Her iki işlem de yalnızca ilgili aidata **ödeme eşleştirmesi yapılmamışsa** çalışır; eşleştirme varsa işlem reddedilir ve kullanıcı önce "Tahsilat Eşleşmesini Geri Al" akışına yönlendirilir. Plan durumundaki tanımlar için "Sil" butonu da arayüze getirildi.
- **Birimler ve Pozlar artık kişiselleştirilebilir (hibrit model):** Daha önce yalnızca global referans tablolar olan Birimler ve Pozlar'a artık her kullanıcı kendi tanımını ekleyebilir. NULL kapsam = global (admin/yetkili/manager ekler, herkese görünür), dolu = kişisel (yalnızca sahibine görünür). Listede "Kapsam" etiketi (Genel mavi / Kişisel yeşil) ve oluştururken "Genel/Kişisel" seçimi (yetkisi olanlara) gösterilir. Mevcut 9 birim + 200 poz global olarak korundu, geriye dönük uyumlu.

### Değişti
- **Aidat tutarları 100'e yukarı yuvarlanıyor (kuruşsuz):** Daire/üyeye yansıtılan aidat ana tutarı artık 100'ün katına **yukarı** yuvarlanır ve ondalık 0 olur (ör. 2.356,46 → 2.400,00). Yuvarlama hem üyeye yansıtılan tahakkukta hem gecikme faizinin taban tutarında uygulanır (faizin kendisi yine kuruşludur). Tüm hesaplama katmanları (borçlandırma, aidat görünümü, faiz hesapları, FIFO eşleştirme) tutarlı şekilde güncellendi. Not: önceden borçlandırılmış aidatlar yeni yuvarlamaya, ilgili tanım "Borçlandırmayı Geri Al → yeniden Borçlandır" ile yenilenerek geçer.

### Düzeltildi
- **Üyelik başlangıç bedeli ödemesi listede yanlış üyeye birleşiyordu:** Para Hareketleri sayfasında, farklı üyelere ait aynı tarih/ödeme yöntemi/açıklamaya sahip "Başl. Bedeli" tahsilatları tek satırda, ilk üyenin adıyla ve tutarları toplanarak görünüyordu (kayıtlar veritabanında doğru üyeye yazılıyordu; sorun yalnızca görüntülemedeydi). FIFO parça birleştirme anahtarına (`groupCariParcalari`) `cari_hesap_id` eklenerek farklı cari'lerin asla birleşmemesi sağlandı. Regresyon için istemci tarafına vitest birim testi altyapısı kuruldu.
- **Sözleşme iş kalemi ekleme/güncelleme 500 hatası:** Sözleşme detayında "İş Kalemi Ekle" sırasında `proje_id`, kolonu olmayan `sozlesme_is_kalemleri` tablosuna yazılmaya çalışıldığı için PostgREST `PGRST204` → 500 ("Veritabanı hatası oluştu") üretiyordu. Servis artık insert/update öncesi `proje_id`'yi strip ediyor; proje izolasyonu zaten parent sözleşme üzerinden cross-check ediliyor.
- **CORS preflight `X-Active-Project-Id` header'ını reddediyordu:** Axios interceptor her isteğe `X-Active-Project-Id` header'ı ekliyor ancak backend CORS `allowedHeaders` listesinde bu header yoktu. Sonuç: prod ortamında (`vercel.app` → `onrender.com`) tüm `/api/projeler`, `/api/auth/me` vb. istekleri preflight'ta "Request header field x-active-project-id is not allowed" hatasıyla bloklanıyordu. Header `allowedHeaders` listesine eklendi.

### Değişti (devam)
- **`user` (Kullanıcı) proje rolü artık salt-okunur:** Daha önce `user` rolündeki üyeler de kayıt oluşturup düzenleyebiliyordu (yalnızca silme/kullanıcı yönetimi manager+'a kapalıydı) — bu, arayüzdeki "Görüntüleyici / sadece görüntüleme yetkiniz var" etiketiyle çelişiyordu. Artık `user` rolü **yalnızca görüntüleme** yapar: tüm "Yeni X" / Düzenle / Sil butonları disabled olur ve oluşturma/güncelleme işlemleri (firma, fatura, hakediş, aidat, çek, banka, virman, sözleşme, üye, blok, malzeme, proje iş kalemleri vb. + kişisel birim/poz tanımları dahil) **manager veya owner** gerektirir. Backend (`requireProjectAccess('manager')` — 46 yazma endpoint'i) ve UI (`canEdit = isManager`) birlikte güncellendi; `manager`/`owner` davranışı değişmedi.

### Güvenlik
- **RLS offline_mode coverage tamamlandı (toplam 22 tablo):** Prod audit'te tespit edilen gap kapatıldı. `cari_hesaplar`, `irsaliyeler`, `birikmis_teminatlar`, `serefiye_tablosu`, `yillik_harcama_planlari` (proje_id direkt) ve `fatura_kalemleri`, `irsaliye_kalemleri` (parent join) tablolarına `_offline_lock_ins/upd/del` policy'leri eklendi. Smoking gun: `faturalar` parent INSERT korumalıyken `fatura_kalemleri` child INSERT bloklenmıyordu — kapatıldı.
- **Firmalar offline_mode yazma kilidi (middleware ile):** `firmalar` global tablo (proje_id yok) olduğu için per-proje RLS ile kilitlenemiyordu; offline projedeki non-owner kullanıcılar firma ekleyip güncelleyebiliyordu. POST/PUT route'larına `requireProjectAccess` middleware (X-Active-Project-Id header fallback) eklenerek server-side gating ile kapatıldı (defense in depth). GET serbest kaldı.
- **Kapsam dışı (tasarım kararı):** `birimler`, `pozlar` global/kişisel hibrit tablolar; per-proje offline lock uygulanmaz (kişisel kayıtlar zaten sahibine özel, global kayıtlar yetki middleware'i ile korunur).

## [role-system-v2] — 2026-05-20

Proje-bazlı 3 rol modeline (owner / manager / user) geçiş + şifre yenileme akışları.

### Eklendi
- **Yeni rol modeli (owner / manager / user):** Eski global admin/staff/viewer kavramı yerine her proje için 3 hiyerarşik rol. Her projede tam 1 owner; manager ve user sayısı sınırsız. Roller yetki seviyesi olarak: owner > manager > user.
- **Owner yetkileri:** Tüm aksiyonlar + proje üyelik yönetimi (davet, rol değiştir, çıkar) + üye şifre yenileme + proje silme.
- **Manager yetkileri:** Form girişi, düzenleme, silme/iptal/geri al, parametre değişiklikleri (Birimler/Pozlar/Parametreler), eşleşme iptali, closure iptali.
- **User yetkileri:** Form girişi (POST/PUT), okuma. Silme veya yıkıcı işlem yapamaz.
- **Otomatik owner ataması:** Yeni proje oluşturulduğunda oluşturan kullanıcı otomatik olarak proje sahibi olur.
- **Owner kullanıcılar için "Şifre Yenile" akışı:** Owner, projedeki manager veya user üyelerin şifresini doğrudan yenileyebilir. Yeni şifre owner'a bir kerelik gösterilip kopyalama desteklenir. (Owner kendi şifresini bu akışla yenileyemez — Ayarlar > Şifre Değiştir veya Şifremi Unuttum kullanır.)
- **"Şifremi Unuttum" public sayfası:** Tüm kullanıcılar (owner dahil) e-mail tabanlı standart Supabase Auth akışıyla şifrelerini yenileyebilir. Link login sayfasının altından erişilebilir.
- **Yeni şifre belirleme sayfası:** Reset e-mail bağlantısı tıklandığında açılır, güvenli token kontrolü + min 8 karakter şifre kuralı.

### Değişti
- **Kullanıcı Yönetimi sayfası:** Önceki global kullanıcı listesi yerine aktif projenin üyelerini gösterir. Aktif proje değişince liste otomatik yenilenir. Owner rolü değiştirilemez, çıkarılamaz; arayüzde bu satırların aksiyon butonları devre dışıdır.
- **Davet akışı:** Davet artık bir proje ve bir proje rolü ile birlikte verilir. Davet edilen kullanıcı sadece bu role ve projeye atanır. Kullanıcı zaten kayıtlıysa yeni magic-link gönderilmez — sadece projeye eklenir.
- **403 yetki hatası UX'i:** Yetki yetersizliği durumunda kullanıcı dostu uyarı + rol bilgisi gösterilir (önceki teknik mesaj yerine).
- **Menü sıralaması:** Yönetim menüsünde Kullanıcı Yönetimi daha öne taşındı.

### Düzeltildi
- **Virman oluşturma 400 hatası:** `proje_id`/`virman_tipi`/`tutar`/`tarih` alanlarındaki NOT NULL ihlali artık doğru alanı işaret ediyor; frontend Zod issue.path ile uyumlu kırmızı işaret koyabiliyor.
- **Hakediş Detay sayfasında React #185 ("Maximum update depth exceeded") hatası:** Sayfa açma/kapatma döngüsünde sonsuz re-render hatası giderildi.
- **Davet null hatası:** Davet formunda rol seçilmediğinde sessiz null artık doğru şekilde işleniyor.

### Güvenlik
- **Row-Level Security (RLS) refactor:** 8 finansal + 7 master-data + 5 alt tabloda yeni rol kontrolüne göre SELECT/INSERT/UPDATE (her üye) ve DELETE (manager+) politikaları. Service-role bypass + endpoint-katmanı middleware çift savunma.
- **Veri izolasyonu:** Bir projenin verisi başka projenin üyelerine asla görünmez.
- **Owner koruma:** Owner rolü `fn_set_user_role` ve `fn_remove_project_member` RPC'leri tarafından korunur — owner asla başka role indirilemez ya da çıkarılamaz. Her projede tam 1 owner kuralı uniqueness index ile garanti.
- **Email enumeration koruması:** Şifre sıfırlama formu, kullanıcının sistemde olup olmadığını sızdırmaz — her durumda aynı başarı mesajı gösterilir; rate-limit ayrı mesajla bildirilir.

### Manuel Deploy Adımları
- Supabase Dashboard > Authentication > URL Configuration > Redirect URLs listesine `{APP_PUBLIC_URL}/auth/sifre-sifirla` eklenmeli (dev + prod). ✅ Tamamlandı.
- Migration script'leri push edildi: `20260520000010_role_v2_expand`, `_backfill`, `_auto_owner_trigger`, `_rls_refactor`, `20260521000003_virman_rpc_column_hint`. ✅ Tamamlandı.

### Bilinen Sınırlamalar (sprint-2'ye taşındı)
- Owner transferi UI'dan yapılamaz — manuel SQL gerekir.
- Kullanıcı Yönetimi sayfası manager rolü için açılır ama liste backend tarafından 403 ile reddedilir (cross-PR tutarsızlık, sprint-2 P0).
- Kullanıcı Yönetimi sayfasındaki "Üye Davet Et" + "Rol Değiştir" butonları manager için görünür AMA backend owner-only — sprint-2 P0.
- `sistem_audit_log` tablosu henüz yok — şifre yenileme/davet aksiyonları sadece application log'a yazılıyor.
