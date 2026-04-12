# KoopGenHes - Geliştirme Planı

Konut Yapı Kooperatifi - Genel Hesap Yönetim Sistemi

---

## Mimari Kararlar

| Karar | Gerekçe |
|-------|---------|
| Express backend Supabase önünde | İş mantığı (hakediş hesaplama, toplu aidat), PDF üretimi, merkezi validasyon |
| Redux yok, Context + useApi | 5-10 kullanıcılık ölçek için yeterli, karmaşıklığı azaltır |
| Ant Design Form ile form state | Built-in validasyon, Türkçe locale desteği |
| Zod ile validasyon | TypeScript uyumlu, hafif, okunabilir schema tanımları |
| Otomatik cari hareket | Hakediş onayı ve fatura kaydında cari hareket otomatik oluşur |

---

## Veritabanı Şeması

### Migration Dosyaları

| # | Dosya | Tablolar | Açıklama |
|---|-------|----------|----------|
| 1 | `001_core_and_uyeler.sql` | `bloklar`, `uyeler` | Temel yapı, üye kaydı |
| 2 | `002_aidat.sql` | `aidat_tanimlari`, `aidatlar`, `aidat_odemeleri` | Aidat tanım, takip, ödeme |
| 3 | `003_gelir_gider.sql` | `gelir_gider_kategorileri`, `gelir_giderler` | Kategorili gelir/gider |
| 4 | `004_yuklenici_hakedis.sql` | `firmalar`, `sozlesmeler`, `sozlesme_is_kalemleri`, `hakedisler`, `hakedis_kalemleri` | Firma, sözleşme, hakediş |
| 5 | `005_cari_hesap_fatura.sql` | `faturalar`, `odeme_planlari`, `cari_hareketler`, `banka_hesaplari`, `banka_hareketleri` | Cari hesap, fatura, banka |
| 6 | `006_malzeme_teslim.sql` | `malzeme_teslimleri` | Malzeme teslim kayıtları |
| 7 | `007_proje_yonetimi.sql` | `projeler`, `proje_is_kalemleri`, `yillik_harcama_planlari`, `yillik_plan_kalemleri` | Proje, iş kalemi, yıllık plan |
| 8 | `008_rls_and_functions.sql` | - | RLS, trigger, fonksiyonlar |

### Tablo İlişkileri

```
bloklar ──< uyeler ──< aidatlar ──< aidat_odemeleri

firmalar ──< sozlesmeler ──< sozlesme_is_kalemleri
                         ──< hakedisler ──< hakedis_kalemleri ──> sozlesme_is_kalemleri

firmalar ──< faturalar ──< odeme_planlari
firmalar ──< cari_hareketler
firmalar ──< malzeme_teslimleri

banka_hesaplari ──< banka_hareketleri ──> cari_hareketler

projeler ──< proje_is_kalemleri (self-referencing, hiyerarşik)
projeler ──< yillik_harcama_planlari ──< yillik_plan_kalemleri ──> proje_is_kalemleri
```

### ENUM Tipleri

```sql
uyelik_durumu: aktif, pasif, ihrac, istifa
cinsiyet: erkek, kadin
aidat_durumu: bekliyor, odendi, gecikti, iptal
odeme_yontemi: nakit, havale, eft, kredi_karti, diger
islem_tipi: gelir, gider
firma_tipi: yuklenici, tedarikci
hakedis_durumu: taslak, onaylandi, odendi, iptal
fatura_tipi: gelen, giden
fatura_durumu: bekliyor, odendi, kismi_odendi, iptal
cari_hareket_tipi: borc, alacak
is_kalemi_durumu: planli, devam_ediyor, tamamlandi, iptal
```

---

## Backend Yapısı (server/)

### Dosya Organizasyonu

```
server/
  package.json
  src/
    index.js                          -- Express app, middleware zinciri
    config/
      supabase.js                     -- Supabase client (service role key)
      constants.js                    -- Sabitler
    middleware/
      auth.js                         -- Bearer token → Supabase auth.getUser()
      errorHandler.js                 -- ApiError yakalama, JSON response
      validate.js                     -- Zod schema validasyon factory
    routes/
      index.js                        -- Route aggregator
      uyeler.routes.js
      bloklar.routes.js
      aidatlar.routes.js
      gelirGider.routes.js
      firmalar.routes.js
      sozlesmeler.routes.js
      hakedisler.routes.js
      faturalar.routes.js
      cariHesap.routes.js
      bankaHesap.routes.js
      malzemeTeslim.routes.js
      projeler.routes.js
      raporlar.routes.js
      dashboard.routes.js
    services/
      uye.service.js
      aidat.service.js
      gelirGider.service.js
      firma.service.js
      sozlesme.service.js
      hakedis.service.js              -- En karmaşık: kümülatif hesap, kesintiler
      fatura.service.js
      cariHesap.service.js
      bankaHesap.service.js
      malzemeTeslim.service.js
      proje.service.js
      rapor.service.js
    utils/
      ApiError.js                     -- Custom error class (statusCode, message)
      pagination.js                   -- Sayfalama helper
      pdfGenerator.js                 -- pdfmake ile PDF üretimi
      formatters.js                   -- TL formatlama, tarih formatlama
```

### API Endpoint'leri

#### Üyeler & Bloklar
```
GET/POST        /api/bloklar
PUT/DELETE      /api/bloklar/:id
GET/POST        /api/uyeler
GET/PUT/DELETE  /api/uyeler/:id
GET             /api/uyeler/:id/aidatlar
```

#### Aidat
```
GET/POST        /api/aidat-tanimlari
PUT             /api/aidat-tanimlari/:id
GET             /api/aidatlar                    -- filter: uye_id, yil, ay, durum
GET             /api/aidatlar/:id
POST            /api/aidatlar/:id/odeme
GET             /api/aidatlar/ozet
POST            /api/aidatlar/gecikme-hesapla
```

#### Gelir/Gider
```
GET/POST        /api/gelir-gider-kategorileri
GET/POST        /api/gelir-giderler
GET/PUT/DELETE  /api/gelir-giderler/:id
```

#### Firma & Sözleşme
```
GET/POST        /api/firmalar
GET/PUT         /api/firmalar/:id
GET             /api/firmalar/:id/cari-ekstre
GET/POST        /api/sozlesmeler
GET/PUT         /api/sozlesmeler/:id
GET/POST        /api/sozlesmeler/:id/is-kalemleri
PUT/DELETE      /api/sozlesme-is-kalemleri/:id
```

#### Hakediş
```
GET/POST        /api/hakedisler
GET/PUT         /api/hakedisler/:id
PUT             /api/hakedisler/:id/onayla
POST            /api/hakedisler/:id/kalemler     -- toplu kalem güncelleme
GET             /api/hakedisler/:id/pdf
```

#### Fatura & Cari Hesap & Banka
```
GET/POST        /api/faturalar
GET/PUT/DELETE  /api/faturalar/:id
POST            /api/faturalar/:id/odeme-plani
GET/POST        /api/cari-hareketler
GET/POST        /api/banka-hesaplari
GET/POST        /api/banka-hareketleri
PUT             /api/banka-hareketleri/:id/esle
```

#### Malzeme Teslim
```
GET/POST        /api/malzeme-teslimleri
GET/PUT/DELETE  /api/malzeme-teslimleri/:id
```

#### Proje
```
GET/POST        /api/projeler
GET/PUT         /api/projeler/:id
POST            /api/projeler/:id/is-kalemleri
PUT/DELETE      /api/proje-is-kalemleri/:id
GET             /api/projeler/:id/yillik-plan/:yil
POST            /api/projeler/:id/yillik-plan
PUT             /api/yillik-plan-kalemleri/:id
```

#### Dashboard & Raporlar
```
GET             /api/dashboard/ozet
GET             /api/dashboard/aylik-gelir-gider
GET             /api/dashboard/aidat-durumu
GET             /api/raporlar/aylik-rapor?yil=&ay=
GET             /api/raporlar/yillik-rapor?yil=
GET             /api/raporlar/uye-borc-listesi
GET             /api/raporlar/hakedis-ozet
GET             /api/raporlar/pdf/:raporTipi
```

### NPM Paketleri

```json
{
  "dependencies": {
    "express": "^4.x",
    "cors": "^2.x",
    "dotenv": "^16.x",
    "helmet": "^7.x",
    "@supabase/supabase-js": "^2.x",
    "zod": "^3.x",
    "pdfmake": "^0.2.x",
    "dayjs": "^1.x"
  },
  "devDependencies": {
    "nodemon": "^3.x"
  }
}
```

---

## Frontend Yapısı (client/)

### Dosya Organizasyonu

```
client/
  package.json
  vite.config.js
  index.html
  src/
    main.jsx                          -- ConfigProvider (TR locale), dayjs TR
    App.jsx                           -- Router, AuthProvider, Layout
    config/
      supabase.js                     -- Supabase client (anon key)
      api.js                          -- Axios instance + auth interceptor
      routes.js                       -- Route path sabitleri
      theme.js                        -- Ant Design tema özelleştirme
    contexts/
      AuthContext.jsx                  -- Login/logout, Supabase auth state
    hooks/
      useAuth.js                      -- AuthContext consumer
      useApi.js                       -- GET/POST/PUT/DELETE + loading/error state
      useDebounce.js                  -- Arama girişi debounce
    layouts/
      MainLayout.jsx                  -- Sider (menü) + Header + Content
      AuthLayout.jsx                  -- Login sayfası layout
    components/
      common/
        PageHeader.jsx                -- Breadcrumb + başlık + aksiyon butonları
        DataTable.jsx                 -- Ant Table wrapper (pagination, arama, filter)
        StatCard.jsx                  -- Dashboard istatistik kartı
        MoneyDisplay.jsx              -- TL formatında tutar gösterimi
        ConfirmDelete.jsx             -- Silme onay dialogu
        LoadingSpinner.jsx
        EmptyState.jsx
      dashboard/
        SummaryCards.jsx
        GelirGiderChart.jsx           -- @ant-design/charts
        AidatDurumChart.jsx
        SonIslemlerTable.jsx
      uyeler/
        UyeTable.jsx
        UyeForm.jsx
      aidatlar/
        AidatTable.jsx
        AidatOdemeModal.jsx
        AidatTanimForm.jsx
      gelirGider/
        GelirGiderTable.jsx
        GelirGiderForm.jsx
      firmalar/
        FirmaTable.jsx
        FirmaForm.jsx
      sozlesmeler/
        SozlesmeForm.jsx
        IsKalemiTable.jsx
      hakedisler/
        HakedisKalemTable.jsx         -- Düzenlenebilir tablo
        HakedisSummary.jsx            -- Kesinti özet kartı
      faturalar/
        FaturaTable.jsx
        FaturaForm.jsx
        OdemePlaniTable.jsx
      cariHesap/
        CariEkstreTable.jsx
        BankaUzlastirmaTable.jsx
      malzemeTeslim/
        MalzemeTeslimTable.jsx
        MalzemeTeslimForm.jsx
      projeler/
        ProjeIsKalemiTree.jsx         -- Ağaç yapısı görünümü
        YillikPlanGrid.jsx            -- 12 aylık grid editör
    pages/
      LoginPage.jsx
      DashboardPage.jsx
      uyeler/
        UyeListPage.jsx
        UyeDetailPage.jsx
        UyeFormPage.jsx
      aidatlar/
        AidatTanimListPage.jsx
        AidatListPage.jsx
      gelirGider/
        GelirGiderListPage.jsx
        GelirGiderFormPage.jsx
        KategoriYonetimPage.jsx
      firmalar/
        FirmaListPage.jsx
        FirmaDetailPage.jsx           -- Sekmeler: bilgi, sözleşmeler, faturalar, cari ekstre
        FirmaFormPage.jsx
      sozlesmeler/
        SozlesmeDetailPage.jsx
        SozlesmeFormPage.jsx
      hakedisler/
        HakedisListPage.jsx
        HakedisDetailPage.jsx         -- En karmaşık UI
      faturalar/
        FaturaListPage.jsx
        FaturaFormPage.jsx
        OdemePlaniPage.jsx
      cariHesap/
        CariEkstrePage.jsx
        BankaHesapListPage.jsx
        BankaUzlastirmaPage.jsx
      malzemeTeslim/
        MalzemeTeslimListPage.jsx
        MalzemeTeslimFormPage.jsx
      projeler/
        ProjeListPage.jsx
        ProjeDetailPage.jsx
        YillikPlanPage.jsx
      raporlar/
        AylikRaporPage.jsx
        YillikRaporPage.jsx
        UyeBorcRaporPage.jsx
```

### Sidebar Menü Yapısı

```
Dashboard
├── Üyeler
│   └── Üye Listesi
├── Aidat Yönetimi
│   ├── Aidat Tanımları
│   └── Aidat Listesi
├── Gelir/Gider
│   ├── İşlemler
│   └── Kategoriler
├── Firmalar & Sözleşmeler
│   ├── Firma Listesi
│   ├── Hakedişler
│   └── Faturalar
├── Cari Hesap & Banka
│   ├── Cari Ekstre
│   ├── Banka Hesapları
│   └── Banka Uzlaştırma
├── Malzeme Teslim
├── Proje Yönetimi
│   ├── Projeler
│   └── Yıllık Plan
└── Raporlar
    ├── Aylık Rapor
    ├── Yıllık Rapor
    └── Üye Borç Listesi
```

---

## Geliştirme Fazları

### Faz 1: Temel Altyapı - TAMAMLANDI

**Bağımlılık:** Yok

- [x] `client/` init: Vite + React + Ant Design + React Router
- [x] `server/` init: Express + Supabase client + dotenv + cors + helmet
- [x] `server/src/index.js` - middleware zinciri
- [x] `auth.js` middleware - Supabase JWT doğrulama
- [x] `errorHandler.js` - merkezi hata yakalama
- [x] `ApiError.js` - custom error sınıfı
- [x] `validate.js` - Zod validasyon factory
- [x] `client/src/config/supabase.js` + `api.js` (axios)
- [x] `AuthContext.jsx` + `useAuth.js`
- [x] `LoginPage.jsx` + `AuthLayout.jsx`
- [x] `MainLayout.jsx` - Sider + Header + Content iskeleti
- [x] `ProtectedRoute` bileşeni
- [x] Test: giriş çalışıyor, korumalı route'lar yönlendiriyor

### Faz 2: Veritabanı - TAMAMLANDI

**Bağımlılık:** Yok (Faz 1 ile paralel yapılabilir)

- [x] 11 migration dosyası yazılması (başlangıç planındaki 8 dosyadan genişletildi)
- [x] Migration'ların Supabase'e uygulanması
- [x] `gelir_gider_kategorileri` seed data
- [x] Test blok ve üye verisi oluşturma
- [x] RLS politikalarının doğrulanması
- [x] Üye no sequence ve yıllık aidat planı fonksiyonları eklendi

### Faz 3: Üye Yönetimi - TAMAMLANDI

**Bağımlılık:** Faz 1, Faz 2

CRUD pattern'ı burada oluşturulacak, sonraki modüller bu pattern'ı takip edecek.

- [x] `uye.service.ts` + `uyeler.routes.ts` + `bloklar.routes.ts`
- [x] `UyeListPage` + `DataTable` (ortak bileşen)
- [x] `UyeFormPage` (oluşturma/düzenleme, cinsiyet alanı dahil)
- [x] `UyeDetailPage` (aidat geçmişi ile)
- [x] `PageHeader`, `ConfirmDelete`, `MoneyDisplay` ortak bileşenleri
- [x] `useDebounce` hook + arama debounce entegrasyonu
- [x] Durum ve blok filtresi (UyeListPage)
- [x] Çift query sorunu düzeltildi (UyeFormPage)

### Faz 4: Aidat Yönetimi - TAMAMLANDI

**Bağımlılık:** Faz 3 (üyeler mevcut olmalı)

- [x] `aidat.service.ts` - toplu aidat oluşturma, ödeme kayıt, gecikme faizi
- [x] `aidatlar.routes.ts`
- [x] Aidat tanımları + aidat listesi (Tabs yapısı, tek sayfa)
- [x] `AidatOdemeModal` (ödeme kayıt)
- [x] Yıllık aidat planı oluşturma (Frontend & Backend)
- [x] Gecikme faizi hesaplama butonu (UI entegrasyonu)
- [x] Yıl/ay/durum filtresi (aidat listesi)
- [x] Yıllık plan modal'da gecikme faiz oranı alanı
- [ ] Yıllık plan modal yerine ayrı sayfa üzerinden yönetilecek
- [x] MoneyDisplay tutarlılığı (inline format → component)

### Faz 5: Gelir/Gider - %90 TAMAMLANDI

**Bağımlılık:** Faz 1, Faz 2

- [x] `gelirGider.service.js` + `gelirGider.routes.js`
- [x] `GelirGiderListPage` + `GelirGiderTable`
- [x] `GelirGiderFormPage` + `GelirGiderForm`
- [ ] `KategoriYonetimPage` (Kategoriler modal üzerinden yönetiliyor, bağımsız sayfa eklenebilir)

### Faz 6: Firmalar & Sözleşmeler - TAMAMLANDI

**Bağımlılık:** Faz 1, Faz 2

- [x] `firma.service.ts` + `firmalar.routes.ts` (Backend)
- [x] `sozlesme.service.ts` + `sozlesmeler.routes.ts` (Backend)
- [x] `FirmaListPage` - modal bazlı CRUD, debounce arama, tip/aktiflik filtresi
- [x] `FirmaDetailPage` - sekmeli detay (bilgi, sözleşmeler, cari ekstre)
- [x] `SozlesmeFormPage` - oluşturma/düzenleme, firma seçimi, tarih, oranlar
- [x] `SozlesmeDetailPage` - iş kalemleri tablosu (CRUD + toplam hesaplama)
- [x] AdminLayout menüye "Firmalar & Sözleşmeler" eklendi
- [x] App.tsx route tanımları eklendi

### Faz 7: Hakediş - TAMAMLANDI (PDF hariç)

**Bağımlılık:** Faz 6 (firmalar ve sözleşmeler)

En karmaşık modül.

- [x] `hakedis.service.ts` - kümülatif hesaplama, kesinti, onay, otomatik cari hareket (Backend)
- [x] `hakedisler.routes.ts` (Backend)
- [x] `HakedisListPage` - sözleşme/durum filtresi, yeni hakediş modal
- [x] `HakedisDetailPage` - düzenlenebilir kalem tablosu + kesinti özet kartları
- [x] Editable InputNumber ile bu ay miktar girişi (taslak modda)
- [x] Kesinti hesaplama (teminat, stopaj, diğer) + net tutar gösterimi
- [x] Onay akışı (Popconfirm ile onay → cari hareket otomatik oluşturma)
- [x] AdminLayout menüde "Hakedişler" alt menüsü
- [ ] PDF üretimi (`pdfGenerator.ts`) - ileride eklenecek

### Faz 8: Fatura & Cari Hesap - TAMAMLANDI

**Bağımlılık:** Faz 6 (firmalar)

- [x] `fatura.service.js` + `faturalar.routes.js` - otomatik cari hareket (Backend Tamam)
- [x] `cariHesap.service.js` + `cariHesap.routes.js` (Backend Tamam)
- [x] `bankaHesap.service.js` + `bankaHesap.routes.js` (Backend Tamam)
- [x] `FaturaListPage` (Modal bazlı CRUD)
- [x] `CariEkstrePage` (Genel ekstre ve bakiye özeti)
- [x] `BankaHesapListPage` (Banka hesap yönetimi)
- [x] `BankaUzlastirmaPage` (Banka hareketleri ile cari hareketleri eşleştirme)
- [x] `OdemePlaniPage` (tek sayfa olarak implemente edildi, ayrı Table bileşeni gerekmedi)

### Faz 9: Malzeme Teslim - TAMAMLANDI

**Bağımlılık:** Faz 6 (firmalar)

- [x] `malzemeTeslim.service.js` + `malzemeTeslim.routes.js` (Backend Tamam)
- [x] `MalzemeTeslimListPage` (Modal bazlı CRUD)
- [x] AdminLayout menüye eklendi
- [x] App.tsx route tanımları eklendi

### Faz 10: Proje Yönetimi - TAMAMLANDI

**Bağımlılık:** Faz 1, Faz 2

- [x] `proje.service.js` + `projeler.routes.js` - ağaç yapısı, plan oluşturma (Backend Tamam)
- [x] `ProjeListPage`
- [x] `ProjeDetailPage` + `ProjeIsKalemiTree` (hiyerarşik görünüm)
- [x] `YillikPlanPage` + `YillikPlanGrid` (12 aylık grid editör)

### Faz 11: Dashboard & Raporlar - TAMAMLANDI (PDF hariç)

**Bağımlılık:** Tüm modüller

- [x] `rapor.service.js` - aggregate sorgular (Backend Tamam)
- [x] `dashboard.routes.js` + `raporlar.routes.js` (Backend Tamam)
- [x] `DashboardPage` + `SummaryCards` + `GelirGiderChart` + `AidatDurumChart` + `SonIslemlerTable`
- [x] `AylikRaporPage` + `YillikRaporPage` + `UyeBorcRaporPage`
- [ ] PDF çıktı endpoint'leri

### Faz 12: Son Düzeltmeler

**Bağımlılık:** Tüm fazlar

- [x] Hata durumları (`ErrorState` + `ErrorBoundary`) tüm list ve detail sayfalarında
- [x] Boş durum (`EmptyState`, DataTable `locale.emptyText` ile entegre)
- [x] Yükleniyor durumları (`LoadingState`, sayfalar inline `Spin` yerine)
- [x] Form validasyon tamamlama (Uye TC/tel, Sozlesme tarih/tutar, Fatura unique)
- [x] Responsive kontrolleri (Sider drawer breakpoint, Table `scroll={{ x: 'max-content' }}`, Row/Col `xs/md/lg`)
- [x] Uçtan uca manuel test checklist'i → `manual-test-checklist.md`

### Rev2 Ek Modüller

development.md başlangıç planına sonradan eklenen modüller:

- [x] `pages/cariHesap/CekTakibiPage.tsx` — Çek takibi
- [x] `pages/projeler/SerefiyePage.tsx` — Şerefiye yönetimi

---

## Kritik Dosyalar

| Dosya | Neden Kritik |
|-------|-------------|
| `supabase/migrations/20260407130400_yuklenici_hakedis.sql` | En karmaşık şema: kümülatif hesaplama, generated columns |
| `server/src/services/hakedis.service.ts` | Kümülatif miktar takibi, kesinti hesaplama, onay iş akışı |
| `server/src/middleware/auth.ts` | Tüm route'ların bağımlı olduğu auth temeli |
| `client/src/App.tsx` | Router, layout, auth guard - frontend iskeleti |
| `client/src/pages/Aidatlar.tsx` | Mevcut en karmaşık implemented UI |

---

## Doğrulama

Her faz tamamlandığında:
1. Backend endpoint'leri çalışıyor mu? (Postman / curl ile test)
2. Frontend sayfaları render oluyor mu?
3. CRUD işlemleri doğru çalışıyor mu?
4. Hesaplamalar (hakediş, gecikme faizi, cari bakiye) doğru mu?
5. `npm run dev` ile client ve server birlikte çalışıyor mu?
