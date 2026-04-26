Agent: master
Görev: session-20240424-critical-path-qa — Proje Perspektifi (Project-Centric) Revizyonu
Durum: TAMAMLANDI
Sonraki adım: Database-Agent, Backend-Agent ve QA-Test Agent biletleri 'In Progress' statüsüne alarak yeni mantığa göre geliştirmeye başlamalıdır.
---

## İş Akışı ve Koordinasyon Raporu (GÜNCELLENDİ)

1. **Sprint Backlog Revize Edildi:** 'Proje Perspektifi' mantığı tüm biletlere ve `scrum-board.md` dosyasına yansıtıldı.
2. **Kritik Mantık Sabitlendi:** 
   - **Bakiye = Alacak - Borc**
   - **Alacak (Credit):** Projenin alacaklı olduğu durumlar (Aidat Tahakkuku, Faiz Tahakkuku, Firmaya Ödeme/Avans).
   - **Borç (Debit):** Projenin borçlu olduğu durumlar (Üyeden Tahsilat, Firma Faturası, Onaylı Hakediş).

## Agent İş Emirleri ve Kritik Talimatlar

### [Database-Agent] - KRİTİK
- `fn_charge_aidat_tanimi` zaten alacak giriyormuş; bu **doğru** bir yapı, sakın değiştirme.
- Ancak **faiz hesaplama** (Alacak olmalı) ve **ödeme/tahsilat** (Borç olmalı) fonksiyonlarını bu yeni mantığa göre mutlaka kontrol et ve gerekiyorsa revize et.
- `cari_hareketler` tablosunda `kaynak_tipi` ve `kaynak_id` zorunluluğunu sağla.

### [Backend-Agent] - KRİTİK
- Servis katmanındaki tüm finansal atamaları (Aidat, Fatura, Hakediş, Banka) **Proje Perspektifi**'ne göre revize et.
- **Alacak:** Projenin hakkı / gönderdiği para.
- **Borç:** Projenin aldığı / borçlandığı para.
- API'lerdeki bakiye hesaplamalarını `Alacak - Borc` formülüne göre güncelle.

### [QA-Test Agent] - KRİTİK
- E2E testlerini (özellikle `aidat-flow.spec.ts` ve `cari-hesap.spec.ts`) `Bakiye = Alacak - Borc` formülüne göre güncelle.
- Proje perspektifini (Alacaklı proje = Pozitif Bakiye) doğrulayan test case'ler ekle.
- `QA-CARI` biletini 'To Do' statüsünden devralıp test planını buna göre işlet.

## Statü Özeti
- US-CARI-01 ... US-CARI-05: **To Do**
- QA-CARI: **To Do**
- Scrum Board güncellendi ve ekipler hazır.
