/**
 * Türkçe rol etiket sözlükleri — PR-B (yetkili global rol sistemi).
 *
 * İki bağlamda aynı "Yetkili" kelimesi farklı anlamlara gelir:
 *   - Global rol  user_roles.role = 'yetkili'  → sistem genelinde proje oluşturma yetkisi
 *   - Proje rolü  proje_uyelikleri.rol = 'owner' → proje sahibi; UI'da "Yetkili" etiketli
 */

export const PROJECT_ROLE_TR: Record<'owner' | 'manager' | 'user', string> = {
  owner: 'Yetkili',
  manager: 'Yönetici',
  user: 'Kullanıcı',
}

export const GLOBAL_ROLE_TR: Record<'admin' | 'yetkili' | 'staff', string> = {
  admin: 'Admin',
  yetkili: 'Yetkili',
  staff: 'Kullanıcı',
}

export const PROJECT_ROLE_COLOR: Record<'owner' | 'manager' | 'user', string> = {
  owner: 'gold',
  manager: 'blue',
  user: 'default',
}
