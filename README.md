# KoopGenHes

[![CI](https://github.com/ozdemirfa/koop-gen-hes/actions/workflows/ci.yml/badge.svg)](https://github.com/ozdemirfa/koop-gen-hes/actions/workflows/ci.yml)

Konut Yapı Kooperatifi - Genel Hesap Yönetim Sistemi

## Stack
- **Frontend:** React 19 + Vite 8 + Ant Design 6 (route-based lazy splitting)
- **Backend:** Node.js + Express 5 + TypeScript
- **Veritabanı:** Supabase (PostgreSQL, RLS + audit_logs)
- **Auth:** Supabase Auth (email/password, JWT lokal verify, 3-rol proje modeli)
- **Test:** Vitest (server, 386 test) + Playwright (client e2e)
- **CI:** GitHub Actions — push/PR'da server-test + client-build (bkz. [docs/ci-setup.md](docs/ci-setup.md))

## Kurulum

```bash
# Tüm bağımlılıkları yükle
npm run install:all

# .env dosyasını oluştur
cp .env.example .env
# Supabase URL ve key bilgilerini doldur

# Geliştirme sunucusunu başlat (client + server)
npm run dev
```

## Yapı
```
├── client/          # React + Vite frontend
├── server/          # Node.js + Express backend
└── supabase/        # DB migration dosyaları
```
