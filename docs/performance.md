# Performance Notes

Sprint `qa-review-bugfix-faz3` (2026-05-25, Batch 4) sonrası geçerli performans hedefleri ve discovery patternleri.

## Bundle hedefi

- **Initial JS (gzip) < 350 KB** — `client/vite.config.ts` manualChunks ile vendor splitting aktif.
- Chunk dökümü:
  - `react-vendor.js` — React + Router (~50 KB gzip beklenir)
  - `antd.js` — Ant Design + ikonlar (~200 KB gzip; en büyük chunk, AntD'nin tree-shake limiti)
  - `query.js` — TanStack Query (~15 KB gzip)
  - `supabase.js` — supabase-js (~25 KB gzip)
  - `index.js` (app code) — < 200 KB gzip hedef
- Build sonrası `dist/assets/` boyutlarını kontrol et: `npm run build` çıktısı her chunk için raw + gzip rapor verir.

## React Query staleTime stratejisi

Global default (`client/src/App.tsx`):
- `staleTime: 60_000` (1 dk) — kullanıcı sayfa içi gezinmesinde cache hit
- `gcTime: 5 * 60_000` (5 dk) — bellek temizliği
- `refetchOnWindowFocus: false` — sekmeler arası gereksiz refetch yok

Per-query override örnekleri:
- **Referans tablolar** (birim, poz, parametre): `staleTime: 5 * 60_000` (5 dk) — nadiren değişir.
- **Realtime list'ler** (dashboard, cari hareketler): default 60s yeterli; manuel `refetch()` butonu da var.
- **Mutate sonrası invalidation**: `queryClient.invalidateQueries({ queryKey: ['x'] })` — staleTime'dan bağımsız tetiklenir.

## FK index audit (Postgres)

### Discovery query — eksik FK index'leri bul

```sql
-- Foreign key kolonu olup index'lenmemiş (sequential scan riski)
SELECT
  c.conrelid::regclass AS table_name,
  string_agg(a.attname, ', ') AS fk_columns,
  c.confrelid::regclass AS references_table
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND (i.indkey::int[])[0] = a.attnum
  )
GROUP BY c.conrelid, c.confrelid, c.conname
ORDER BY table_name;
```

Sprint kapsamında `supabase/migrations/20260525130000_fk_index_audit.sql` ile 17 eksik FK index'i eklendi (cari_hareketler.banka_hareket_id, hakedisler.sozlesme_id, hakedis_kalemleri.hakedis_id, irsaliyeler.hakedis_id, proje_uyelikleri.user_id, vb.).

### Yavaş sorgu tespiti

```sql
-- pg_stat_statements var ise (Supabase'de yok ama RPC ile aktive edilebilir):
SELECT calls, mean_exec_time, query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

Alternatif: backend `logger.info` HTTP request süresi log'una bak (`server/src/middleware/morgan` stream'i). 500+ ms request'leri incele.

## Backend N+1 önlemi

Service'lerde `Promise.all(items.map(async (i) => supabaseAdmin.from(...)...))` paterni → **RED FLAG**. Batch RPC ile değiştir:
- ✅ Örnek: `firma.service.list` — 50 firma × 3 query = 150+ → **1 RPC** (`fn_firma_bakiye_batch`).
- ✅ Örnek: `bankaHesap.service.listHesaplar` — N hesap × 1 toplam = N+1 → **1 RPC** (`fn_banka_hesaplari_with_bakiye`).

Genel kural: list endpoint'leri için aggregation veya per-row computed alan gerekiyorsa, RPC içinde GROUP BY ile single-pass yapılır.

## Asset & deploy

- **Vercel** (frontend): otomatik CDN + brotli. `public/` static asset'leri immutable cache (1 yıl).
- **Render** (backend): single-instance dyno; in-memory cache (`roleCache`, `projectAccessCache`) 5 dk TTL — restart sonrası cold (kabul edilebilir).
- **JWT lokal verify** (SEC-013): `SUPABASE_JWT_SECRET` env var set edilirse authenticated request başına ~100 ms tasarruf.

## Bilinen darboğazlar (ileri sprint)

- **`hakedis.service.getById`** — 4+ seviye nested select (`*, sozlesmeler(...), hakedis_kalemleri(*, sozlesme_is_kalemleri(...)), irsaliyeler(...irsaliye_kalemleri(...))`). Detay sayfa açılışı ~500 ms. RPC'ye taşıma değer üretir.
- **`proje.service.importSerefiye`** — CSV satırları `for` döngüsünde `.update()` — 1000 satır = 1000 query. Batch update veya RPC ile çözülebilir.
- **Bundle initial JS** — AntD ~200 KB gzip; ileri sprint için `import { Button } from 'antd/es/button'` pattern'iyle daha agresif tree-shake.
