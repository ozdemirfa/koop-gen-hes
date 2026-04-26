# Üye Detay - Aidat Hesapları Kontrolü

**Amaç:** Üye Yönetimi sayfasındaki 'Üye Detay' görünümünde yer alan 'Aidat Hesapları' sekmesindeki verilerin doğru gelip gelmediğini kontrol etmek ve 'Proje Perspektifi' muhasebe mantığına göre uyarlamak.

**Gereksinimler:**
1. Frontend'deki ilgili bileşeni (UyeDetay / AidatListesi) bul ve analiz et.
2. Backend/Veritabanı kaynağını (aidat_detaylari_view, get_aidat_summary) analiz et.
3. Proje Perspektifi (Alacak = Tahakkuk, Borç = Ödeme, Bakiye = Kalan) mantığıyla kolon eşleşmelerini kontrol et. Gerekirse düzelt.
4. QA-Test ile E2E testleri koşarak doğrula.
5. Süreci scrum-board üzerinden yönet.
