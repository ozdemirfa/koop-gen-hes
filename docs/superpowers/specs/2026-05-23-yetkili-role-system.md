# Yetkili Rol Sistemi — Ops Runbook & Mimari Notlar

**Tarih:** 2026-05-23
**İlgili PR'lar:** #94 (PR-A: DB+BE), #95 (PR-B: FE), #?? (PR-C: bu doküman)
**Sprint:** 20260522-yetkili-role-system

---

## 1. Yeni Rol Mimarisi

| Kavram | Rol | Kapsam | Yetenek |
|---|---|---|---|
| Sistem süper-admini | **admin** | Global (`user_roles.role='admin'`) | Her yere/projeye erişim. Yetkili tanımlar/iptal eder. Davet eder. |
| Sistem yetkilisi | **yetkili** | Global (`user_roles.role='yetkili'`) | Yeni proje açabilir. Açtığı projede otomatik `owner`. İlk login'de proje listesi boş olabilir. |
| Proje yöneticisi | **yönetici** | Proje-bazlı (`proje_uyelikleri.rol='manager'`) | Davet edildiği projede manager yetkileri. Sistem genelinde proje açamaz. |
| Proje kullanıcısı | **kullanıcı** | Proje-bazlı (`proje_uyelikleri.rol='user'`) | Davet edildiği projede user yetkileri. |

**Önemli:** DB'de proje rolleri İngilizce (`owner`/`manager`/`user`) kalır; UI'da Türkçe gösterilir (`Yetkili`/`Yönetici`/`Kullanıcı`).

`client/src/lib/roleLabels.ts` sözlüğü:

```ts
PROJECT_ROLE_TR = { owner: 'Yetkili', manager: 'Yönetici', user: 'Kullanıcı' }
GLOBAL_ROLE_TR  = { admin: 'Admin', yetkili: 'Yetkili', staff: 'Kullanıcı' }
```

---

## 2. Migration Sonrası Davranış Değişiklikleri

### 2.1. Yeni kullanıcı kaydı

**Eski:** `fn_default_user_role` trigger ile her yeni `auth.users` satırı otomatik `user_roles.role='staff'` olarak işaretleniyordu.

**Yeni (PR-A sonrası):** Trigger **DROP edildi**. Yeni kullanıcı yalnızca şu üç yoldan birinden rol kazanır:
1. **Davet ile** (token+OTP): davet `invited_role` değerine göre `user_roles` row'u atılır (yetkili daveti → 'yetkili'; manager/user daveti → user_roles satırı atılmaz, sadece `proje_uyelikleri` satırı).
2. **Admin promote ile** (UI): admin kullanıcıyı `setUserGlobalRole`'da 'yetkili' atar.
3. **Direkt DB ile** (admin/manuel): yalnızca `user_roles.role='admin'` için.

### 2.2. Proje oluşturma

`POST /projeler` artık `requireYetkili` middleware'i ile korumalı (admin OR yetkili). Eskiden sadece authenticated yeterliydi.

DB seviyesinde de RLS politikası `is_yetkili()` ile aynı kuralı zorlar (defense-in-depth).

### 2.3. Yetkili daveti

Yeni endpoint: `POST /admin/invitations/yetkili` body `{ email }`. Davet kaydı:
- `proje_id = NULL`
- `invited_role = 'yetkili'`
- Diğer alanlar (token, otp_hash, expires_at) mevcut davet ile aynı

Consistency CHECK: `(invited_role='yetkili' AND proje_id IS NULL) OR (invited_role IN ('manager','user') AND proje_id IS NOT NULL)`.

---

## 3. Ops Runbook

### 3.1. İlk admin tanımlama (bootstrap)

Production'da migration deploy edildikten sonra **en az bir admin** olmalı. Eski staff kayıtları dokunulmadığı için mevcut admin'ler korunur; yenisini eklemek için:

```sql
-- 1) auth.users'tan ilgili user_id'yi bul
SELECT id, email FROM auth.users WHERE email = 'admin@kurum.tr';

-- 2) admin rolü ata (yoksa)
INSERT INTO user_roles (user_id, role)
VALUES ('<user_id>', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

### 3.2. Mevcut staff'ları "yetkili" yapma

Admin paneli (UI): `/admin/kullanicilar` → "Sistem Kullanıcıları" sekmesi → ilgili kullanıcı satırında **"Yetkili Yap"** butonu.

Toplu promote (manuel SQL, dikkatli kullan):

```sql
-- Belirli bir grup için (örnek: belirli e-posta domain'i)
INSERT INTO user_roles (user_id, role)
SELECT u.id, 'yetkili'
FROM auth.users u
WHERE u.email LIKE '%@kurum.tr'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.id AND ur.role IN ('admin', 'yetkili')
  )
ON CONFLICT (user_id, role) DO NOTHING;
```

### 3.3. Sağlık kontrolleri

`supabase/snippets/yetkili_role_audit.sql` — yeni dosya. Üretimde periyodik çalıştırılabilir. Çıktılar:
- Admin sayısı (en az 1 olmalı)
- Yetkili sayısı
- Orphan staff sayısı (artık otomatik atanmıyor ama eski kayıtlar duruyor)
- Geçersiz davet (proje_id consistency check ihlali — DB constraint zaten engelliyor, sanity için)

---

## 4. Rollback Notları (acil durum)

Migration'lar geri alınmak istenirse:

```sql
-- 1) is_yetkili helper'ı kaldır (politikalar bağımlı olduğu için önce policy'leri düşür)
DROP POLICY IF EXISTS projeler_insert_yetkili ON projeler;
DROP FUNCTION IF EXISTS is_yetkili();

-- 2) Mevcut yetkili rolündeki kullanıcıları staff'a indir
UPDATE user_roles SET role = 'staff' WHERE role = 'yetkili';

-- 3) CHECK constraint'i eski değere geri al
ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('admin', 'staff'));

-- 4) invitations.invited_role 'yetkili' kayıtlarını expire et veya sil
UPDATE invitations SET status = 'expired' WHERE invited_role = 'yetkili';
ALTER TABLE invitations DROP CONSTRAINT invitations_invited_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_invited_role_check CHECK (invited_role IN ('manager', 'user'));

-- 5) invitations.proje_id NOT NULL'a geri al (NULL yetkili davet kayıtları yoksa)
ALTER TABLE invitations ALTER COLUMN proje_id SET NOT NULL;

-- 6) projeler RLS'i sadece authenticated'a geri al
CREATE POLICY projeler_insert_authenticated ON projeler FOR INSERT TO authenticated WITH CHECK (true);

-- 7) Default user role trigger'ı geri ekle (gerekiyorsa)
-- bkz: supabase/migrations/20260510000016_default_user_role_trigger.sql
```

**Not:** Backend kodu trigger'a güvenmiyor; sadece davet/promote yollarıyla rol kazandırıyor. Trigger'ı geri eklemeden rollback yapmak güvenlidir.

---

## 5. Test ve Doğrulama

| Katman | Dosya | Kapsam |
|--------|-------|--------|
| Unit | `server/tests/unit/admin.service.test.ts` | setUserGlobalRole, cache invalidation |
| Unit | `server/tests/unit/invitation.service.yetkili.test.ts` | createYetkiliInvitation, accept yetkili branch |
| Unit | `server/tests/unit/requireRole.test.ts` | rank hiyerarşi + requireYetkili |
| Integration | `server/tests/integration/admin.role.test.ts` | env-gated, PATCH /admin/users/:id/role senaryoları |
| Integration | `server/tests/integration/invitations.yetkili.test.ts` | env-gated, davet → kabul → user_roles row |
| Integration | `server/tests/integration/projeler.create.test.ts` | mock'lı, non-yetkili → 403 |
| Smoke (PR-C) | `server/tests/integration/yetkili-role-system.smoke.test.ts` | end-to-end senaryoyu zincirler |
| E2E | `client/e2e/yetkili-flow.spec.ts` | Y1-Y4 UI akışları |

Smoke test (PR-C) production deploy öncesi minimum doğrulama. Lokal Supabase + admin user gerektirir (env-gated).

---

## 6. Bilinen Sınırlamalar

1. **Yetkili re-invite**: KullaniciYonetimiPage "Tekrar Davet Et" akışı şu an yetkili tipinde davet için `'user'` rolüne cast ediyor (proje-bazlı re-invite ile uyumsuz olduğundan). İleride ayrı flow eklenebilir.
2. **Staff drop edilmedi**: `user_roles.role='staff'` hala valid bir değer. Faz 5'te (ileride ayrı PR) tamamen kaldırılacak.
3. **Mailer template**: yetkili davet maili şu an generic mesaj (`role='user'` template'i). Mailer'a `'yetkili'` template'i eklenebilir.
4. **Admin promote/demote** sadece UI ile değil, bulk-SQL ile de yapılabilir; UI defansif (admin kendi rolünü değiştiremez) ama SQL'de bu kontrol yok.

---

## 7. Sonraki Adımlar (Faz 5, ayrı PR)

- `user_roles.role='staff'` rolünü tamamen kaldır (CHECK constraint sadece `admin/yetkili` kalır)
- Eski helper'ları (`is_staff()`) drop et
- Mevcut staff kayıtlarını sil veya yetkili'ye promote et
