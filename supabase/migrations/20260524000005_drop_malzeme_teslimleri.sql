-- Migration: 20260524000005_drop_malzeme_teslimleri.sql
-- Description: malzeme_teslimleri tablosunu kaldır.
--   Geçmişte "malzeme teslim" feature'ı için kullanılıyordu, sonradan
--   irsaliyeler + irsaliye_kalemleri şemasına geçildi. Tablo artık ne kodda
--   (server/services/malzemeTeslim.service.ts irsaliyeler'i sorguluyor) ne
--   üretimde (0 satır, FK / view / function bağımlılığı yok) kullanılıyor.
--
-- DROP TABLE: trigger / index / RLS policy'leri otomatik düşer.
-- CASCADE bilinçli olarak EKLENMEDİ — gizli bir bağımlılık varsa migration
-- patlamalı (sessizce başka şeyleri silmemeli).

BEGIN;

DROP TABLE IF EXISTS public.malzeme_teslimleri;

COMMIT;
