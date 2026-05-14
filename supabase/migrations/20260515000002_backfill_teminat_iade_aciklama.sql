-- Migration: 20260515000002_backfill_teminat_iade_aciklama.sql
-- Description: cari_hareketler tablosundaki teminat iadesi kayıtlarından açıklaması
-- boş olanları "Teminat İadesi" ile doldurur. Kullanıcının manuel girdiği açıklamalar
-- (NULL/whitespace olmayan) korunur.
--
-- Bağlam: 20260515000001 ile Falaka'nın 5 NULL kaynak_tipi kaydı kaynak_tipi='teminat'
-- olarak güncellendi; ancak açıklama alanları boştu. Servis katmanı artık yeni
-- kayıtlarda boş açıklamayı otomatik "Teminat İadesi" yapıyor — bu migration aynı
-- davranışı geriye dönük olarak da uygular.
--
-- Etki: Cari ekstre tablolarında teminat iadelerinin amacı ilk bakışta anlaşılır.
-- Risk: Manuel açıklama yazmış olan kayıtlara dokunulmaz (whitespace trim sonrası
-- boş olanlar için filter uygulanır).

BEGIN;

UPDATE public.cari_hareketler
SET aciklama = 'Teminat İadesi'
WHERE kaynak_tipi = 'teminat'
  AND islem_turu IN ('giden_odeme','odeme')
  AND (aciklama IS NULL OR btrim(aciklama) = '');

COMMIT;
