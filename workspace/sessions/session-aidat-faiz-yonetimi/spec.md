# Teknik Tasarım ve Görev Listesi (Spec)

## Mimari Kararlar
- Veritabanı tarafında hali hazırda faiz ekleme/silme fonksiyonları (örn. `fn_toggle_aidat_faiz`) bulunuyor olabilir. Bu fonksiyonların güncel "kısmi ödeme kontrolü" kuralını kesin olarak içerip içermediği DB ajanı tarafından denetlenmelidir.
- Frontend tarafında "Faiz Uygula" / "Faizi Sil" aksiyonları genelde bir toggle (switch) veya row-action menüsünden tetiklenir.
- Muhasebe standardı gereği faiz eklendiğinde `cari_hareketler`'e Alacak olarak işlenir, silindiğinde bu hareket geri alınır.

## Ticket Listesi (Sprint Backlog)

| Ticket ID | Başlık | Açıklama | Sorumlu |
| :--- | :--- | :--- | :--- |
| **US-FAIZ-01** | DB RPC Revizyonu ve Kısmi Ödeme Kontrolü | `fn_toggle_aidat_faiz` fonksiyonunun analizi. Eğer aidatın kısmi ödemesi varsa (`odenen_tutar > ana_aidat_tutari` vb.) faiz silinmesini engelleyen RAISE EXCEPTION mantığının eklenmesi veya doğrulanması. | Database Agent |
| **US-FAIZ-02** | Backend API Validasyonları | `/api/aidat/:id/faiz-toggle` rotasında faiz toggle işlemi için endpoint revize edilmesi. DB'den dönen hataların (örn: "Önce ödemeyi geri alın") yakalanıp HTTP 400 Bad Request olarak anlamlı bir mesajla UI'a iletilmesi. | Backend Agent |
| **US-FAIZ-03** | Frontend UI UX İyileştirmeleri | Aidat listesi tablosunda "Faiz Durumu" veya "Faiz Uygula/Sil" butonuna müdahale. Ödemesi olan aidatlarda faiz silme butonunun disable edilmesi ve Tooltip ("Bu aidata ödeme yapılmış. Faizi silmek için önce ödemeyi iptal edin.") eklenmesi. | Frontend Agent |
| **US-FAIZ-04** | QA E2E Testleri | Playwright ile "Faiz Ekleme -> Ödeme Yapma -> Faiz Silmeye Çalışma (Başarısız) -> Ödeme Geri Alma -> Faiz Silme (Başarılı)" tam döngü testinin yazılması. | QA-Test Agent |