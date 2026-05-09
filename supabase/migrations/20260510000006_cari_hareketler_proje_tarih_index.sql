-- Migration: 20260510000006_cari_hareketler_proje_tarih_index.sql
-- Description: cari ekstre / hareket listesi sorguları proje_id filtresi + tarih sıralaması
-- yapıyor (server/src/services/cariHesap.service.ts:45-48). Mevcut tekil
-- idx_cari_hareketler_proje_id sadece filtre kısmını hızlandırır; composite (proje_id, tarih)
-- index'i hem filtreyi hem ORDER BY'ı tek pass ile karşılar.

CREATE INDEX IF NOT EXISTS idx_cari_hareketler_proje_tarih
    ON public.cari_hareketler (proje_id, tarih);
