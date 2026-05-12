# Spec — FIFO Realokasyon & Durum Rozeti Tutarlılığı

**Session:** 20260512-fifo-realloc-durum-fix
**Branch:** fix/fifo-realloc-durum-rozeti
**Owner:** Master agent (PM, DB, Backend, FE, QA tek-thread)

---

## 1. Hedefler

1. Bir üyenin tüm `aidat`/`baslangic_bedeli`-bağlı ödemelerini sıfırlayıp tarih sırasıyla yeniden dağıtan **idempotent realloc RPC** ekle.
2. Yeni veya değişen ödeme sonrası **aidatlar.durum kolonunu view-aligned formülle** recompute eden trigger fonksiyonunu güncelle.
3. Frontend'de "ÖDENDİ" rozetini **aidat_detaylari view'ından gelen kalan_borc** üzerinden çiz — `aidatlar.durum` kolonuna güvenme.
4. Üye Detay sayfasına **admin-only "FIFO Yeniden Dağıt"** butonu ekle.

## 2. Kapsam dışı

- Faiz yansıtma mantığında değişiklik (mevcut formül korunacak).
- baslangic_bedeli'nin Aidat Hesapları tablosundan kaldırılması (kullanıcı talebi değil).
- `cari_hareketler` şema değişikliği.

## 3. Acceptance criteria

### AC-1 (FIFO realloc doğruluğu)
Bir üyenin aidatlarına şu fixture uygulanmış olsun (Tahakkuk = Σ 50K + başlangıç 100K = 450K):
- 1/2026, 2/2026, 3/2026 (50K), 3/2026 (55K), 4/2026, 5/2026, 6/2026 (her biri 50K, 3/2026 55K toplam 455K) + başlangıç 100K.
- Toplam ödeme = 450K, parçalı dağılmış.

`SELECT public.fn_realloc_member_payments_fifo(<proje>, <uye>);` sonrası:
- Vade tarihine göre eski → yeni: başlangıç → 1/2026 → 2/2026 → 3/2026 → 3/2026 → 4/2026 → 5/2026 → 6/2026
- 100 + 50 × 7 = 450K → ilk 8 satır tam ödenecek (başlangıç 100K + 1,2,3,3,4,5,6 = 7 × 50K = 350K; 100+350=450). Yani 6/2026 boş kalır? Hayır — 6/2026'nın açık kalıp kalmaması fixture'a göre değişir, kullanıcının ekranında 6/2026 tam ödenmiş görünüyordu. Beklenen davranış: vade sırasına göre eski tarihlerden başla, ödeme bitene kadar tam doldur, son satır kısmi olabilir.
- Açık kalan tek satır 6/2026 olmalı (en yeni vade).

### AC-2 (Durum rozeti)
`aidat_detaylari` view `kalan_borc > 0` ve `durum = 'odendi'` olan satır **olmamalı**. (DB-side invariant.)

Frontend: rozet renkleri:
- `kalan_borc = 0` → yeşil "ÖDENDİ"
- `0 < kalan_borc < toplam_tahakkuk` → sarı "KISMİ"
- `kalan_borc = toplam_tahakkuk` ve vade geçmemiş → mavi "BEKLİYOR"
- `kalan_borc = toplam_tahakkuk` ve vade geçmiş → kırmızı "GECİKTİ"

### AC-3 (Üst kart tutarlılığı)
Üye Detay üst kartlar:
- Toplam Tahakkuk = Σ `toplam_tahakkuk` (view)
- Toplam Ödeme = Σ `toplam_odenen` (view)
- Geciken Borç = Σ `GREATEST(kalan_borc, 0)` WHERE `son_odeme_tarihi < CURRENT_DATE AND kalan_borc > 0`
- Toplam Tahakkuk − Toplam Ödeme = Σ kalan (rounding 0.01 tolerans)

### AC-4 (Realloc butonu)
"FIFO Yeniden Dağıt" butonu admin role'üne sahip kullanıcıda görünür. Tıklandığında confirm dialog → realloc RPC → ekran refresh.

### AC-5 (Test)
- SQL test: fixture kur, realloc çağır, sonuçları assert et.
- Playwright test: rozet visibility (kalan>0 olan satırda "ÖDENDİ" görünmemeli).

## 4. Teknik tasarım

### 4.1 DB — `fn_realloc_member_payments_fifo`

```
1. v_cari_id := cari_hesaplar (uye_id, proje_id) lookup
2. BEGIN TRANSACTION
3. UPDATE cari_hareketler SET kaynak_tipi = NULL, kaynak_id = NULL
   WHERE cari_hesap_id = v_cari_id
     AND islem_turu IN ('gelen_odeme', 'uyelik_baslangic')
     AND borc > 0
     AND kaynak_tipi IN ('aidat', 'baslangic_bedeli');
4. UPDATE aidatlar SET durum = CASE
       WHEN son_odeme_tarihi < CURRENT_DATE THEN 'gecikti'
       ELSE 'bekliyor' END
   WHERE uye_id = p_uye_id AND proje_id = p_proje_id;
5. PERFORM public.fn_match_member_payments_fifo(p_proje_id, p_uye_id, p_actor_id);
6. -- Re-evaluate durum for each aidat now that FIFO has tagged payments
   UPDATE aidatlar a SET durum = ...
   FROM (SELECT id, toplam_tahakkuk, toplam_odenen, son_odeme_tarihi
         FROM aidat_detaylari WHERE uye_id = p_uye_id) ad
   WHERE a.id = ad.id;
7. COMMIT
```

### 4.2 DB — `fn_recompute_aidat_durum` (view-aligned)

Mevcut trigger (20260429000001) `total_accrued`'ı cari'den çekiyor. View artık formula-based. Trigger'ı view formülüyle değiştir:

```sql
-- toplam_tahakkuk = (katsayi * serefiye_orani) + (faiz_yansitildi ? gecikme_faizi : 0)
-- toplam_odenen = SUM(cari_hareketler.borc) WHERE kaynak_tipi='aidat' AND kaynak_id=aidat.id
-- durum:
--   tahakkuk - odenen <= 0.009  → 'odendi'
--   son_odeme_tarihi < today    → 'gecikti'
--   else                        → 'bekliyor'
```

### 4.3 Backend — `/api/uye/:uyeId/fifo-realloc`

POST endpoint, admin guard, body: `{ proje_id }`. Çağrı: `supabase.rpc('fn_realloc_member_payments_fifo', { p_proje_id, p_uye_id, p_actor_id })`.

### 4.4 Frontend

- `client/src/pages/UyeDetay.tsx` (veya benzeri) — Aidat Hesapları tablosunda rozet:
  - Kaynak: `view.kalan_borc` ve `view.son_odeme_tarihi`
  - `durum` kolonuna güvenme; sadece görselleştirme için kullan.
- "FIFO Yeniden Dağıt" butonu: confirm dialog → mutation → query invalidate.

## 5. Risk & rollback

- Realloc RPC idempotent ve transactional. Hata durumunda rollback.
- Trigger değişikliği mevcut payment kayıtlarını etkilemez (sadece durum kolonu yeniden hesaplanır).
- Frontend rozet değişikliği UI-only.

## 6. Pipeline sırası

1. DB migration → 20260512000009 (realloc) + 20260512000010 (trigger view-aligned)
2. Backend endpoint
3. Frontend rozet + buton
4. SQL + Playwright test
5. Reviewer
6. Commit + push + PR
