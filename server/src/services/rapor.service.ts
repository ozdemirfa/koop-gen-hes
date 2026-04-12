import { supabaseAdmin } from '../config/supabase'

export const raporService = {
  async dashboardOzet() {
    try {
      const [uyeRes, aidatRes, gelirRes, giderRes] = await Promise.all([
        supabaseAdmin.from('uyeler').select('id', { count: 'exact' }).eq('durum', 'aktif'),
        supabaseAdmin.from('aidatlar').select('durum, tutar, gecikme_faizi, odenen_tutar'),
        supabaseAdmin.from('gelir_giderler').select('tutar').eq('tip', 'gelir'),
        supabaseAdmin.from('gelir_giderler').select('tutar').eq('tip', 'gider')
      ])

      // Check for errors in individual responses
      if (uyeRes.error) console.error('Error fetching uyeler:', uyeRes.error)
      if (aidatRes.error) console.error('Error fetching aidatlar:', aidatRes.error)
      if (gelirRes.error) console.error('Error fetching gelirler:', gelirRes.error)
      if (giderRes.error) console.error('Error fetching giderler:', giderRes.error)

      const aidatOzet = { tahsilat: 0, bekleyen: 0, geciken: 0 }
      aidatRes.data?.forEach(a => {
        aidatOzet.tahsilat += Number(a.odenen_tutar || 0)
        if (a.durum === 'bekliyor') aidatOzet.bekleyen += Number(a.tutar || 0)
        if (a.durum === 'gecikti') aidatOzet.geciken += Number(a.tutar || 0) + Number(a.gecikme_faizi || 0)
      })

      const toplamGelir = (gelirRes.data || []).reduce((s, r) => s + Number(r.tutar || 0), 0)
      const toplamGider = (giderRes.data || []).reduce((s, r) => s + Number(r.tutar || 0), 0)

      return {
        aktif_uye_sayisi: uyeRes.count || 0,
        aidat_tahsilat: aidatOzet.tahsilat,
        aidat_bekleyen: aidatOzet.bekleyen,
        aidat_geciken: aidatOzet.geciken,
        toplam_gelir: toplamGelir + aidatOzet.tahsilat,
        toplam_gider: toplamGider,
        net_bakiye: toplamGelir + aidatOzet.tahsilat - toplamGider
      }
    } catch (err) {
      console.error('Fatal error in dashboardOzet:', err)
      throw err
    }
  },

  async aylikGelirGider(yil?: number) {
    const targetYil = yil || new Date().getFullYear()

    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .select('tip, tutar, tarih')
      .gte('tarih', `${targetYil}-01-01`)
      .lte('tarih', `${targetYil}-12-31`)

    if (error) throw error

    // Aylık toplama
    const aylik: Record<number, { gelir: number; gider: number }> = {}
    for (let ay = 1; ay <= 12; ay++) {
      aylik[ay] = { gelir: 0, gider: 0 }
    }

    data?.forEach(item => {
      const ay = new Date(item.tarih).getMonth() + 1
      if (item.tip === 'gelir') aylik[ay].gelir += Number(item.tutar)
      else aylik[ay].gider += Number(item.tutar)
    })

    return Object.entries(aylik).map(([ay, values]) => ({
      ay: parseInt(ay),
      ...values
    }))
  },

  async aidatDurumu() {
    const { data, error } = await supabaseAdmin
      .from('aidatlar')
      .select('durum')

    if (error) throw error

    const durum: Record<string, number> = { bekliyor: 0, odendi: 0, gecikti: 0, iptal: 0 }
    data?.forEach(a => { durum[a.durum] = (durum[a.durum] || 0) + 1 })

    return durum
  },

  async aylikRapor(yil: number, ay: number) {
    const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`
    const sonGun = new Date(yil, ay, 0).getDate()
    const bitis = `${yil}-${String(ay).padStart(2, '0')}-${sonGun}`

    const [gelirGiderRes, aidatRes] = await Promise.all([
      supabaseAdmin.from('gelir_giderler')
        .select('*, gelir_gider_kategorileri(ad)')
        .gte('tarih', baslangic)
        .lte('tarih', bitis)
        .order('tarih'),
      supabaseAdmin.from('aidat_odemeleri')
        .select('tutar, odeme_tarihi, odeme_yontemi')
        .gte('odeme_tarihi', baslangic)
        .lte('odeme_tarihi', bitis)
    ])

    const gelirler = gelirGiderRes.data?.filter(r => r.tip === 'gelir') || []
    const giderler = gelirGiderRes.data?.filter(r => r.tip === 'gider') || []
    const aidatTahsilat = aidatRes.data || []

    return {
      donem: { yil, ay },
      gelirler,
      giderler,
      aidat_tahsilat: aidatTahsilat,
      toplam_gelir: gelirler.reduce((s, r) => s + Number(r.tutar), 0),
      toplam_gider: giderler.reduce((s, r) => s + Number(r.tutar), 0),
      toplam_aidat_tahsilat: aidatTahsilat.reduce((s, r) => s + Number(r.tutar), 0)
    }
  },

  async yillikRapor(yil: number) {
    const aylikVeriler = []
    for (let ay = 1; ay <= 12; ay++) {
      const rapor = await this.aylikRapor(yil, ay)
      aylikVeriler.push({
        ay,
        gelir: rapor.toplam_gelir,
        gider: rapor.toplam_gider,
        aidat: rapor.toplam_aidat_tahsilat
      })
    }

    return {
      yil,
      aylik: aylikVeriler,
      toplam_gelir: aylikVeriler.reduce((s, a) => s + a.gelir, 0),
      toplam_gider: aylikVeriler.reduce((s, a) => s + a.gider, 0),
      toplam_aidat: aylikVeriler.reduce((s, a) => s + a.aidat, 0)
    }
  },

  async uyeBorcListesi() {
    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .select('id, uye_no, ad, soyad, aidatlar(tutar, gecikme_faizi, odenen_tutar, durum)')
      .eq('durum', 'aktif')
      .order('soyad')

    if (error) throw error

    return data?.map(uye => {
      const aidatlar = (uye as any).aidatlar || []
      const toplamBorc = aidatlar.reduce((s: number, a: any) => {
        if (a.durum === 'odendi' || a.durum === 'iptal') return s
        return s + Number(a.tutar) + Number(a.gecikme_faizi || 0) - Number(a.odenen_tutar || 0)
      }, 0)

      return {
        uye_no: uye.uye_no,
        ad: uye.ad,
        soyad: uye.soyad,
        toplam_borc: toplamBorc,
        odenmemis_aidat_sayisi: aidatlar.filter((a: any) => a.durum !== 'odendi' && a.durum !== 'iptal').length
      }
    }).filter(u => u.toplam_borc > 0)
  },

  async hakedisOzet() {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('durum, toplam_tutar, net_tutar, sozlesmeler(sozlesme_no, firmalar(unvan))')
      .order('created_at', { ascending: false })

    if (error) throw error

    const ozet = {
      toplam_hakedis: data?.length || 0,
      taslak: 0,
      onaylanan: 0,
      odenen: 0,
      toplam_tutar: 0,
      toplam_net: 0
    }

    data?.forEach(h => {
      ozet.toplam_tutar += Number(h.toplam_tutar || 0)
      ozet.toplam_net += Number(h.net_tutar || 0)
      if (h.durum === 'taslak') ozet.taslak++
      if (h.durum === 'onaylandi') ozet.onaylanan++
      if (h.durum === 'odendi') ozet.odenen++
    })

    return { ozet, hakedisler: data }
  }
}
