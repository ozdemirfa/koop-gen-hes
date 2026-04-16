import { supabaseAdmin } from '../config/supabase'

export const raporService = {
  async dashboardOzet(projeId: string) {
    try {
      const [uyeRes, aidatRes, gelirRes, giderRes] = await Promise.all([
        supabaseAdmin.from('uyeler').select('id', { count: 'exact' }).eq('proje_id', projeId).eq('durum', 'aktif'),
        supabaseAdmin.from('aidatlar').select('durum, tutar, gecikme_faizi, odenen_tutar').eq('proje_id', projeId),
        supabaseAdmin.from('gelir_giderler').select('tutar').eq('proje_id', projeId).eq('tip', 'gelir'),
        supabaseAdmin.from('gelir_giderler').select('tutar').eq('proje_id', projeId).eq('tip', 'gider')
      ])

      // Check for errors in individual responses
      if (uyeRes.error) console.error('Error fetching uyeler:', uyeRes.error)
      if (aidatRes.error) console.error('Error fetching aidatlar:', aidatRes.error)
      if (gelirRes.error) console.error('Error fetching gelirler:', gelirRes.error)
      if (giderRes.error) console.error('Error fetching giderler:', giderRes.error)

      const aidatOzet = { tahsilat: 0, bekleyen: 0, geciken: 0 }
      const aidatData = aidatRes.data || []
      aidatData.forEach(a => {
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
        net_bakiye: (toplamGelir + aidatOzet.tahsilat) - toplamGider
      }
    } catch (err) {
      console.error('Fatal error in dashboardOzet:', err)
      throw err
    }
  },

  async aylikGelirGider(projeId: string, yil?: number) {
    const targetYil = yil || new Date().getFullYear()

    const { data, error } = await supabaseAdmin
      .from('gelir_giderler')
      .select('tip, tutar, tarih')
      .eq('proje_id', projeId)
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

  async aidatDurumu(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('aidatlar')
      .select('durum')
      .eq('proje_id', projeId)

    if (error) throw error

    const durum: Record<string, number> = { bekliyor: 0, odendi: 0, gecikti: 0, iptal: 0 }
    data?.forEach(a => { durum[a.durum] = (durum[a.durum] || 0) + 1 })

    return durum
  },

  async aylikRapor(yil: number, ay: number, projeId: string) {
    const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`
    const sonGun = new Date(yil, ay, 0).getDate()
    const bitis = `${yil}-${String(ay).padStart(2, '0')}-${sonGun}`

    // T+1 ve T+2 için tarihler
    const t1Start = new Date(yil, ay, 1)
    const t1End = new Date(yil, ay + 1, 0)
    const t2Start = new Date(yil, ay + 1, 1)
    const t2End = new Date(yil, ay + 2, 0)

    const [gelirGiderRes, aidatRes, hakedisRes, yaklasanRes] = await Promise.all([
      supabaseAdmin.from('gelir_giderler')
        .select('*, gelir_gider_kategorileri(ad)')
        .eq('proje_id', projeId)
        .gte('tarih', baslangic)
        .lte('tarih', bitis)
        .order('tarih'),
      supabaseAdmin.from('aidat_odemeleri')
        .select('tutar, odeme_tarihi, odeme_yontemi, aidatlar!inner(proje_id)')
        .eq('aidatlar.proje_id', projeId)
        .gte('odeme_tarihi', baslangic)
        .lte('odeme_tarihi', bitis),
      supabaseAdmin.from('hakedisler')
        .select('*, sozlesmeler(sozlesme_no, firmalar(unvan))')
        .eq('proje_id', projeId)
        .in('durum', ['onaylandi', 'odendi'])
        .gte('onay_tarihi', baslangic)
        .lte('onay_tarihi', bitis),
      supabaseAdmin.from('odeme_planlari')
        .select('*, faturalar!inner(proje_id, fatura_no, firma_id, firmalar(unvan))')
        .eq('faturalar.proje_id', projeId)
        .eq('odendi', false)
        .gte('vade_tarihi', baslangic)
        .lte('vade_tarihi', `${t2End.getFullYear()}-${String(t2End.getMonth() + 1).padStart(2, '0')}-${t2End.getDate()}`)
    ])

    const gelirler = gelirGiderRes.data?.filter(r => r.tip === 'gelir') || []
    const digerGiderler = gelirGiderRes.data?.filter(r => r.tip === 'gider') || []
    const hakedisGiderleri = (hakedisRes.data || []).map(h => ({
      id: h.id,
      tarih: h.onay_tarihi,
      tutar: h.net_tutar,
      aciklama: `Hakediş #${h.hakedis_no} - ${h.sozlesmeler?.firmalar?.unvan || ''}`,
      kategori: 'Hakediş'
    }))

    const giderler = [...digerGiderler, ...hakedisGiderleri]
    const aidatTahsilat = aidatRes.data || []

    // Yaklaşan ödemeleri T, T+1, T+2 olarak grupla
    const yaklasanOdemeler = {
      t: 0,
      t1: 0,
      t2: 0,
      detay: yaklasanRes.data || []
    }

    yaklasanRes.data?.forEach(o => {
      const vade = new Date(o.vade_tarihi)
      if (vade >= new Date(baslangic) && vade <= new Date(bitis)) yaklasanOdemeler.t += Number(o.tutar)
      else if (vade >= t1Start && vade <= t1End) yaklasanOdemeler.t1 += Number(o.tutar)
      else if (vade >= t2Start && vade <= t2End) yaklasanOdemeler.t2 += Number(o.tutar)
    })

    return {
      donem: { yil, ay },
      gelirler,
      giderler,
      aidat_tahsilat: aidatTahsilat,
      yaklasan_odemeler: yaklasanOdemeler,
      toplam_gelir: gelirler.reduce((s, r) => s + Number(r.tutar), 0),
      toplam_gider: giderler.reduce((s, r) => s + Number(r.tutar), 0),
      toplam_aidat_tahsilat: aidatTahsilat.reduce((s, r) => s + Number(r.tutar), 0)
    }
  },

  async yillikRapor(yil: number, projeId: string) {
    const aylikVeriler = []
    for (let ay = 1; ay <= 12; ay++) {
      const rapor = await this.aylikRapor(yil, ay, projeId)
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

  async uyeBorcListesi(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('uyeler')
      .select('id, uye_no, ad, soyad, aidatlar(tutar, gecikme_faizi, odenen_tutar, durum)')
      .eq('proje_id', projeId)
      .eq('durum', 'aktif')
      .order('soyad')

    if (error) throw error

    return data?.map(uye => {
      const aidatlar = (uye as any).aidatlar || []
      let gecikenAidatTutari = 0
      let gecikmeFaiziTutari = 0
      let odenenTutar = 0

      aidatlar.forEach((a: any) => {
        if (a.durum === 'bekliyor' || a.durum === 'gecikti') {
          gecikenAidatTutari += Number(a.tutar)
          gecikmeFaiziTutari += Number(a.gecikme_faizi || 0)
          odenenTutar += Number(a.odenen_tutar || 0)
        }
      })

      const toplamBorc = gecikenAidatTutari + gecikmeFaiziTutari - odenenTutar

      return {
        uye_no: uye.uye_no,
        ad: uye.ad,
        soyad: uye.soyad,
        geciken_aidat_tutari: gecikenAidatTutari,
        gecikme_faizi_tutari: gecikmeFaiziTutari,
        toplam_borc: toplamBorc,
        odenmemis_aidat_sayisi: aidatlar.filter((a: any) => a.durum === 'bekliyor' || a.durum === 'gecikti').length
      }
    }).filter(u => u.toplam_borc > 0)
  },

  async hakedisOzet(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('durum, brut_tutar, net_tutar, sozlesmeler(sozlesme_no, firmalar(unvan))')
      .eq('proje_id', projeId)
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
      ozet.toplam_tutar += Number(h.brut_tutar || 0)
      ozet.toplam_net += Number(h.net_tutar || 0)
      if (h.durum === 'taslak') ozet.taslak++
      if (h.durum === 'onaylandi') ozet.onaylanan++
      if (h.durum === 'odendi') ozet.odenen++
    })

    return { ozet, hakedisler: data }
  }
}
