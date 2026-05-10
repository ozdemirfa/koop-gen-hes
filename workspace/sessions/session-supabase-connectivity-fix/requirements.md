# Requirements: Supabase Connectivity Fix

## Problem
The project is currently configured to use a remote Supabase instance (`melbamccnvzhowgeybbj.supabase.co`) which is unreachable (`ERR_NAME_NOT_RESOLVED`). This prevents login and any database interaction.

## Analysis
- The project root `.env` contains the invalid Supabase URL.
- The project contains a `supabase/` directory with `config.toml`, suggesting it is designed for local Supabase development.
- Local Supabase ports are configured as:
  - API (URL): 54321
  - DB: 54322
  - Studio: 54323

## Goal
Switch the project to use local Supabase configuration to restore functionality.

## Tasks
1. Update root `.env` to point to local Supabase (`http://127.0.0.1:54321`).
2. Update Anon Key and Service Role Key with standard local Supabase keys (unless they are already set).
3. Verify `client/src/lib/supabase.ts` and `server/src/config/supabase.ts` correctly consume these variables.
4. Ensure the Scrum Board reflects this fix.
