# CI/CD Setup

Sprint `ci-pipeline` (2026-05-25) — GitHub Actions workflow + Dependabot.

## Workflows

### `ci.yml` — Continuous Integration

**Trigger**: `push` to master + her `pull_request` to master.

**Iki paralel job**:
| Job | Süre tipik | Adımlar |
|---|---|---|
| `server-test` | ~2-3 dk | npm ci → tsc build → vitest run (386 test) |
| `client-build` | ~2-3 dk | npm ci → tsc -b → vite build (route lazy splitting) |

**Cache stratejisi**: `actions/setup-node@v4` ile her job kendi `package-lock.json` hash'ine göre `~/.npm` cache'ler. Cold start ilk run ~5 dk, warm ~1.5 dk.

**Concurrency**: Aynı branch için paralel run'lar iptal edilir (force-push akışı + boş CI dakikası tüketimi önlenir).

### Client `.env` placeholder

Client `vite.config.ts` `envDir: '../'` ile root `.env` okur. CI'da gerçek Supabase URL/Key yok; build aşamasında bundle'a placeholder inject ediliyor. Runtime'da production env (Vercel/Render dashboard) farklı değerleri kullanır.

Eğer ileride `VITE_*` env vars'a bağımlı **build-time** kontrol eklenirse (örn. URL pattern validation), CI workflow'una gerçek değerlerin GitHub Secrets'tan injekte edilmesi gerekir:

```yaml
- name: Create .env from secrets
  run: |
    echo "VITE_SUPABASE_URL=${{ secrets.VITE_SUPABASE_URL }}" > .env
    echo "VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}" >> .env
```

GitHub repo settings → Settings → Secrets and variables → Actions → New repository secret.

## Dependabot

**`dependabot.yml`** — 3 npm ekosistemi (server, client, root) + GitHub Actions:
- **npm**: haftalık (Pazartesi 06:00 Europe/Istanbul), max 5 açık PR/ekosistem
- **github-actions**: aylık, max 3 açık PR
- Commit message prefix: `chore(deps,<scope>)` — proje konvansiyonuyla uyumlu
- Label'lar: `dependencies` + scope (backend/frontend/root/ci)

Dependabot PR'ları otomatik CI'a girer; geçerse merge edilebilir. Major bump'lar manuel review (zod 4 gibi breaking change'ler için).

## Migration Deploy (Opsiyonel — manuel trigger)

Şu an `npx supabase db push` **manuel** olarak lokalden yapılıyor. CI'da otomatize etmek için ek bir workflow eklenebilir:

```yaml
# .github/workflows/migration-deploy.yml (gelecekte eklenebilir)
name: Deploy Migrations
on:
  workflow_dispatch:  # Manuel trigger — Actions tab'tan "Run workflow"
jobs:
  push-migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} \
            --password ${{ secrets.SUPABASE_DB_PASSWORD }}
          supabase db push --linked
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

**Gerekli secrets** (kullanıcı manuel set eder):
- `SUPABASE_ACCESS_TOKEN` — supabase.com Dashboard → Account → Tokens
- `SUPABASE_PROJECT_REF` — `melbamccnvzhowgeybbj`
- `SUPABASE_DB_PASSWORD` — proje DB postgres password

Şu an eklenmedi: kullanıcı isterse ileri sprint'te aktive eder. Manuel `npx supabase db push` adımı master-agent.md'de standart prosedür olarak korunuyor.

## Badge

README.md'ye eklenebilir:

```markdown
![CI](https://github.com/ozdemirfa/koop-gen-hes/actions/workflows/ci.yml/badge.svg)
```

## Local CI Simülasyonu

Push öncesi tüm CI'ı taklit etmek için:

```powershell
# Server
cd server
npm ci
npm run build
npm test

# Client
cd ../client
npm ci
npm run build
```

Lokal'de 5-10 sn vs CI 2-3 dk — fast feedback için lokal koşması yeterli.

## Sıradaki Adımlar (ileri sprint)

- `migration-deploy.yml` workflow_dispatch aktivasyonu
- E2E smoke job — Playwright `auth-guard + role-system-v2 + role-gating-coverage` (3 spec, ~3 dk)
- Coverage raporu — `vitest --coverage` + Codecov entegrasyonu
- Lint gate — `npm run lint` server tarafında yok; client lint 156 warning baseline (`no-explicit-any`), error olarak gate gerek değil
