# Gereksinimler: Aidat Faiz Ekleme ve Silme İşlemleri

**Talep:** Kullanıcı "aidat faiz ekle faiz sil işlemlerini planla" şeklinde bir talepte bulundu.

**İş Kuralları ve Kapsam:**
1.  **Faiz Ekleme:** Vadesi geçmiş aidatlara manuel veya otomatik faiz işletilebilmelidir. Bu işlem projeye bir "Alacak" (pozitif bakiye) olarak yansımalıdır.
2.  **Faiz Silme:** Hatalı eklenen veya affedilen faizler silinebilmelidir.
3.  **Muhasebe Bütünlüğü (Kritik Öncelik):** Sistemin hafızasındaki kurallara göre, eğer bir aidata kısmi veya tam ödeme yapılmışsa ve bu ödeme faizi de kapsıyorsa, doğrudan faiz silme işlemi *yapılamaz*.
    - Kullanıcı önce ödeme eşleştirmesini kaldırmalı (Undo Closure).
    - Ancak ödeme eşleşmesi kalktıktan sonra faiz silinebilir.
    - Bu sayede muhasebe bakiyesinin ve cari hareketlerin bozulması önlenir.

**Beklenen Çıktılar:**
- Veritabanında (Supabase) güvenli RPC fonksiyonları (örneğin `fn_toggle_aidat_faiz`).
- Backend'de bu RPC'yi tetikleyen ve hata mesajlarını UI'a taşıyan API endpointleri.
- Frontend'de kullanıcıya durumu açıkça bildiren (disabled butonlar, tooltipler) arayüz elementleri.
- Sürecin E2E (Playwright) ile doğrulanması.