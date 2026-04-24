-- Migration: 20260423000005_fix_firma_stats_and_balance_logic.sql
-- Description: Add project-based balance and retention statistics to firmalar.

BEGIN;

-- No DB changes needed here if we use a better query logic in the service.
-- However, we can create a view for better performance if needed.

COMMIT;
