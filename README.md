# KoopGenHes

Konut Yapı Kooperatifi - Genel Hesap Yönetim Sistemi

## Stack
- **Frontend:** React + Vite + Ant Design
- **Backend:** Node.js + Express
- **Veritabanı:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (email/password, role-based)

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
