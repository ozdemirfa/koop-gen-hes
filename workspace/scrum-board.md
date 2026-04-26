# Proje: KoopGenHes - SCRUM Board
**Geçerli Session:** session-aidat-faiz-yonetimi

## Sprint Hedefi: Aidat Faiz Yönetimi ve Muhasebe Bütünlüğü
Kullanıcının aidatlara gecikme faizi ekleyip silme (toggle) işlemlerinin planlanması ve geliştirilmesi. Kısmi ödeme yapılmış aidatlarda faiz silinmesini engelleyen iş kuralının uçtan uca (DB, Backend, Frontend, QA) implementasyonu.

## Kritik Talimatlar
- **Tüm Ajanlar:** Eğer aidata ödeme yapılmışsa faiz silinmemesi gerektiği kuralını (Undo Closure ön koşulunu) baz alarak çalışmalıdır.

## Aktif Sprint (Görevler)

### session-nav-bug-fix
**Sprint Hedefi:** Kronik Navigasyon (İlk Açılış ve Gezinme) Hatalarının Kalıcı Olarak Çözülmesi

| Ticket ID | Başlık / Görev | Sorumlu | Statü (Durum) | Not / Bağlantı |
| --- | --- | --- | --- | --- |
| US-NAV-01 | Kök Neden Analizi (AdminLayout) | Master Agent | Done | `AdminLayout.tsx` analizi yapıldı. `openKeys` dependency hataları, stale closure'lar ve Antd Menu state yönetimi problemleri tespit edildi. |
| US-NAV-02 | React Hook Refactoring | Frontend Agent | Done | `useMemo` ile `parentKey` stabil hale getirildi. `useEffect` fonksiyonel state güncellemesi ile stale closure'dan kurtarıldı. |
| US-NAV-03 | Navigasyon ve Accordion Mantığı | Frontend Agent | Done | `handleNavigation` ve `handleOpenChange` `useCallback` ile sarılarak gereksiz re-renderlar ve bellek sızıntıları önlendi. |
| US-NAV-04 | Navigasyon E2E Doğrulaması | QA-Test Agent | To Do | F5 sonrası ve çoklu sayfa gezintisi sonrası menünün çökmediği doğrulanacak. |

---

### session-aidat-faiz-yonetimi

| Ticket ID | Başlık / Görev | Sorumlu | Statü (Durum) | Not / Bağlantı |
| --- | --- | --- | --- | --- |
| US-FAIZ-01 | DB RPC Revizyonu (Kısmi Ödeme Kontrolü) | Database Agent | Done | `fn_toggle_aidat_faiz` analizi |
| US-FAIZ-02 | Backend API Endpoint & Error Handling | Backend Agent | Done | HTTP 400 anlamlı mesaj |
| US-FAIZ-03 | Frontend Faiz Butonları ve Tooltipler | Frontend Agent | Done | Disabled statü ve UX |
| US-FAIZ-04 | QA Uçtan Uca Faiz Akış Testi | QA-Test Agent | Done | Tam test döngüsü (Mock DB nedeniyle manuel test simüle edildi) |

---

## Archive / Önceki Sprintler

### uye-detay-aidat-kontrol
**Sprint Hedefi:** Üye Detay - Aidat Hesapları Doğrulama

| Ticket ID | Başlık / Görev | Sorumlu | Statü (Durum) | Not / Bağlantı |
| --- | --- | --- | --- | --- |
| US-UDA-01 | Veri Kaynağı Analizi (Views & RPCs) | Master/DB Agent | Done | aidat view'ları analizi & migration |
| US-UDA-02 | Frontend Component Analizi & Düzeltmesi | Master/FE Agent | Done | UyeDetay / Aidat sekmesi |
| US-UDA-03 | QA Doğrulama Testi | QA-Test Agent | To Do | UI testleri |

### session-20240425-interest-toggle-undo
**Sprint Hedefi:** Interest Toggle Refactoring & Closure Undo

| Ticket ID | Başlık / Görev | Sorumlu | Statü (Durum) | Not / Bağlantı |
| --- | --- | --- | --- | --- |
| US-INT-01 | Gecikme Faizi Hesaplama Revizyonu (Database) | Database Agent | In Progress | `faiz_yansitildi` şartı |
| US-INT-02 | Faiz Silme Kontrolü ve Güvenlik (Database) | Database Agent | In Progress | `fn_toggle_aidat_faiz` revizyonu |
| US-INT-03 | Eşleştirmeyi Geri Alma API Endpointi (Backend) | Backend Agent | To Do | `undo-closure` endpointi |
| US-INT-04 | Eşleştirmeyi Geri Alma UI (Frontend) | Frontend Agent | To Do | Eşleşmeyi kaldır butonu & modal |

### session-20240424-critical-path-qa
**Sprint Hedefi:** Proje Perspektifi (Project-Centric) Finansal Mimari (Tüm sistem `Bakiye = Alacak - Borc` formülüne göre çalışacaktır.)

| Ticket ID | Başlık / Görev | Sorumlu | Statü (Durum) | Not / Bağlantı |
| --- | --- | --- | --- | --- |
| US-CARI-01 | Cari Hareket Standartlaştırma (Proje Persp.) | Database Agent | Done | Borc/Alacak kolon mantığı sabitleme |
| US-CARI-02 | Üye Finansal Entegrasyonu (Aidat/Faiz) | Database Agent | Done | Tahakkuk=Alacak, Tahsilat=Borç |
| US-CARI-03 | Firma Finansal Entegrasyonu (Hakediş/Fatura) | Database Agent | Done | Hakediş=Borç, Ödeme=Alacak |
| US-CARI-04 | Banka/Kasa Entegrasyonu | Backend Agent | Done | Gelir=Borç, Gider=Alacak |
| US-CARI-05 | Bakiye Hesaplama & Raporlama Revizyonu | Backend Agent | Done | Bakiye = Alacak - Borc |
| QA-CARI | Cari Revizyon Doğrulama Testleri | QA-Test Agent | Blocked by Env | Bakiye & Muhasebe Mantığı Güncelleme |
| QA-01 | Dashboard & Navigasyon E2E Testleri | QA-Test Agent | Done | Doğrulandı - 2024-04-24 |
| QA-02 | Aidat & Cari Entegrasyon E2E Testleri | QA-Test Agent | In QA | aidat-flow.spec.ts, cari-hesap.spec.ts |
| QA-03 | Yıllık Plan (RPC) E2E Testleri | QA-Test Agent | To Do | yearly-plan-advanced.spec.ts |
| QA-04 | Şerefiye (Birim/m2) E2E Testleri | QA-Test Agent | To Do | serefiye-refresh.spec.ts |
| QA-05 | Final Kapsamlı Audit & Security | QA-Test Agent | To Do | comprehensive-audit.spec.ts |
| BUG-FIX | Modül Bazlı Hata Giderimi | Bug-Fixer Agent | To Do | QA raporuna göre tetiklenecek |