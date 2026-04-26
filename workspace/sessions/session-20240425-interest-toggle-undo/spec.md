Agent: pm
Görev: Interest Toggle Refactoring & Closure Undo
Durum: TAMAMLANDI
Sonraki adım: Master Agent, spec.md içerisinde oluşturulan "Sprint Backlog" biletlerini scrum-board.md'ye aktararak sprint'i başlatabilir.
---

## Proje ve SCRUM Vizyonu
Bu sprintin amacı, geçikme faizi ve cari hesap hareketlerindeki eşleştirmelerin (kapama işlemlerinin) daha esnek ve kullanıcı dostu hale getirilmesidir. Sistem, varsayılan olarak her aidat için otomatik faiz hesaplıyordu ve faizi yansıtma kararı alındığında `cari_hareketler`'e yansıtıyordu. Yeni yapıyla, faiz yalnızca açık bir şekilde "yansıt" komutu verildiğinde (toggle = TRUE) cari harekete yansıtılacak (gecikme faizi kalemi olarak). Ayrıca, ödeme faizi dahi karşılamışsa bu faizin silinmesi engellenecektir.

Buna ek olarak, cari hareketler sayfasından yapılan "ödeme ve borç eşleştirmeleri" (kapama işlemleri), yanlışlık yapıldığında "Eşleşmeyi Kaldır" (Undo Closure) butonu ile geri alınabilecek. Bu işlem, ilgili ödemenin aidatla olan bağını koparıp aidatı tekrar 'gecikti' veya 'bekliyor' statüsüne çekecektir. MVP hedefimiz bu senaryoları hem veritabanı düzeyinde hatasız çalıştırmak hem de frontend arayüzünde hızlıca uygulanabilir kılmaktır.

## Teknoloji Stack Önerisi
- Frontend: React + Vite + Tailwind CSS
- Backend: Express + Node.js (TypeScript)
- Veritabanı: PostgreSQL (Supabase)

## SPRINT BACKLOG (Görev / Bilet Listesi)

### Ticket [US-INT-01]: Gecikme Faizi Hesaplama Revizyonu (Database)
*İlgili Birim:* Database
**User Story:** Bir sistem olarak, faiz yansıtılmadıkça `cari_hareketler` tablosuna gecikme faizi kaydı eklenmesini istemiyorum, ancak güncel faiz borcunu aidat üzerinde görebilmek istiyorum.
**Definition of Done (DoD) - Kabul Kriterleri:**
- [ ] `hesapla_gecikme_faizi` ve `fn_calculate_single_aidat_late_fee` fonksiyonları güncellenecek.
- [ ] `faiz_yansitildi` TRUE ise `cari_hareketler`'e `gecikme_faizi` tipinde (alacak yönlü) tek bir kayıt UPSERT edilecek.
- [ ] `faiz_yansitildi` FALSE ise `cari_hareketler` tablosunda işlem yapılmayacak, ancak `aidatlar.gecikme_faizi` hesaplanan güncel değerle güncellenecek (gösterim amaçlı).
- [ ] Güvenlik kontrollerinden geçmiş olmalı.
**Öncelik:** Yüksek (Kritik Yol)

### Ticket [US-INT-02]: Faiz Silme Kontrolü ve Güvenlik (Database)
*İlgili Birim:* Database
**User Story:** Bir yönetici olarak, ödemesi kısmen veya tamamen yapılmış bir faizi yanlışlıkla silmeyi engellemek istiyorum, böylece finansal tutarsızlık yaşamam.
**Definition of Done (DoD) - Kabul Kriterleri:**
- [ ] `fn_toggle_aidat_faiz` fonksiyonu revize edilecek.
- [ ] Parametre `p_active = FALSE` (Faiz Sil) olarak geldiğinde, ödenen tutar (`dinamik_odenen_tutar`) aidatın asıl bedelini (`hesaplanan_tutar`) aşıyorsa (yani faiz ödenmişse) işlemi durdurup "Faiz ödenmiş, silinemez. Önce kapama işlemini geri alınız" şeklinde bir hata fırlatacak.
- [ ] Eğer aşmıyorsa, `faiz_yansitildi = FALSE` yapacak ve `cari_hareketler`'den ilgili faiz kaydını silecek.
- [ ] Parametre `p_active = TRUE` (Faiz Ekle) olarak geldiğinde `faiz_yansitildi = TRUE` yapıp tekil bir `gecikme_faizi` kaydını `cari_hareketler`'e UPSERT edecek.
**Öncelik:** Yüksek (Kritik Yol)

### Ticket [US-INT-03]: Eşleştirmeyi Geri Alma API Endpointi (Backend)
*İlgili Birim:* Backend
**User Story:** Bir yönetici olarak, hatalı bir kapama işlemini geri alabilmek için gerekli API desteğinin bulunmasını istiyorum.
**Definition of Done (DoD) - Kabul Kriterleri:**
- [ ] `POST /api/cari-hesaplar/:id/undo-closure` endpoint'i oluşturulacak.
- [ ] Endpoint `cari_hareketler`'deki kaydı bulup `kaynak_tipi` ve `kaynak_id` değerlerini null yapacak.
- [ ] Eşleşme kaldırılan kaynak bir `aidat` ise, o aidatın toplam ödenen tutarını yeniden hesaplayacak ve bakiyesi kalan borcun altına düştüğünde durumunu 'gecikti' veya 'bekliyor' (vadesine göre) çekecek.
- [ ] İşlemler veritabanı Transaction içerisinde yürütülecek (Race-condition engelleme).
- [ ] API yetkilendirme (Auth) kontrolünden geçecek.
**Öncelik:** Yüksek (Kritik Yol)

### Ticket [US-INT-04]: Eşleştirmeyi Geri Alma UI (Frontend)
*İlgili Birim:* Frontend
**User Story:** Bir yönetici olarak, Cari Hareketler sayfasında ödeme işlemlerinin yanındaki "Eşleşmeyi Kaldır" butonu sayesinde hatalı eşleştirmeleri kolayca iptal etmek istiyorum.
**Definition of Done (DoD) - Kabul Kriterleri:**
- [ ] Backend'deki undo closure endpointine bağlanacak `undoClosureMutation` yazılacak.
- [ ] `GelirGider.tsx` ve `CariEkstrePage.tsx` bileşenlerinde, `kaynak_id` dolu olan ve tipi 'ödeme' olan hareketler için "Eşleşmeyi Kaldır" butonu eklenecek.
- [ ] Butona tıklandığında bir onay penceresi (confirmation modal) çıkacak.
- [ ] İşlem sonrası cari hareketler ve aidat listeleri (cache/query) güncellenecek.
**Öncelik:** Orta

---

## Veritabanı Şeması Gereksinimleri
| Tablo | Amaç | İlişkiler | RLS İhtiyacı |
|-------|------|-----------|--------------|
| cari_hareketler | Faiz kayıtlarının UPSERT/DELETE edilmesi; eşleştirme iptalinde `kaynak_tipi`/`kaynak_id` alanlarının NULL yapılması. | aidatlar | RLS değişimi gerekmiyor, mevcut yapıyı kullanacak. |
| aidatlar | Faiz eklendiğinde/çıkarıldığında `gecikme_faizi` ve `faiz_yansitildi` takibi; eşleştirme iptalinde durum güncellemesi. | cari_hareketler | RLS değişimi gerekmiyor. |

## API / Servis Sözleşmesi
| Endpoint/RPC | Metot | Amacı | Auth Gerekli Mi? |
|--------------|-------|-------|------------------|
| /api/cari-hesaplar/:id/undo-closure | POST | Yanlışlıkla yapılan ödeme kapamasını geri alır. | Evet |
| fn_toggle_aidat_faiz | RPC | Manuel faiz yansıtma veya faiz silme işlemini kontrol eder. | Supabase Client Üzerinden Evet |

## Frontend ve Tasarım İhtiyaçları
| Sayfa/Bileşen | Sorumlu Ticket | Gerekli API Bağlantısı | Notlar |
|---------------|----------------|------------------------|--------|
| GelirGider.tsx | US-INT-04 | /api/cari-hesaplar/:id/undo-closure | Sadece eşleşmiş (`kaynak_id` var) ödemeler için görünür olmalı. |
| CariEkstrePage.tsx | US-INT-04 | /api/cari-hesaplar/:id/undo-closure | Kullanıcı onayı (modal) eklenmelidir. |

## Yüksek Öncelikli Riskler / Engelleyiciler
- Faiz silme işlemi sırasında kısmi ödeme (faizin bir kısmının ödenmesi) durumunda `dinamik_odenen_tutar` hesaplamasının çok doğru yapılması gerekir; aksi takdirde kullanıcı hatalı bir şekilde faizi silebilir ve muhasebe bakiyesi şaşabilir.
- Eşleştirme iptali (Undo Closure) sırasında eşzamanlı istekler durumunda aidat durumu race-condition'a düşebilir, Transaction kullanılmalıdır.