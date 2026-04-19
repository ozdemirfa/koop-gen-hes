-- Migration: 20260418000001_add_enum_values.sql
-- Step 1: Add new values to odeme_yontemi enum
ALTER TYPE odeme_yontemi ADD VALUE IF NOT EXISTS 'banka';
ALTER TYPE odeme_yontemi ADD VALUE IF NOT EXISTS 'kasa';
ALTER TYPE odeme_yontemi ADD VALUE IF NOT EXISTS 'cek';
