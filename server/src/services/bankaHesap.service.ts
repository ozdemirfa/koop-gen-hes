import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const bankaHesapService = {
  async listHesaplar(query: Record<string, any> = {}) {
    let q = supabaseAdmin
      .from('banka_hesaplari')
      .select('*')

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)

    const { data, error } = await q.order('banka_adi')

    if (error) throw error
    return data
  },

  async createHesap(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('banka_hesaplari')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateHesap(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('banka_hesaplari')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Banka hesabı bulunamadı')
    return data
  },

  async listHareketler(query: Record<string, any>) {
    let q = supabaseAdmin
      .from('banka_hareketleri')
      .select('*, banka_hesaplari(banka_adi), cari_hareketler(firma_id, firmalar(unvan))')

    if (query.proje_id) q = q.eq('proje_id', query.proje_id)
    if (query.banka_hesap_id) q = q.eq('banka_hesap_id', query.banka_hesap_id)
    if (query.eslesti !== undefined) q = q.eq('eslesti', query.eslesti === 'true')

    const { data, error } = await q.order('tarih', { ascending: false })
    if (error) throw error
    return data
  },

  async createHareket(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('banka_hareketleri')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async esle(id: string, cariHareketId: string) {
    const { data, error } = await supabaseAdmin
      .from('banka_hareketleri')
      .update({ eslesen_cari_hareket_id: cariHareketId, eslesti: true })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Banka hareketi bulunamadı')
    return data
  }
}
