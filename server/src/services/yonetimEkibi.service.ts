import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { requireProjeId } from '../utils/projectGuard'

// Sprint yonetim-ekibi (2026-05-30):
// Yönetim ekibi (management team) servisi. Standalone carileri (cari_hesaplar'a
// bağlı değil) yönetir + yönetim ödemelerini atomik RPC ile işler.
//   - bakiye = borc - alacak (pozitif = üyeye borçluyuz)
//   - Ödeme: fn_create_yonetim_payment_atomic → alacak güncellenir + kasa/banka
//     etkilenir; gelir/gider'e yazılmaz.

export interface YonetimPaymentInput {
  proje_id: string
  yonetim_id: string
  islem_turu: 'gelen_odeme' | 'giden_odeme'
  odeme_turu: 'nakit' | 'banka'
  banka_hesap_id?: string | null
  tutar: number
  tarih: string
  aciklama?: string | null
}

function withBakiye(row: any) {
  const borc = Number(row.borc || 0)
  const alacak = Number(row.alacak || 0)
  return { ...row, bakiye: Math.round((borc - alacak) * 100) / 100 }
}

export const yonetimEkibiService = {
  async list(query: Record<string, any>) {
    const projeId = requireProjeId(query.proje_id)

    const { data, error } = await supabaseAdmin
      .from('yonetim_ekibi')
      .select('*')
      .eq('proje_id', projeId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []).map(withBakiye)
  },

  async create(body: Record<string, any>) {
    const safeProjeId = requireProjeId(body.proje_id)

    const { data, error } = await supabaseAdmin
      .from('yonetim_ekibi')
      .insert([{ proje_id: safeProjeId, ad_soyad: body.ad_soyad, oran: body.oran }])
      .select()
      .single()

    if (error) throw error
    return withBakiye(data)
  },

  async update(id: string, body: Record<string, any>) {
    const safeProjeId = requireProjeId(body.proje_id)

    // Mass-assignment guard: proje_id / borc / alacak kullanıcı tarafından yazılamaz.
    const payload: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.ad_soyad !== undefined) payload.ad_soyad = body.ad_soyad
    if (body.oran !== undefined) payload.oran = body.oran

    const { data, error } = await supabaseAdmin
      .from('yonetim_ekibi')
      .update(payload)
      .eq('id', id)
      .eq('proje_id', safeProjeId) // IDOR defense-in-depth
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw ApiError.notFound('Yönetim carisi bulunamadı')
    return withBakiye(data)
  },

  async remove(id: string, projeId: string) {
    const safeProjeId = requireProjeId(projeId)

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('yonetim_ekibi')
      .select('id, proje_id')
      .eq('id', id)
      .maybeSingle()

    if (findErr) throw findErr
    if (!existing || existing.proje_id !== safeProjeId) {
      throw ApiError.notFound('Yönetim carisi bulunamadı')
    }

    const { error } = await supabaseAdmin.from('yonetim_ekibi').delete().eq('id', id)
    if (error) throw error
    return { id, deleted: true }
  },

  async createPayment(input: YonetimPaymentInput) {
    const safeProjeId = requireProjeId(input.proje_id)

    const { data, error } = await supabaseAdmin.rpc('fn_create_yonetim_payment_atomic', {
      p_payment_data: {
        proje_id: safeProjeId,
        yonetim_id: input.yonetim_id,
        islem_turu: input.islem_turu,
        odeme_turu: input.odeme_turu,
        banka_hesap_id: input.banka_hesap_id ?? null,
        tutar: input.tutar,
        tarih: input.tarih,
        aciklama: input.aciklama ?? null,
      },
    })

    if (error) throw error
    return data
  },
}
