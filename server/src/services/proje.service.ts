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
      .order('created_at', { foreignTable: 'bloklar', ascending: true })
      .single()

    if (error) throw ApiError.notFound('Proje bulunamadı')

    // İş kalemlerini ağaç yapısına dönüştür
    if (data.proje_is_kalemleri) {
      data.is_kalemleri_agac = buildTree(data.proje_is_kalemleri)
    }

    return data
  },

  async create(body: Record<string, any>) {
    const { bloklar, proje_id: _, ...projeData } = body
    
    // Aynı isimde birden fazla blok gönderilmiş mi kontrol et
    if (bloklar && bloklar.length > 0) {
      const names = bloklar.map((b: any) => b.blok_adi)
      if (new Set(names).size !== names.length) {
        throw ApiError.badRequest('Aynı isimde birden fazla blok ekleyemezsiniz.')
      }
    }

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
      
      if (blokError) {
        if (blokError.code === '23505') throw ApiError.badRequest('Bu blok adı zaten mevcut.')
        throw blokError
      }
    }

    return proje
  },

  async update(id: string, body: Record<string, any>) {
    const { bloklar, id: _, created_at, is_kalemleri_agac, proje_id: __, ...projeData } = body

    // Aynı isimde birden fazla blok gönderilmiş mi kontrol et
    if (bloklar && bloklar.length > 0) {
      const names = bloklar.map((b: any) => b.blok_adi)
      if (new Set(names).size !== names.length) {
        throw ApiError.badRequest('Aynı isimde birden fazla blok ekleyemezsiniz.')
      }
    }

    const { data: proje, error: projeError } = await supabaseAdmin
      .from('projeler')
      .update(projeData)
      .eq('id', id)
      .select()
      .single()

    if (projeError) throw projeError
    if (!proje) throw ApiError.notFound('Proje bulunamadı')

    if (bloklar) {
      // 1. Mevcut blokları al
      const { data: existingBloklar, error: fetchError } = await supabaseAdmin
        .from('bloklar')
        .select('*')
        .eq('proje_id', id)
      
      if (fetchError) throw fetchError

      // 2. Silinecekleri belirle (ID'si olan ama gelen listede olmayanlar)
      const incomingIds = bloklar.filter((b: any) => b.id).map((b: any) => b.id)
      const toDelete = existingBloklar?.filter(eb => eb.id && !incomingIds.includes(eb.id)) || []

      for (const blokToDelete of toDelete) {
        // Bağımlılık kontrolleri
        const { count: uyeCount } = await supabaseAdmin.from('uyeler').select('id', { count: 'exact', head: true }).eq('blok_id', blokToDelete.id)
        if ((uyeCount || 0) > 0) throw ApiError.badRequest(`'${blokToDelete.blok_adi}' bloğunda kayıtlı üyeler olduğu için silinemez.`)

        const { count: serefiyeCount } = await supabaseAdmin.from('serefiye_tablosu').select('id', { count: 'exact', head: true }).eq('blok_id', blokToDelete.id)
        if ((serefiyeCount || 0) > 0) throw ApiError.badRequest(`'${blokToDelete.blok_adi}' bloğu için şerefiye tablosu mevcut.`)

        await supabaseAdmin.from('bloklar').delete().eq('id', blokToDelete.id)
      }

      // 3. Upsert (Güncelle veya Ekle)
      for (const blok of bloklar) {
        const { id: blokId, created_at, updated_at, proje_id: p_id, ...blokData } = blok
        
        try {
          if (blokId) {
            // ID varsa: Direkt güncelle
            const { error: updateError } = await supabaseAdmin
              .from('bloklar')
              .update({ ...blokData, updated_at: new Date().toISOString() })
              .eq('id', blokId)
            
            if (updateError) throw updateError
          } else {
            // ID yoksa: İsim üzerinden kontrol et (Mükerrerlik ve Otomatik Eşleşme)
            const existingMatch = existingBloklar?.find(eb => eb.blok_adi === blokData.blok_adi)
            
            if (existingMatch) {
              // İsim eşleştiyse güncelle (ID kazandırarak)
              const { error: updateError } = await supabaseAdmin
                .from('bloklar')
                .update({ ...blokData, updated_at: new Date().toISOString() })
                .eq('id', existingMatch.id)
              
              if (updateError) throw updateError
            } else {
              // Tamamen yeni
              const { error: insertError } = await supabaseAdmin
                .from('bloklar')
                .insert([{ ...blokData, proje_id: id }])
              
              if (insertError) throw insertError
            }
          }
        } catch (err: any) {
          if (err.code === '23505') throw ApiError.badRequest(`'${blokData.blok_adi}' isminde bir blok zaten mevcut.`)
          throw err
        }
      }
    }

    return proje
  },

  // İş kalemleri
  async createIsKalemi(projeId: string, body: Record<string, any>) {
    try {
      console.log('Incoming createIsKalemi request:', { projeId, body })
      const { data, error } = await supabaseAdmin
        .from('proje_is_kalemleri')
        .insert([{ ...body, proje_id: projeId }])
        .select()
        .single()

      if (error) {
        console.error('createIsKalemi error:', error)
        throw error
      }

      // Eğer yeni bir ANA kalem eklendiyse ve bu proje için yıllık plan(lar) varsa, 12 aylık boş kayıtlarını oluştur
      if (!data.ust_kalem_id) {
        const { data: plans } = await supabaseAdmin
          .from('yillik_harcama_planlari')
          .select('id')
          .eq('proje_id', projeId)

        if (plans && plans.length > 0) {
          const planKalemleri: any[] = []
          plans.forEach(plan => {
            for (let ay = 1; ay <= 12; ay++) {
              planKalemleri.push({
                plan_id: plan.id,
                proje_is_kalemi_id: data.id,
                ay,
                planlanan_tutar: 0,
                gerceklesen_tutar: 0
              })
            }
          })
          const { error: planError } = await supabaseAdmin.from('yillik_plan_kalemleri').insert(planKalemleri)
          if (planError) {
            console.error('yillik_plan_kalemleri insert error:', planError)
            // Ana kalem oluştu ama plan kalemleri oluşamadıysa bunu da loglayıp devam edebiliriz veya hata verebiliriz
            // Şimdilik hata verelim ki tam oluşsun
            throw planError
          }
        }
      }

      return data
    } catch (err) {
      console.error('createIsKalemi service error:', err)
      throw err
    }
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
    
    // Eğer toplam_butce 0 ise, kalemlerin toplamından veya proje genel bütçesinden fallback yapabiliriz
    if (!plan.toplam_butce || plan.toplam_butce === 0) {
      const { data: proje } = await supabaseAdmin.from('projeler').select('toplam_butce').eq('id', projeId).single()
      plan.toplam_butce = proje?.toplam_butce || 0
    }

    return plan
  },

  async createYillikPlan(projeId: string, body: Record<string, any>) {
    // 1. Proje iş kalemleri (Harcama kalemleri) var mı kontrol et
    const { data: isKalemleri } = await supabaseAdmin
      .from('proje_is_kalemleri')
      .select('id')
      .eq('proje_id', projeId)
      .is('ust_kalem_id', null) // Sadece ana kalemler (plan bunlara göre yapılır)

    if (!isKalemleri || isKalemleri.length === 0) {
      throw ApiError.badRequest('Bu projeye ait Harcama Kalemi bulunamadı. Önce Harcama Kalemi eklemelisiniz.')
    }

    // 2. Plan oluştur
    const { data: plan, error } = await supabaseAdmin
      .from('yillik_harcama_planlari')
      .insert([{ proje_id: projeId, ...body }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('Bu yıl için plan zaten var')
      throw error
    }

    // 3. Plan kalemlerini oluştur (12 ay)
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

    return plan
  },

  async updatePlanKalemi(id: string, body: Record<string, any>) {
    // Güvenli güncelleme için metadata alanlarını temizle
    const { id: _, created_at, updated_at, plan_id, proje_is_kalemi_id, ay, ...updateData } = body

    const { data, error } = await supabaseAdmin
      .from('yillik_plan_kalemleri')
      .update(updateData)
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
      .order('blok_adi', { foreignTable: 'bloklar', ascending: true })
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
      .select('id, daire_no, serefiye_orani')
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
      .order('daire_sira_no', { ascending: true })

    if (error) throw error

    // Blok adı ve Daire Sıra No'ya göre sırala
    return (data || []).sort((a, b) => {
      const blokA = a.bloklar?.blok_adi || ''
      const blokB = b.bloklar?.blok_adi || ''
      if (blokA !== blokB) return blokA.localeCompare(blokB)
      // Sayısal sıralama sağla (daire_sira_no integer olmalı)
      return (Number(a.daire_sira_no) || 0) - (Number(b.daire_sira_no) || 0)
    })
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

  async syncSerefiye(projeId: string) {
    // 1. Proje bloklarını al
    const { data: bloklar, error: blokError } = await supabaseAdmin
      .from('bloklar')
      .select('*')
      .eq('proje_id', projeId)

    if (blokError) throw blokError

    // 2. Mevcut şerefiye kayıtlarını al (sadece blok_id ve daire_sira_no yeterli)
    const { data: existingSerefiye, error: serefiyeError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('blok_id, daire_sira_no')
      .eq('proje_id', projeId)

    if (serefiyeError) throw serefiyeError

    const existingMap = new Set(
      (existingSerefiye || []).map(s => `${s.blok_id}-${s.daire_sira_no}`)
    )

    const newRows: any[] = []
    for (const blok of bloklar) {
      for (let i = 0; i < (blok.toplam_daire || 0); i++) {
        const daireSiraNo = (blok.daire_baslangic_no || 1) + i
        const key = `${blok.id}-${daireSiraNo}`
        
        if (!existingMap.has(key)) {
          newRows.push({
            proje_id: projeId,
            blok_id: blok.id,
            daire_sira_no: daireSiraNo,
            daire_no: `${blok.blok_adi}.${daireSiraNo}`,
            serefiye_orani: 1.000,
            durum: 'bos'
          })
        }
      }
    }

    if (newRows.length > 0) {
      const { error } = await supabaseAdmin.from('serefiye_tablosu').insert(newRows)
      if (error) throw error
    }

    return { added: newRows.length }
  },

  async resetSerefiye(projeId: string) {
    const { data, error } = await supabaseAdmin.rpc('reset_serefiye_table', {
      p_proje_id: projeId
    })

    if (error) {
      if (error.message.includes('dolu daireler')) {
        throw ApiError.badRequest(error.message)
      }
      throw error
    }

    return { generated: data }
  },

  async clearSerefiye(projeId: string) {
    // 1. Doluluk kontrolü
    const { count: doluCount, error: checkError } = await supabaseAdmin
      .from('serefiye_tablosu')
      .select('id', { count: 'exact', head: true })
      .eq('proje_id', projeId)
      .eq('durum', 'dolu')

    if (checkError) throw checkError
    if ((doluCount || 0) > 0) {
      throw ApiError.badRequest('Bu projede kayıtlı üyeler (dolu daireler) bulunduğu için tablo silinemez.')
    }

    // 2. Sil
    const { error } = await supabaseAdmin
      .from('serefiye_tablosu')
      .delete()
      .eq('proje_id', projeId)

    if (error) throw error
    return { success: true }
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
