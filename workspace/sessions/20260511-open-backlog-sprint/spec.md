# SPRINT: Open Backlog Closure (6 bilinçli skip task)

**Tarih:** 2026-05-11
**Brief:** master orchestrator, auto-mode
**Branch:** master
**Repo:** https://github.com/ozdemirfa/koop-gen-hes
**Baseline commit:** db91544

## Bağlam

Önceki sprintlerde bilinçli olarak skip edilen 6 task'ı sprint olarak tamamla. Her task farklı risk profili — Batch 1 (test/UX, düşük risk), Batch 2 (refactor, orta risk), Batch 3 (security/tooling, yüksek risk). Her batch sonu doğrulama + commit + push.

## Scope

### Batch 1 (Düşük risk)
- A3-01 (P3): aria-invalid runtime Playwright doğrulaması
- A2-02 (P2): Aidatlar filtre satırı mobile Drawer/Collapse

### Batch 2 (Orta risk)
- A3-02 (P2): validateTrigger global standardize
- A1-02 + CQ-02 (P3): AdminLayout MainHeader CSS migration

### Batch 3 (Yüksek risk)
- CODE-006 (P3): ESLint no-explicit-any warn + migration timestamp CI test
- SEC-013 (P3): JWT lokal verify (jose library)

## Doğrulama

Her batch sonu:
- `cd server && npm run build` clean
- `cd server && npx vitest run` (baseline 50/50)
- `cd client && npx tsc --noEmit` clean
- `cd client && npm run build` clean

## Production-Safe Kurallar

- git push origin master OK
- supabase db push OK (gerekirse)
- Destructive yok (--force, --no-verify)
- Pre-commit hooks PASS

## Durum

Başlatıldı: 2026-05-11
