import { supabaseAdmin } from '../config/supabase'
import { ApiError } from '../utils/ApiError'

export const projeService = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .select('*, proje_is_kalemleri(*)')
      .eq('id', id)
      .single()

    if (error) throw ApiError.notFound('Proje bulunamadı')

    // İş kalemlerini ağaç yapısına dönüştür
    if (data.proje_is_kalemleri) {
      data.is_kalemleri_agac = buildTree(data.proje_is_kalemleri)
    }

    return data
  },

  async create(body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .insert([body])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Proje bulunamadı')
    return data
  },

  // İş kalemleri
  async addIsKalemi(projeId: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .insert([{ proje_id: projeId, ...body }])
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateIsKalemi(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('İş kalemi bulunamadı')
    return data
  },

  async deleteIsKalemi(id: string) {
    const { error } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Alt kalemleri olan bir kalem silinemez')
      throw error
    }
  },

  // Yıllık harcama planı
  async getYillikPlan(projeId: string, yil: number) {
    const { data: plan, error } = await supabaseAdmin
      .from('yillik_harcama_planlari')
      .select('*, yillik_plan_kalemleri(*, proje_is_kalemleri(kalem_kodu, tanim))')
      .eq('proje_id', projeId)
      .eq('yil', yil)
      .single()

    if (error) throw ApiError.notFound('Yıllık plan bulunamadı')
    return plan
  },

  async createYillikPlan(projeId: string, body: Record<string, any>) {
    // Plan oluştur
    const { data: plan, error } = await supabaseAdmin
      .from('yillik_harcama_planlari')
      .insert([{ proje_id: projeId, ...body }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('Bu yıl için plan zaten var')
      throw error
    }

    // Proje iş kalemlerinden plan kalemleri oluştur (12 ay)
    const { data: isKalemleri } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .select('id')
      .eq('proje_id', projeId)
      .is('ust_kalem_id', null) // Sadece ana kalemler

    if (isKalemleri && isKalemleri.length > 0) {
      const planKalemleri: Record<string, any>[] = []
      for (const kalem of isKalemleri) {
        for (let ay = 1; ay <= 12; ay++) {
          planKalemleri.push({
            plan_id: plan.id,
            proje_is_kalemi_id: kalem.id,
            ay
          })
        }
      }
      await supabaseAdmin.from('yillik_plan_kalemleri').insert(planKalemleri)
    }

    return plan
  },

  async updatePlanKalemi(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('yillik_plan_kalemleri')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) throw ApiError.notFound('Plan kalemi bulunamadı')
    return data
  }
}

function buildTree(items: any[]): any[] {
  const map: Record<string, any> = {}
  const roots: any[] = []

  items.forEach(item => {
    map[item.id] = { ...item, children: [] }
  })

  items.forEach(item => {
    if (item.ust_kalem_id && map[item.ust_kalem_id]) {
      map[item.ust_kalem_id].children.push(map[item.id])
    } else {
      roots.push(map[item.id])
    }
  })

  return roots.sort((a, b) => (a.sira_no || 0) - (b.sira_no || 0))
}
