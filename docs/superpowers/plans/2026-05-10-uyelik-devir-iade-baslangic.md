# Üyelik Devir: İade Ödemesi + Başlangıç Bedeli — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new `cari_hareketler.islem_turu` values (`iade_odeme`, `uyelik_baslangic`) end-to-end — DB CHECK constraint, server Zod schema, server list filter, OdemeKayit dropdown, UyeDetailPage Ödemeler tab — so admins can record (a) membership-fee refunds when a member leaves, and (b) initial bulk membership debt for new members or A→B daire transfers.

**Architecture:** Pure data-flow extension. No new RPC, no new endpoints. The existing `fn_create_payment_atomic` RPC's branching (`gelen_odeme → borc, else → alacak`; banka kaydı sadece `odeme_turu='banka' AND banka_hesap_id IS NOT NULL`) is already correct for both new types. Aidat tarafına dokunulmuyor — mevcut `trg_sync_aidatlar_on_unit_assignment` trigger'ı doğru davranıyor.

**Tech Stack:**
- DB: Supabase (PostgreSQL) — migration file + manual dashboard apply
- Server: Express 5 + TypeScript + Zod + vitest
- Client: React 19 + Vite + Ant Design 6 + react-query
- Spec ref: `docs/superpowers/specs/2026-05-10-uyelik-devir-iade-baslangic-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260510000013_devir_islem_turleri.sql` | **CREATE** | DB CHECK constraint update |
| `server/src/schemas/cariHesap.schema.ts` | MODIFY | Extend `cariPaymentSchema.islem_turu`, add superRefine |
| `server/src/services/cariHesap.service.ts` | MODIFY | `list()` accepts `islem_turu_in` CSV; `createPayment()` type signature |
| `server/tests/unit/cariPaymentSchema.test.ts` | **CREATE** | Vitest unit tests for new schema validation |
| `client/src/pages/cariHesap/OdemeKayit.tsx` | MODIFY | Add 2 dropdown options + conditional rendering |
| `client/src/pages/uyeler/UyeDetailPage.tsx` | MODIFY | Ödemeler tab query + İşlem Türü column |

---

## Task 1: DB Migration — extend CHECK constraint

**Files:**
- Create: `supabase/migrations/20260510000013_devir_islem_turleri.sql`

- [ ] **Step 1.1: Create the migration file**

```sql
-- Migration: 20260510000013_devir_islem_turleri.sql
-- Description: Add 'iade_odeme' and 'uyelik_baslangic' to cari_hareketler.islem_turu CHECK constraint.
-- See spec: docs/superpowers/specs/2026-05-10-uyelik-devir-iade-baslangic-design.md

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cari_hareketler_islem_turu_check') THEN
        ALTER TABLE public.cari_hareketler DROP CONSTRAINT cari_hareketler_islem_turu_check;
    END IF;
END $$;

ALTER TABLE public.cari_hareketler ADD CONSTRAINT cari_hareketler_islem_turu_check
CHECK (islem_turu IN (
    'aidat_kayit', 'hakedis', 'gelen_odeme', 'giden_odeme',
    'gecikme_faizi', 'fatura', 'iade_odeme', 'uyelik_baslangic'
));

COMMENT ON CONSTRAINT cari_hareketler_islem_turu_check ON public.cari_hareketler IS
  'Cari hareket tipleri: aidat_kayit (aidat tahakkuk), hakedis, gelen_odeme (tahsilat), giden_odeme (genel ödeme), gecikme_faizi, fatura, iade_odeme (üye lehine üyelik bedeli iadesi), uyelik_baslangic (üyeye yazılan başlangıç bedeli alacağı — ilk kayıt veya daire devri).';
```

- [ ] **Step 1.2: Commit the migration file**

```bash
git add supabase/migrations/20260510000013_devir_islem_turleri.sql
git commit -m "feat(db): add iade_odeme + uyelik_baslangic to islem_turu CHECK"
```

- [ ] **Step 1.3: Apply to live Supabase**

User-action: paste the SQL into Supabase Dashboard → SQL Editor → Run. Verify constraint is in place:

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'cari_hareketler_islem_turu_check';
```

Expected: definition includes `'iade_odeme'` and `'uyelik_baslangic'`.

---

## Task 2: Server schema — extend cariPaymentSchema with new types

**Files:**
- Modify: `server/src/schemas/cariHesap.schema.ts`
- Test: `server/tests/unit/cariPaymentSchema.test.ts` (CREATE)

- [ ] **Step 2.1: Write the failing test**

Create `server/tests/unit/cariPaymentSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cariPaymentSchema } from '../../src/schemas/cariHesap.schema'

const baseValid = {
  proje_id: '00000000-0000-0000-0000-000000000001',
  cari_hesap_id: '00000000-0000-0000-0000-000000000002',
  tutar: 1000,
  tarih: '2026-05-10',
  odeme_turu: 'banka',
  banka_hesap_id: '00000000-0000-0000-0000-000000000003',
}

describe('cariPaymentSchema', () => {
  it('accepts gelen_odeme (existing behavior)', () => {
    const result = cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'gelen_odeme' })
    expect(result.success).toBe(true)
  })

  it('accepts iade_odeme with banka payload', () => {
    const result = cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'iade_odeme' })
    expect(result.success).toBe(true)
  })

  it('accepts uyelik_baslangic without banka payload', () => {
    const { banka_hesap_id, odeme_turu, ...minimal } = baseValid
    const result = cariPaymentSchema.safeParse({
      ...minimal,
      islem_turu: 'uyelik_baslangic',
      odeme_turu: 'cari',
    })
    expect(result.success).toBe(true)
  })

  it('rejects uyelik_baslangic with banka_hesap_id (no banka movement allowed)', () => {
    const result = cariPaymentSchema.safeParse({
      ...baseValid,
      islem_turu: 'uyelik_baslangic',
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown islem_turu', () => {
    const result = cariPaymentSchema.safeParse({ ...baseValid, islem_turu: 'random_unknown' })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/unit/cariPaymentSchema.test.ts`
Expected: 3-4 tests fail (unknown enum value `iade_odeme` / `uyelik_baslangic`); 1-2 may pass.

- [ ] **Step 2.3: Update schema**

In `server/src/schemas/cariHesap.schema.ts`, replace the existing `cariPaymentSchema` with:

```ts
export const cariPaymentSchema = z.object({
  proje_id: z.string().uuid(),
  cari_hesap_id: z.string().uuid(),
  islem_turu: z.enum(['gelen_odeme', 'giden_odeme', 'iade_odeme', 'uyelik_baslangic']),
  odeme_turu: z.enum(['nakit', 'banka', 'cek', 'kredi_karti', 'cari']),
  tutar: z.number().positive(),
  tarih: z.string(),
  aciklama: z.string().optional().nullable(),
  belge_no: z.string().optional().nullable(),
  banka_hesap_id: z.string().uuid().optional().nullable(),
  cek_id: z.string().uuid().optional().nullable(),
  vade_tarihi: z.string().optional().nullable(),
  banka: z.string().optional().nullable(),
  sube: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // uyelik_baslangic sadece tahakkuk kaydı — banka/çek alanı yasak
  if (data.islem_turu === 'uyelik_baslangic') {
    if (data.banka_hesap_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['banka_hesap_id'],
        message: 'uyelik_baslangic için banka_hesap_id gönderilemez',
      })
    }
    if (data.odeme_turu === 'banka' || data.odeme_turu === 'cek') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odeme_turu'],
        message: "uyelik_baslangic için odeme_turu 'cari' veya 'nakit' olmalı (banka/cek değil)",
      })
    }
  }
})
```

Note: `'cari'` enum'a eklendi çünkü `uyelik_baslangic` payload'ı için işaretleyici değer olarak kullanılacak. Mevcut akışı bozmaz (mevcut frontend kodu `cari` göndermiyor, ama kabul edilirliği genişletmek geriye uyumlu).

- [ ] **Step 2.4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/unit/cariPaymentSchema.test.ts`
Expected: 5/5 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add server/src/schemas/cariHesap.schema.ts server/tests/unit/cariPaymentSchema.test.ts
git commit -m "feat(server): extend cariPaymentSchema with iade_odeme + uyelik_baslangic"
```

---

## Task 3: Server list endpoint — add islem_turu_in multi-value filter

**Files:**
- Modify: `server/src/services/cariHesap.service.ts:30-49` (the non-eslesmemis branch of `list`)

- [ ] **Step 3.1: Implement the filter**

In `server/src/services/cariHesap.service.ts`, find the block:

```ts
    if (query.islem_turu) q = q.eq('islem_turu', query.islem_turu)
```

Replace with:

```ts
    if (query.islem_turu) q = q.eq('islem_turu', query.islem_turu)
    if (query.islem_turu_in) {
      const types = String(query.islem_turu_in)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (types.length > 0) q = q.in('islem_turu', types)
    }
```

- [ ] **Step 3.2: Verify TypeScript compiles**

Run: `cd server && npm run build`
Expected: zero errors.

- [ ] **Step 3.3: Commit**

```bash
git add server/src/services/cariHesap.service.ts
git commit -m "feat(server): support islem_turu_in CSV filter in cari-hareketler list"
```

---

## Task 4: Server createPayment — extend type signature

**Files:**
- Modify: `server/src/services/cariHesap.service.ts:81-97` (createPayment param type)

- [ ] **Step 4.1: Widen the islem_turu union and odeme_turu**

In `server/src/services/cariHesap.service.ts`, find:

```ts
  async createPayment(paymentData: {
    proje_id: string,
    cari_hesap_id: string,
    islem_turu: 'gelen_odeme' | 'giden_odeme',
    odeme_turu: 'nakit' | 'banka' | 'cek' | 'kredi_karti',
```

Change to:

```ts
  async createPayment(paymentData: {
    proje_id: string,
    cari_hesap_id: string,
    islem_turu: 'gelen_odeme' | 'giden_odeme' | 'iade_odeme' | 'uyelik_baslangic',
    odeme_turu: 'nakit' | 'banka' | 'cek' | 'kredi_karti' | 'cari',
```

No further code changes in this method — the existing path that calls `fn_create_payment_atomic` already handles new values correctly (RPC's ELSE branch sets `alacak = tutar`, banka block is skipped when `odeme_turu !== 'banka'`).

- [ ] **Step 4.2: Verify TypeScript compiles**

Run: `cd server && npm run build`
Expected: zero errors.

- [ ] **Step 4.3: Commit**

```bash
git add server/src/services/cariHesap.service.ts
git commit -m "feat(server): widen createPayment islem_turu/odeme_turu unions"
```

---

## Task 5: Client OdemeKayit — add 2 dropdown options + conditional rendering

**Files:**
- Modify: `client/src/pages/cariHesap/OdemeKayit.tsx`

- [ ] **Step 5.1: Add icon imports**

In `client/src/pages/cariHesap/OdemeKayit.tsx`, find the @ant-design/icons import line:

```ts
import { SaveOutlined, ClearOutlined, BankOutlined, MoneyCollectOutlined, AuditOutlined } from '@ant-design/icons'
```

Replace with:

```ts
import { SaveOutlined, ClearOutlined, BankOutlined, MoneyCollectOutlined, AuditOutlined, RollbackOutlined, UserAddOutlined } from '@ant-design/icons'
```

- [ ] **Step 5.2: Add the two new dropdown Options**

Find the İşlem Türü Select block:

```tsx
                <Select className="w-full">
                  <Option value="giden_odeme">
                    <Space orientation="horizontal"><MoneyCollectOutlined className="text-red-500" /> Giden Ödeme (Ödeme Yapıldı)</Space>
                  </Option>
                  <Option value="gelen_odeme">
                    <Space orientation="horizontal"><MoneyCollectOutlined className="text-green-500" /> Gelen Ödeme (Tahsilat Yapıldı)</Space>
                  </Option>
                </Select>
```

Replace with:

```tsx
                <Select className="w-full">
                  <Option value="giden_odeme">
                    <Space orientation="horizontal"><MoneyCollectOutlined className="text-red-500" /> Giden Ödeme (Ödeme Yapıldı)</Space>
                  </Option>
                  <Option value="gelen_odeme">
                    <Space orientation="horizontal"><MoneyCollectOutlined className="text-green-500" /> Gelen Ödeme (Tahsilat Yapıldı)</Space>
                  </Option>
                  <Option value="iade_odeme">
                    <Space orientation="horizontal"><RollbackOutlined className="text-blue-500" /> Üyelik Bedeli İadesi</Space>
                  </Option>
                  <Option value="uyelik_baslangic">
                    <Space orientation="horizontal"><UserAddOutlined className="text-orange-500" /> Üyelik Başlangıç Bedeli</Space>
                  </Option>
                </Select>
```

- [ ] **Step 5.3: Lock cari türü to "üye" when the new types are selected**

Find the Radio.Group for `filterCariTuru`:

```tsx
                <Radio.Group 
                  value={filterCariTuru} 
                  onChange={(e) => {
                    setFilterCariTuru(e.target.value)
                    form.setFieldValue('cari_hesap_id', undefined)
                  }}
                  buttonStyle="solid"
                  size="small"
                >
                  <Radio.Button value="uye">Üyeler</Radio.Button>
                  <Radio.Button value="firma">Firmalar</Radio.Button>
                </Radio.Group>
```

Replace with:

```tsx
                <Radio.Group 
                  value={filterCariTuru} 
                  onChange={(e) => {
                    setFilterCariTuru(e.target.value)
                    form.setFieldValue('cari_hesap_id', undefined)
                  }}
                  buttonStyle="solid"
                  size="small"
                  disabled={islemTuru === 'iade_odeme' || islemTuru === 'uyelik_baslangic'}
                >
                  <Radio.Button value="uye">Üyeler</Radio.Button>
                  <Radio.Button value="firma">Firmalar</Radio.Button>
                </Radio.Group>
```

Also: when islem_turu changes to one of the new types, force filterCariTuru to 'uye'. Find the Form's `onValuesChange`:

```tsx
          onValuesChange={(changedValues) => {
            if (changedValues.odeme_turu) {
              setOdemeTuru(changedValues.odeme_turu)
            }
          }}
```

Replace with:

```tsx
          onValuesChange={(changedValues) => {
            if (changedValues.odeme_turu) {
              setOdemeTuru(changedValues.odeme_turu)
            }
            if (changedValues.islem_turu === 'iade_odeme' || changedValues.islem_turu === 'uyelik_baslangic') {
              setFilterCariTuru('uye')
              form.setFieldValue('cari_hesap_id', undefined)
            }
            // uyelik_baslangic seçilince odeme_turu'yu otomatik 'cari' yap
            if (changedValues.islem_turu === 'uyelik_baslangic') {
              form.setFieldValue('odeme_turu', 'cari')
              setOdemeTuru('cari')
            }
          }}
```

- [ ] **Step 5.4: Conditionally hide odeme_turu / banka / teminat for uyelik_baslangic**

Find the odeme_turu Form.Item:

```tsx
              <Form.Item
                name="odeme_turu"
                label="Ödeme Aracı"
                rules={[{ required: true }]}
              >
                <Select onChange={handleOdemeTuruChange} className="w-full">
                  <Option value="nakit">Nakit</Option>
                  <Option value="banka">Banka (EFT/Havale)</Option>
                  <Option value="kredi_karti">Kredi Kartı</Option>
                  <Option value="cek">Çek</Option>
                </Select>
              </Form.Item>
```

Wrap the surrounding Col with conditional render:

```tsx
            {islemTuru !== 'uyelik_baslangic' && (
              <Col xs={24} md={12}>
                <Form.Item
                  name="odeme_turu"
                  label="Ödeme Aracı"
                  rules={[{ required: true }]}
                >
                  <Select onChange={handleOdemeTuruChange} className="w-full">
                    <Option value="nakit">Nakit</Option>
                    <Option value="banka">Banka (EFT/Havale)</Option>
                    <Option value="kredi_karti">Kredi Kartı</Option>
                    <Option value="cek">Çek</Option>
                  </Select>
                </Form.Item>
              </Col>
            )}
```

(Adjust the surrounding Row layout if needed — when odeme_turu is hidden, tarih can take full width. Either give tarih `md={24}` conditionally or leave as-is; the simpler path: leave tarih at md={12}.)

For the banka block, find:

```tsx
          {odemeTuru === 'banka' && (
            <Row gutter={24}>
```

Replace with:

```tsx
          {odemeTuru === 'banka' && islemTuru !== 'uyelik_baslangic' && (
            <Row gutter={24}>
```

For the teminat block, find:

```tsx
          {islemTuru === 'giden_odeme' && (
            <Row gutter={24} style={{ marginBottom: 16 }}>
```

Leave as-is — already only shown for `giden_odeme`.

- [ ] **Step 5.5: Build the client locally**

Run: `cd client && npm run build`
Expected: zero TypeScript errors, vite build succeeds.

- [ ] **Step 5.6: Commit**

```bash
git add client/src/pages/cariHesap/OdemeKayit.tsx
git commit -m "feat(client): OdemeKayit — iade_odeme + uyelik_baslangic options + conditional render"
```

---

## Task 6: Client UyeDetailPage — expand Ödemeler tab filter + add İşlem Türü column

**Files:**
- Modify: `client/src/pages/uyeler/UyeDetailPage.tsx`

- [ ] **Step 6.1: Update the odemeler query to fetch all 3 types**

Find:

```tsx
  // Tüm ödemeleri getir
  const { data: odemeler, isLoading: odemeLoading } = useQuery({
    queryKey: ['uye-odemeler', id],
    queryFn: async () => {
      const { data } = await api.get(`/cari-hareketler`, { 
        params: { 
          uye_id: id, 
          islem_turu: 'gelen_odeme',
          limit: 1000 
        } 
      })
      return (data.data as any[]).map(o => ({
        ...o,
        odeme_tarihi: o.tarih,
        tutar: o.borc, // Proje perspektifi: Gelen ödeme BORC kolonundadır
        odeme_yontemi: o.odeme_yontemi || o.odeme_turu || 'nakit',
      }))
    },
  })
```

Replace with:

```tsx
  // Üyeye ait ödeme + iade + başlangıç bedeli kalemlerini getir
  const { data: odemeler, isLoading: odemeLoading } = useQuery({
    queryKey: ['uye-odemeler', id],
    queryFn: async () => {
      const { data } = await api.get(`/cari-hareketler`, { 
        params: { 
          uye_id: id, 
          islem_turu_in: 'gelen_odeme,iade_odeme,uyelik_baslangic',
          limit: 1000 
        } 
      })
      return (data.data as any[]).map(o => ({
        ...o,
        odeme_tarihi: o.tarih,
        // Tutar her zaman pozitif gösterilir; yön bilgisi İşlem Türü Tag'inden okunur
        tutar: Math.max(Number(o.borc) || 0, Number(o.alacak) || 0),
        odeme_yontemi: o.odeme_yontemi || o.odeme_turu || '-',
      }))
    },
  })
```

- [ ] **Step 6.2: Add islem_turu meta map and the new column**

Just above the `odemeColumns` declaration, add:

```tsx
  const islemTuruMeta: Record<string, { color: string; label: string }> = {
    gelen_odeme:      { color: 'green',  label: 'Tahsilat' },
    iade_odeme:       { color: 'blue',   label: 'İade' },
    uyelik_baslangic: { color: 'orange', label: 'Başlangıç Bedeli' },
  }
```

Then find the existing `odemeColumns` array:

```tsx
  const odemeColumns = [
    { title: 'Tarih', dataIndex: 'odeme_tarihi', key: 'tarih', render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', render: (v: number) => <MoneyDisplay amount={v} colored /> },
    { title: 'Yöntem', dataIndex: 'odeme_yontemi', key: 'yontem', render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'Makbuz No', dataIndex: 'makbuz_no', key: 'makbuz' },
```

Replace the first line of columns and modify Tutar to be neutral:

```tsx
  const odemeColumns = [
    { title: 'Tarih', dataIndex: 'odeme_tarihi', key: 'tarih', render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    {
      title: 'İşlem Türü',
      dataIndex: 'islem_turu',
      key: 'islem_turu',
      width: 140,
      render: (v: string) => {
        const m = islemTuruMeta[v] ?? { color: 'default', label: v }
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Yöntem', dataIndex: 'odeme_yontemi', key: 'yontem', render: (v: string) => <Tag>{(v || '-').toUpperCase()}</Tag> },
    { title: 'Makbuz No', dataIndex: 'makbuz_no', key: 'makbuz' },
```

Note: `colored` removed from MoneyDisplay because the Tag carries the direction information now.

- [ ] **Step 6.3: Adjust the undo-match action visibility**

The Action column shows `RollbackOutlined` for `r.kaynak_id` — this is the undo-FIFO action. For `iade_odeme` and `uyelik_baslangic` rows, this kaynak_id is null (different kaynak), so the action is naturally hidden. **No code change needed**, but verify:

Find:

```tsx
        const isMatched = !!r.kaynak_id;
        if (!isMatched) return null;
```

Confirm this stays — it already correctly hides the undo button for non-FIFO-matched rows.

- [ ] **Step 6.4: Build the client locally**

Run: `cd client && npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 6.5: Commit**

```bash
git add client/src/pages/uyeler/UyeDetailPage.tsx
git commit -m "feat(client): UyeDetailPage Ödemeler tab — show iade + uyelik_baslangic with İşlem Türü column"
```

---

## Task 7: Manual smoke test

**Files:** none (verification step)

- [ ] **Step 7.1: Start server and client locally**

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open the client URL printed in terminal 2, log in as admin.

- [ ] **Step 7.2: Smoke — iade_odeme**

1. Navigate to `Cari Ödeme/Tahsilat Kaydı` (OdemeKayit page).
2. İşlem Türü → "Üyelik Bedeli İadesi". Cari Türü filter "Firma" disabled olmalı.
3. Bir üye seç (cari_hesap), tutar 5000, banka hesabı seç, kaydet.
4. Beklenen: success toast.
5. Database check (Supabase SQL editor):
   ```sql
   SELECT islem_turu, alacak, borc, banka_hareket_id FROM cari_hareketler ORDER BY created_at DESC LIMIT 3;
   ```
   Expected last row: `islem_turu='iade_odeme', alacak=5000, borc=0, banka_hareket_id IS NOT NULL`.
6. Navigate to that üye's UyeDetailPage → "Ödemeler / Makbuzlar" tab. Yeni satır "İade" rozetli görünmeli, tutar 5000.

- [ ] **Step 7.3: Smoke — uyelik_baslangic (yeni üye senaryosu)**

1. OdemeKayit → İşlem Türü "Üyelik Başlangıç Bedeli". Ödeme Aracı / Banka blokları **gizli** olmalı.
2. Bir üye seç, tutar 25000, kaydet.
3. Database check:
   ```sql
   SELECT islem_turu, alacak, borc, banka_hareket_id FROM cari_hareketler ORDER BY created_at DESC LIMIT 1;
   ```
   Expected: `islem_turu='uyelik_baslangic', alacak=25000, borc=0, banka_hareket_id IS NULL`.
4. UyeDetailPage(üye) Ödemeler tab: "Başlangıç Bedeli" rozetli satır, tutar 25000.

- [ ] **Step 7.4: Smoke — uyelik_baslangic (devir senaryosu)**

Aynı işlem ikinci kez kaydedilebilir mi (devir başlatılan üye için ikinci satır)? Test:

1. OdemeKayit → "Üyelik Başlangıç Bedeli" → aynı üyeye 10000 daha kaydet.
2. UyeDetailPage Ödemeler tab'ında 2 satır görünmeli (mükerrer engellenmiyor — meşru senaryo).

- [ ] **Step 7.5: Smoke — Aidat Hesapları tab değişmedi**

UyeDetailPage Aidat Hesapları tab'ı eskiden olduğu gibi aidat satırlarını göstermeli. Bu spec'te değişiklik yok — regression check.

- [ ] **Step 7.6: Final commit & push**

If all smoke tests pass and no further code changes are needed:

```bash
git status
# Verify clean working tree
git push origin master
```

User-action: push'u sen yap (auto-mode classifier engelliyorsa). Render + Vercel otomatik deploy başlar; Supabase migration zaten Task 1.3'te uygulandı.

---

## Out of Scope (explicit reminders)

- Tek-buton "Daire Devir" akışı (bu spec'te yok)
- A'nın `durum` otomatik güncellenmesi
- Mükerrer `uyelik_baslangic` engellemesi
- `iade_odeme` veya `uyelik_baslangic` için reversal/iptal workflow'u
- Aidat trigger değişikliği (mevcut davranış zaten doğru)
