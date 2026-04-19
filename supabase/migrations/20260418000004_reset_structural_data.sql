-- Migration: 20260418000004_reset_structural_data.sql
-- Projeler ve bloklar tablolarındaki tüm verileri temizler.
-- Bu işlem CASCADE ile bağlı olan diğer tüm tabloları (üyeler dahil) da temizleyecektir.

DO $$
BEGIN
    -- CASCADE ile tüm bağımlı verileri de temizleyerek yapısal tabloları boşaltıyoruz.
    TRUNCATE TABLE public.projeler CASCADE;
    TRUNCATE TABLE public.bloklar CASCADE;
    
    -- Not: Serefiye tablosu vb. bu tablolara bağlı olduğu için onlar da boşalacaktır.
END $$;
