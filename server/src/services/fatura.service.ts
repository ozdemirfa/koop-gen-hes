import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'
import { parsePagination, toSupabaseRange, paginationMeta } from '../utils/pagination'

export const faturaService = {
  async list(query: Record<string, any>) {
    const pagination = parsePagination(query)
    const { from, to } = toSupabaseRange(pagination)

    let q = supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan), fatura_kalemleri(*)', { count: 'exact' })

    if (query.firma_id) q = q.eq('firma_id', query.firma_id)
    if (query.proje_id) q = q.eq('proje_id', query.proje_id)
    if (query.fatura_tipi) q = q.eq('fatura_tipi', query.fatura_tipi)
    if (query.durum) q = q.eq('durum', query.durum)
    if (query.baslangic_tarihi) q = q.gte('fatura_tarihi', query.baslangic_tarihi)
    if (query.bitis_tarihi) q = q.lte('fatura_tarihi', query.bitis_tarihi)

    const { data, error, count } = await q
      .order('fatura_tarihi', { ascending: false })
      .range(from, to)

    if (error) throw error
    return { data, pagination: paginationMeta(pagination, count || 0) }
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('faturalar')
      .select('*, firmalar(unvan), fatura_kalemleri(*), odeme_planlari(*)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Fatura bulunamadı')
    return data
  },

  async create(body: Record<string, any>) {
    const { kalemler, ...masterData } = body

    const { data: fatura, error: faturaError } = await supabaseAdmin
      .from('faturalar')
      .insert([masterData])
      .select()
      .single()

    if (faturaError) throw faturaError

    if (kalemler && kalemler.length > 0) {
      const kalemlerWithId = kalemler.map((k: any) => ({ ...k, fatura_id: fatura.id }))
      const { error: kalemError } = await supabaseAdmin
        .from('fatura_kalemleri')
        .insert(kalemlerWithId)
      
      if (kalemError) throw kalemError
    }

    // Cari harekete yansıtma: Gelen fatura borç, Giden fatura alacak?
    // Gelen fatura firmadan aldığımız bir borç (biz borçlanıyoruz, firmanın alacağı artıyor).
    // Cari hareket tipi: 'alacak' (firmanın bizden alacağı artıyor)
    if (masterData.fatura_tipi === 'gelen') {
      await supabaseAdmin.from('cari_hareketler').insert([{
        firma_id: masterData.firma_id,
        proje_id: masterData.proje_id,
        hareket_tipi: 'alacak',
        tutar: masterData.toplam_tutar,
        tarih: masterData.fatura_tarihi,
        aciklama: `Fatura: ${masterData.fatura_no}`,
        belge_no: masterData.fatura_no,
        fatura_id: fatura.id
      }])
    }

    return this.getById(fatura.id)
  },

  async update(id: string, body: Record<string, any>) {
    const { kalemler, ...masterData } = body

    const { data: fatura, error: faturaError } = await supabaseAdmin
      .from('faturalar')
      .update(masterData)
      .eq('id', id)
      .select()
      .single()

    if (faturaError) throw faturaError
    if (!fatura) throw ApiError.notFound('Fatura bulunamadı')

    if (kalemler) {
      await supabaseAdmin.from('fatura_kalemleri').delete().eq('fatura_id', id)
      const kalemlerWithId = kalemler.map((k: any) => ({ 
        kalem_adi: k.kalem_adi,
        birim: k.birim,
        miktar: k.miktar,
        birim_fiyat: k.birim_fiyat,
        kdv_orani: k.kdv_orani,
        fatura_id: id 
      }))
      await supabaseAdmin.from('fatura_kalemleri').insert(kalemlerWithId)
    }

    return this.getById(id)
  },

  async delete(id: string) {
    const { error } = await supabaseAdmin.from('faturalar').delete().eq('id', id)
    if (error) throw error
  },

  async createOdemePlani(faturaId: string, taksitler: Array<Record<string, any>>) {
    await supabaseAdmin.from('odeme_planlari').delete().eq('fatura_id', faturaId)
    const rows = taksitler.map(t => ({ fatura_id: faturaId, ...t }))
    const { data, error } = await supabaseAdmin
      .from('odeme_planlari')
      .insert(rows)
      .select()
    if (error) throw error
    return data
  }
}
