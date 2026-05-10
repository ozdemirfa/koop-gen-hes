# Üyelik Devir: İade Ödemesi + Başlangıç Bedeli

**Tarih:** 2026-05-10
**Durum:** Brainstorm — onay bekliyor

---

## Problem

Bir kooperatif dairesi Üye A'dan Üye B'ye devredildiğinde:
- A'nın hesabını kapatmak için **manuel bir üyelik bedeli iade ödemesi** kaydı gerekir (kooperatifin A'ya geri ödediği tutar; banka çıkışı).
- B'nin hesabına **manuel bir üyelik başlangıç bedeli** kaydı gerekir (B'nin kooperatife borçlandığı tutar; banka etkisi yok, sadece cari'de borç).
- Bu iki kalem ne `gelen_odeme` ne `giden_odeme` ile tam örtüşür; hesap kapama ve başlangıç işlemleri olarak ayırt edilebilir olmalı.
- A'nın o daireden kaynaklanan **gecikmiş aidatları B'ye AKTARILMAZ** — A'nın üzerinde kalır ve A'nın iade ödemesi ile (operatör elle) kapanır.
- Üye Detay sayfasında bu iki yeni kalem **Ödemeler / Makbuzlar** sekmesinde görünmelidir.

---

## Mevcut Durum (zaten doğru çalışan)

- `serefiye_tablosu.uye_id` üzerinde `trg_sync_aidatlar_on_unit_assignment` trigger'ı: daireye yeni üye atandığında dairenin **sahipsiz** (uye_id NULL) aidatlarını yeni üyeye bağlar + cari'ye borç (alacak) kaydı atar. Bu davranış istenen "vacant → member" akışı için doğru.
- A → B devri sırasında A'nın aidatları `uye_id IS NULL` değil, dolayısıyla trigger A'nın aidatlarına **dokunmaz** → istenen davranış (past aidatlar A'da kalır).
- `aidat_detaylari` view'i `COALESCE(a.uye_id, s.uye_id)` ile dairedeki güncel sahibi gösterir.
- `UyeDetailPage` "Aidat Hesapları" sekmesi `/aidatlar?uye_id={id}` sorgusuyla doğru üyenin aidatlarını listeler.

**Sonuç:** Aidat tarafı için kod değişikliği YOK. Tüm iş 2 yeni `islem_turu` değeri eklemek + UI'a 2 yeni dropdown opsiyonu + Ödemeler tab filtresini genişletmek.

---

## Tasarım

### 1. Veri modeli

`cari_hareketler.islem_turu` VARCHAR(50) + CHECK constraint. Mevcut değerler: `aidat_kayit, hakedis, gelen_odeme, giden_odeme, gecikme_faizi, fatura`.

**Yeni değerler:** `iade_odeme`, `devir_baslangic`.

| islem_turu | Cari yönü | Banka etkisi | Açıklama |
|---|---|---|---|
| `iade_odeme` | `alacak = tutar`, `borc = 0` (A için: cari bakiye proje alacağı yönünde artar; A'nın aidat borcunu kapatır) | Banka **çıkışı** (proje banka_hareketleri'nde gider) | Kooperatif A'ya üyelik bedelini iade eder |
| `devir_baslangic` | `alacak = tutar`, `borc = 0` (B için: yeni borç) | **YOK** | B'nin kooperatife olan başlangıç borcu kayıtlanır; tahsil edildiğinde ayrı bir `gelen_odeme` ile kapanır |

> **Cari konvansiyonu (mevcut kodla tutarlı):** `alacak` = proje'nin üyeden/firmadan alacağı (= üyenin borcu); `borc` = projenin üyeye/firmaya olan borcu (= üyeye yapılan ödeme). Mevcut `fn_create_payment_atomic` zaten `gelen_odeme` için `borc`, diğer hepsi için `alacak` doldurur — bu kural her iki yeni türde de doğru çalışır.

`kaynak_tipi`: ikisinde de NULL bırakılabilir veya `'devir'` etiketi atanabilir (raporlamada filtrelenebilirlik için tercih `'devir'`). `kaynak_id` NULL.

### 2. Backend (server)

#### 2.1 Migration: `supabase/migrations/20260510000013_devir_islem_turleri.sql`

```sql
-- 1. islem_turu CHECK constraint'ine iade_odeme ve devir_baslangic ekle
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
    END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check
CHECK (islem_turu IN (
    'aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme',
    'gecikme_faizi', 'fatura', 'iade_odeme', 'devir_baslangic'
));

COMMENT ON CONSTRAINT cari_hareketler_islem_turu_check ON public.cari_hareketler IS
  'Cari hareket tipleri: aidat_kayit (aidat tahakkuk), hakedis, gelen_odeme (tahsilat), giden_odeme (genel ödeme), gecikme_faizi, fatura, iade_odeme (üye lehine üyelik bedeli iadesi), devir_baslangic (yeni üyenin başlangıç bedeli alacağı).';
```

`fn_create_payment_atomic` RPC'si **değişmiyor** — mevcut "ELSE → alacak = tutar" branch'i her iki yeni türü de doğru ele alıyor. Banka hareketi koşulu `odeme_turu = 'banka' AND banka_hesap_id IS NOT NULL` olduğu için `devir_baslangic` (banka_hesap_id gönderilmeyecek) banka hareketi yaratmaz.

#### 2.2 Zod schema (cari ödeme şeması)

`server/src/schemas/cariHareket.schema.ts` (veya cari ödemenin doğrulandığı dosya — gerçek path implementation'da netleşir):

```ts
const islemTuruEnum = z.enum([
  'gelen_odeme', 'giden_odeme',
  'iade_odeme', 'devir_baslangic'
])
// banka_hesap_id sadece gelen_odeme/giden_odeme/iade_odeme'de zorunlu olabilir
// devir_baslangic'te banka_hesap_id gönderilirse de RPC ignore eder, ama
// schema seviyesinde superRefine ile reddetmek daha temiz.
```

`superRefine`:
- `islem_turu === 'devir_baslangic'` ise `banka_hesap_id` ve `odeme_turu === 'banka'` reddedilir
- `islem_turu === 'iade_odeme'` ise mevcut `giden_odeme` ile aynı kurallar (banka yolunda banka_hesap_id zorunlu, vs.)

#### 2.3 List endpoint çoklu islem_turu filtresi

UyeDetailPage Ödemeler tab'ı artık 4 türü çekecek: `gelen_odeme, iade_odeme, devir_baslangic` (+ opsiyonel olarak `gecikme_faizi`'yı dışarıda bırakacağız ya da kararlaştırırız).

Mevcut `cariHesap.controller.ts` / `cariHareket.service.ts` içinde list handler'ın `islem_turu` filter'ı tek değer alıyor. Genişletilecek:

```ts
// query?.islem_turu_in destekle (CSV string veya repeat param)
if (query.islem_turu_in) {
  const types = String(query.islem_turu_in).split(',').filter(Boolean)
  q = q.in('islem_turu', types)
}
```

Mevcut tek-değer `islem_turu` parametresi geriye uyumlu kalır.

### 3. Frontend (client)

#### 3.1 `pages/cariHesap/OdemeKayit.tsx`

**a)** İşlem Türü dropdown'ına 2 opsiyon eklenir:

```tsx
<Option value="iade_odeme">
  <Space><RollbackOutlined className="text-blue-500" /> Üyelik Bedeli İadesi</Space>
</Option>
<Option value="devir_baslangic">
  <Space><AuditOutlined className="text-orange-500" /> Üyelik Başlangıç Bedeli</Space>
</Option>
```

**b)** Cari türü filtresi: bu iki seçenek seçildiğinde "Üye" zorunlu (radio'yu üye'ye sabitle, firma'yı disable et).

**c)** Conditional render: `islem_turu === 'devir_baslangic'` ise

- `odeme_turu` Form.Item gizlenir (zorunsuz; payload'da gönderilmez veya `'cari'` gönderilir)
- Banka/Çek dynamic block koşulu `odemeTuru === 'banka' && islemTuru !== 'devir_baslangic'`
- Teminat checkbox da gizlenir (sadece giden_odeme'de)

**d)** Submit payload aynı endpoint'e gider: `POST /api/cari-hareketler/payment`. Backend zaten doğru ele alacak.

#### 3.2 `pages/uyeler/UyeDetailPage.tsx`

**a)** Ödemeler tab query:

```tsx
const { data: odemeler, isLoading: odemeLoading } = useQuery({
  queryKey: ['uye-odemeler', id],
  queryFn: async () => {
    const { data } = await api.get(`/cari-hareketler`, {
      params: {
        uye_id: id,
        islem_turu_in: 'gelen_odeme,iade_odeme,devir_baslangic',
        limit: 1000
      }
    })
    return (data.data as any[]).map(o => ({
      ...o,
      odeme_tarihi: o.tarih,
      // Tutar her zaman pozitif gösterilir — yön işareti İşlem Türü Tag'inden okunur
      tutar: Math.max(o.borc || 0, o.alacak || 0),
      odeme_yontemi: o.odeme_yontemi || o.odeme_turu || '-',
    }))
  },
})
```

**b)** Yeni "İşlem Türü" kolonu (Tag rengi); MoneyDisplay color prop ile renk yönü:

```tsx
const islemTuruMeta: Record<string, { color: string; label: string; tutarRenk: 'green' | 'red' | 'orange' }> = {
  gelen_odeme:      { color: 'green',  label: 'Tahsilat',           tutarRenk: 'green'  }, // proje kasaya para girdi
  iade_odeme:       { color: 'blue',   label: 'İade',               tutarRenk: 'red'    }, // proje kasadan çıktı
  devir_baslangic:  { color: 'orange', label: 'Başlangıç Bedeli',   tutarRenk: 'orange' }, // borç tahakkuk; nakit hareketi yok
}
```

`MoneyDisplay` mevcutta `colored` prop'u ile pozitif/negatif renklendiriyor. Bu varyant için ya `MoneyDisplay`'a `color` prop'u eklenir ya da Tag'in rengi yeterli görsel ipucu olarak kabul edilip Tutar kolonu nötr bırakılır. **Karar: Tutar kolonu nötr (default), İşlem Türü Tag'inin rengi ve etiketi yön bilgisini taşır.** Bu, devir_baslangic için "para hareketi yok ama kayıt var" semantiğini en az kafa karıştırarak iletir.

#### 3.3 `pages/uyeler/UyeDetailPage.tsx` — Aidat Hesapları tab'ı

Değişiklik **yok**. Mevcut `/aidatlar?uye_id={id}` zaten doğru üyenin aidatlarını gösteriyor.

### 4. Edge cases

| Durum | Davranış |
|---|---|
| B'ye 2 kez `devir_baslangic` kaydedilirse | Bloklamayız. UI'da uyarı gösterebiliriz (opsiyonel) |
| A'ya iade tutarı, A'nın gerçek borcundan fazla | A'nın cari'sinde negatif bakiye olur. Engellemiyoruz; admin kararı |
| `devir_baslangic` veya `iade_odeme` satırı yanlışlıkla kaydedildi | Mevcut cari hareket silme/düzeltme akışı kullanılır (ek iş yok) |
| A'nın daire bağı koparıldı ama iade kaydı henüz yapılmadı | A'nın aidat sorumluluğu değişmez — view `s.uye_id` artık NULL ama `a.uye_id = A` → A'da kalır. UI'da admin'e "iade kaydı yapmadan akışı kapatma" hatırlatması istenirse ileride |
| `gecikme_faizi` kalemi Ödemeler tab'ında görünmeli mi? | Şimdilik HAYIR. Aidat ile eşleşen faiz kalemleri Aidat Hesapları satırının "Faiz" kolonunda zaten görünüyor |

---

## Implementation Plan (high-level)

1. Migration `20260510000013_devir_islem_turleri.sql` yazılır, repo'ya commit edilir, Supabase dashboard'a uygulanır.
2. Server Zod schema'sı 2 yeni enum değeri + superRefine kuralı ile genişletilir.
3. Server cari-hareket list endpoint'ine `islem_turu_in` çoklu filtre desteği eklenir (geriye uyumlu).
4. OdemeKayit.tsx: dropdown'a 2 opsiyon, conditional rendering ve cari-tip kilidi.
5. UyeDetailPage.tsx Ödemeler tab: query genişletilir, "İşlem Türü" kolonu eklenir, tutar yön işareti güncellenir.
6. Manuel smoke test:
   - A için iade_odeme kaydı → banka hareketleri'nde gider satırı + A'nın cari'sinde alacak satırı görünür mü
   - B için devir_baslangic kaydı → banka hareketleri'nde **kayıt yok**, sadece B'nin cari'sinde alacak
   - UyeDetailPage(A): Ödemeler tab'ında "İade" rozetli satır
   - UyeDetailPage(B): Ödemeler tab'ında "Başlangıç Bedeli" rozetli satır

---

## Out of Scope (bu spec'te yok)

- Tek-buton "Daire Devir" akışı (atomic RPC). Bu A planının içinde değil; sonradan ayrı spec olarak eklenir gerekirse.
- A'nın `durum`'unu otomatik `istifa`/`ihrac` yapmak — admin kararı, manuel kalır.
- Mükerrer `devir_baslangic` engellemesi.
- Eski cari hareket satırlarını ters kayıtla iptal etme (reversal) workflow'u.
