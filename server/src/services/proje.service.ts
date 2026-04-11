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
      .select('*, proje_is_kalemleri(*), bloklar(*)')
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
    const { bloklar, ...projeData } = body
    
    const { data: proje, error: projeError } = await supabaseAdmin
      .from('projeler')
      .insert([projeData])
      .select()
      .single()

    if (projeError) throw projeError

    if (bloklar && bloklar.length > 0) {
      const bloklarWithProjeId = bloklar.map((b: any) => ({ ...b, proje_id: proje.id }))
      const { error: blokError } = await supabaseAdmin
        .from('bloklar')
        .insert(bloklarWithProjeId)
      
      if (blokError) throw blokError
    }

    return proje
  },

  async update(id: string, body: Record<string, any>) {
    const { bloklar, ...projeData } = body

    const { data: proje, error: projeError } = await supabaseAdmin
      .from('projeler')
      .update(projeData)
      .eq('id', id)
      .select()
      .single()

    if (projeError) throw projeError
    if (!proje) throw ApiError.notFound('Proje bulunamadı')

    if (bloklar) {
      // Basit yaklaşım: Mevcut blokları sil ve yenileri ekle 
      // (Eğer üye atanmışsa silme hatası verecektir, bu durumda sadece yeni eklenenleri veya güncellenenleri işlemek gerekir)
      // Şimdilik sadece yeni eklenenleri ve mevcutları güncellemeyi destekleyelim veya hata verirse kullanıcıyı uyaralım.
      
      for (const blok of bloklar) {
        if (blok.id) {
          await supabaseAdmin.from('bloklar').update(blok).eq('id', blok.id)
        } else {
          await supabaseAdmin.from('bloklar').insert([{ ...blok, proje_id: id }])
        }
      }
    }

    return proje
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
  },

  async getAktifProje() {
    // Durumu 'devam_ediyor' olan veya en son oluşturulan aktif projeyi getir
    const { data, error } = await supabaseAdmin
      .from('projeler')
      .select('*, bloklar(*)')
      .eq('aktif', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getMusaitDaireler(blokId: string) {
    // Blok bilgilerini al
    const { data: blok, error: blokError } = await supabaseAdmin
      .from('bloklar')
      .select('*')
      .eq('id', blokId)
      .single()

    if (blokError) throw blokError

    // Bu bloktaki boş daireleri şerefiye tablosundan al
    const { data: daireler, error: daireError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('id, daire_no')
      .eq('blok_id', blokId)
      .eq('durum', 'bos')

    if (daireError) throw daireError
    return daireler
  },

  // Şerefiye Yönetimi
  async getSerefiye(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('*, bloklar(blok_adi)')
      .eq('proje_id', projeId)
      .order('daire_no')

    if (error) throw error
    return data
  },

  async generateSerefiye(projeId: string) {
    // Tekrar üretime karşı koruma — mevcut kayıt varsa conflict dön
    const { count: existingCount, error: countError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('id', { count: 'exact', head: true })
      .eq('proje_id', projeId)

    if (countError) throw countError
    if ((existingCount || 0) > 0) {
      throw ApiError.badRequest('Bu proje için şerefiye tablosu zaten oluşturulmuş. Önce mevcut kayıtları temizleyin.')
    }

    // Proje bloklarını al
    const { data: bloklar, error: blokError } = await supabaseAdmin
      .from('bloklar')
      .select('*')
      .eq('proje_id', projeId)

    if (blokError) throw blokError

    const rows: any[] = []
    for (const blok of bloklar) {
      for (let i = 0; i < blok.toplam_daire; i++) {
        const daireSiraNo = (blok.daire_baslangic_no || 1) + i
        rows.push({
          proje_id: projeId,
          blok_id: blok.id,
          daire_sira_no: daireSiraNo,
          daire_no: `${blok.blok_adi}.${daireSiraNo}`,
          serefiye_orani: 1.000,
          durum: 'bos'
        })
      }
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('serefiye_tablosu').insert(rows)
      if (error) throw error
    }

    return { generated: rows.length }
  },

  async updateSerefiye(id: string, body: Record<string, any>) {
    const { data, error } = await supabaseAdmin
      .from('serefiye_tablosu')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
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
