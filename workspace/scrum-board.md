# Proje: KoopGenHes - SCRUM Board
**Geçerli Session:** uye-detay-aidat-kontrol

## Sprint Hedefi: Üye Detay - Aidat Hesapları Doğrulama
Üye Detay sayfasındaki 'Aidat Hesapları' sekmesinin 'Proje Perspektifi' (Alacak = Tahakkuk, Borç = Ödenen, Bakiye = Kalan) muhasebe mantığına uyumlu olarak güncellenmesi ve kontrol edilmesi.

## Kritik Talimatlar
- **Frontend-Agent:** `UyeDetay.tsx` (veya ilgili component) üzerinde Ödenen, Kalan, Faiz gibi hesaplamaların ve gösterimlerin doğru kolonlardan (`alacak`, `borc`, `bakiye` veya view içerisindeki ödenen, tahakkuk_eden) alındığını kontrol et.
- **Database/Backend-Agent:** `aidat_detaylari_view` veya `get_aidat_summary` gibi fonksiyonların projeye uygun veriyi döndürdüğünü denetle.
- **QA-Test Agent:** İlgili componentin E2E testini koş.

## Aktif Sprint (Görevler)

| US-UDA-01 | Veri Kaynağı Analizi (Views & RPCs) | Master/DB Agent | Done | aidat view'ları analizi & migration |
| US-UDA-02 | Frontend Component Analizi & Düzeltmesi | Master/FE Agent | Done | UyeDetay / Aidat sekmesi |
| US-UDA-03 | QA Doğrulama Testi | QA-Test Agent | To Do | UI testleri |

---

## Archive / Önceki Sprintler

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