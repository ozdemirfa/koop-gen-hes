import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const cariHesapService = {
  async list(query: Record<string, any>) {
    let q = supabaseAdmin
      .from('cari_hareketler')
      .select('*, firmalar(unvan)')

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.baslangic_tarihi) q = q.gte('tarih', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('tarih', query.bitis_tarihi)

    // Eşleşmemiş cari hareketleri: banka_hareketleri.eslesen_cari_hareket_id ile referanslanmayanlar
    if (query.eslesmemis === 'true' || query.eslesmemis === true) {
      const { data: eslesenler, error: eslesError } = await supabaseAdmin
        .from('banka_hareketleri')
        .select('eslesen_cari_hareket_id')
        .not('eslesen_cari_hareket_id', 'is', null)

      if (eslesError) throw eslesError

      const eslesenIds = (eslesenler || [])
        .map(r => r.eslesen_cari_hareket_id)
        .filter(Boolean) as string[]

      if (eslesenIds.length > 0) {
        q = q.not('id', 'in', `(${eslesenIds.join(',')})`)
      }
    }

    const { data, error } = await q.order('tarih', { ascending: true })
    if (error) throw error
    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  }
}
