import { supabaseAdmin } from '../config/supabase'

export const raporService = {
  async dashboardOzet(projeId: string) {
    try {
      const { data: proje } = await supabaseAdmin
        .from('projeler')
        .select('baslangic_tarihi')
        .eq('id', projeId)
        .single();

      const { data: hareketler, error: hError } = await supabaseAdmin
        .from('cari_hareketler')
        .select('islem_turu, borc, alacak, cari_hesap_id, cari_hesaplar(cari_turu)')
        .eq('proje_id', projeId);

      if (hError) throw hError;

      let toplam_gelir = 0;
      let toplam_gider = 0;
      let toplam_tahsilat = 0;
      let toplam_odeme = 0;
      let cari_bakiye = 0;

      const balances: Record<string, { bakiye: number; tur: string }> = {};

      hareketler?.forEach(h => {
        const borc = Number(h.borc || 0);
        const alacak = Number(h.alacak || 0);

        if (h.islem_turu === 'aidat_kayit') toplam_gelir += alacak;
        if (h.islem_turu === 'hakedis') toplam_gider += borc;
        if (h.islem_turu === 'gelen_odeme') toplam_tahsilat += borc;
        if (h.islem_turu === 'giden_odeme') toplam_odeme += alacak;

        cari_bakiye += (alacak - borc);

        const id = h.cari_hesap_id;
        const tur = (h.cari_hesaplar as any)?.cari_turu || 'bilinmiyor';
        
        if (!balances[id]) {
          balances[id] = { bakiye: 0, tur };
        }
        balances[id].bakiye += (alacak - borc);
      });

      let bekleyen_alacak = 0;
      let bekleyen_borc = 0;
      Object.values(balances).forEach(b => {
        if (b.tur === 'uye' && b.bakiye > 0) bekleyen_alacak += b.bakiye;
        if (b.tur === 'firma' && b.bakiye < 0) bekleyen_borc += Math.abs(b.bakiye);
      });

      const { count: uyeSayisi } = await supabaseAdmin
        .from('uyeler')
        .select('*', { count: 'exact', head: true })
        .eq('proje_id', projeId)
        .eq('durum', 'aktif');

      // Toplam Daire Sayısı
      const { data: bloklar } = await supabaseAdmin
        .from('bloklar')
        .select('toplam_daire')
        .eq('proje_id', projeId);
      const toplam_daire_sayisi = bloklar?.reduce((acc, b) => acc + (b.toplam_daire || 0), 0) || 0;

      // Faturalar (Gelen faturalar toplamı)
      const { data: faturalar } = await supabaseAdmin
        .from('faturalar')
        .select('toplam_tutar')
        .eq('proje_id', projeId)
        .eq('fatura_tipi', 'gelen');
      const toplam_fatura = faturalar?.reduce((acc, f) => acc + Number(f.toplam_tutar || 0), 0) || 0;

      // Çekler (Bekleyen çekler toplamı)
      const { data: cekler } = await supabaseAdmin
        .from('cekler')
        .select('tutar')
        .eq('proje_id', projeId)
        .eq('durum', 'bekliyor');
      const cek_toplami = cekler?.reduce((acc, c) => acc + Number(c.tutar || 0), 0) || 0;

      // Birikmiş Teminatlar
      const { data: hakedisler } = await supabaseAdmin
        .from('hakedisler')
        .select('teminat_kesintisi')
        .eq('proje_id', projeId)
        .in('durum', ['onaylandi', 'odendi']);
      const birikmis_teminat = hakedisler?.reduce((acc, h) => acc + Number(h.teminat_kesintisi || 0), 0) || 0;

      // Gecikme Faiz Tahsilatı
      const { data: aidatlar } = await supabaseAdmin
        .from('aidatlar')
        .select('gecikme_faizi')
        .eq('proje_id', projeId)
        .eq('durum', 'odendi');
      const gecikme_faiz_tahsilati = aidatlar?.reduce((acc, a) => acc + Number(a.gecikme_faizi || 0), 0) || 0;

      // Banka Bakiyeleri
      const { data: bankaHareketleri } = await supabaseAdmin
        .from('banka_hareketleri')
        .select('tutar, islem_tipi, banka_hesaplari!inner(proje_id)')
        .eq('banka_hesaplari.proje_id', projeId);
      
      let banka_toplami = 0;
      bankaHareketleri?.forEach(bh => {
        if (bh.islem_tipi === 'gelir') banka_toplami += Number(bh.tutar || 0);
        else banka_toplami -= Number(bh.tutar || 0);
      });

      // Proje Süresi Hesaplama
      let proje_suresi = { ay: 0, gun: 0 };
      if (proje?.baslangic_tarihi) {
        const start = new Date(proje.baslangic_tarihi);
        const now = new Date();
        let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        let days = now.getDate() - start.getDate();
        if (days < 0) {
          months -= 1;
          const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
          days += lastMonth.getDate();
        }
        proje_suresi = { ay: months, gun: days };
      }

      return {
        toplam_gelir,
        toplam_gider,
        toplam_tahsilat,
        toplam_odeme,
        toplam_fatura,
        fatura_farki: toplam_fatura - toplam_gider, // User: faturalar - gider tahakkuk
        kasa_banka: banka_toplami,
        bekleyen_alacak,
        bekleyen_borc,
        aktif_uye_sayisi: uyeSayisi || 0,
        toplam_daire_sayisi,
        cari_bakiye,
        cek_toplami,
        birikmis_teminat,
        gecikme_faiz_tahsilati,
        banka_toplami,
        proje_suresi,
        odeme_sonrasi_nakit: banka_toplami + cari_bakiye - cek_toplami
      };
    } catch (err) {

      console.error('Fatal error in dashboardOzet:', err);
      throw err;
    }
  },

  async aylikGelirGider(projeId: string, yil?: number) {
    const targetYil = yil || new Date().getFullYear();

    const { data, error } = await supabaseAdmin
      .from('cari_hareketler')
      .select('islem_turu, alacak, borc, tarih')
      .eq('proje_id', projeId)
      .in('islem_turu', ['aidat_kayit', 'hakedis'])
      .gte('tarih', `${targetYil}-01-01`)
      .lte('tarih', `${targetYil}-12-31`);

    if (error) throw error;

    const aylik: Record<number, { gelir: number; gider: number }> = {};
    for (let ay = 1; ay <= 12; ay++) {
      aylik[ay] = { gelir: 0, gider: 0 };
    }

    data?.forEach(item => {
      const date = new Date(item.tarih);
      const ay = date.getMonth() + 1;
      if (item.islem_turu === 'aidat_kayit') aylik[ay].gelir += Number(item.alacak || 0);
      if (item.islem_turu === 'hakedis') aylik[ay].gider += Number(item.borc || 0);
    });

    return Object.entries(aylik).map(([ay, values]) => ({
      ay: parseInt(ay),
      ...values
    }));
  },

  async aidatDurumu(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('aidatlar')
      .select('durum')
      .eq('proje_id', projeId);

    if (error) throw error;

    const durum: Record<string, number> = { bekliyor: 0, odendi: 0, gecikti: 0, iptal: 0 };
    data?.forEach(a => { durum[a.durum] = (durum[a.durum] || 0) + 1 });

    return durum;
  },

  async getMizan(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('cari_hesaplar')
      .select(`
        id,
        cari_adi,
        cari_turu,
        uye_id,
        firma_id,
        cari_hareketler (alacak, borc)
      `)
      .eq('proje_id', projeId);

    if (error) throw error;

    return (data || []).map(item => {
      const hareketler = (item.cari_hareketler as any[]) || [];
      let toplamBorc = 0;
      let toplamAlacak = 0;

      hareketler.forEach(h => {
        toplamAlacak += Number(h.alacak || 0);
        toplamBorc += Number(h.borc || 0);
      });

      return {
        id: item.id,
        cari_adi: item.cari_adi,
        cari_turu: item.cari_turu,
        toplam_alacak: toplamAlacak,
        toplam_borc: toplamBorc,
        bakiye: toplamAlacak - toplamBorc
      };
    });
  },

  async uyeBorcListesi(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('cari_hesaplar')
      .select(`
        id,
        cari_adi,
        uye_id,
        uyeler!uye_id (uye_no, ad, soyad),
        cari_hareketler (alacak, borc)
      `)
      .eq('proje_id', projeId)
      .eq('cari_turu', 'uye');

    if (error) throw error;

    return (data || []).map(item => {
      const hareketler = (item.cari_hareketler as any[]) || [];
      let toplamBorc = 0;
      let toplamAlacak = 0;

      hareketler.forEach(h => {
        toplamAlacak += Number(h.alacak || 0);
        toplamBorc += Number(h.borc || 0);
      });

      const bakiye = toplamAlacak - toplamBorc;

      return {
        uye_no: (item.uyeler as any)?.uye_no,
        ad: (item.uyeler as any)?.ad,
        soyad: (item.uyeler as any)?.soyad,
        toplam_borc: bakiye,
        bakiye: bakiye
      };
    }).filter(u => u.bakiye > 0);
  },

  async aylikRapor(yil: number, ay: number, projeId: string) {
    const baslangic = `${yil}-${String(ay).padStart(2, '0')}-01`;
    const sonGun = new Date(yil, ay, 0).getDate();
    const bitis = `${yil}-${String(ay).padStart(2, '0')}-${sonGun}`;

    const { data: hareketler, error } = await supabaseAdmin
      .from('cari_hareketler')
      .select('*, cari_hesaplar(cari_adi)')
      .eq('proje_id', projeId)
      .gte('tarih', baslangic)
      .lte('tarih', bitis)
      .order('tarih');

    if (error) throw error;

    const data = hareketler || [];
    
    // Gelir: aidat_kayit alacak
    const gelirler = data.filter(h => h.islem_turu === 'aidat_kayit');
    // Gider: hakedis borc
    const giderler = data.filter(h => h.islem_turu === 'hakedis');
    // Tahsilat: gelen_odeme borc
    const tahsilatlar = data.filter(h => h.islem_turu === 'gelen_odeme');
    // Odeme: giden_odeme alacak
    const odemeler = data.filter(h => h.islem_turu === 'giden_odeme');

    return {
      donem: { yil, ay },
      gelirler,
      giderler,
      tahsilatlar,
      odemeler,
      toplam_gelir: gelirler.reduce((s, r) => s + Number(r.alacak), 0),
      toplam_gider: giderler.reduce((s, r) => s + Number(r.borc), 0),
      toplam_tahsilat: tahsilatlar.reduce((s, r) => s + Number(r.borc), 0),
      toplam_odeme: odemeler.reduce((s, r) => s + Number(r.alacak), 0)
    };
  },

  async yillikRapor(yil: number, projeId: string) {
    const aylikVeriler = [];
    for (let ay = 1; ay <= 12; ay++) {
      const rapor = await this.aylikRapor(yil, ay, projeId);
      aylikVeriler.push({
        ay,
        gelir: rapor.toplam_gelir,
        gider: rapor.toplam_gider,
        tahsilat: rapor.toplam_tahsilat,
        odeme: rapor.toplam_odeme
      });
    }

    return {
      yil,
      aylik: aylikVeriler,
      toplam_gelir: aylikVeriler.reduce((s, a) => s + a.gelir, 0),
      toplam_gider: aylikVeriler.reduce((s, a) => s + a.gider, 0),
      toplam_tahsilat: aylikVeriler.reduce((s, a) => s + a.tahsilat, 0),
      toplam_odeme: aylikVeriler.reduce((s, a) => s + a.odeme, 0)
    };
  },

  async hakedisOzet(projeId: string) {
    const { data, error } = await supabaseAdmin
      .from('hakedisler')
      .select('durum, ara_toplam, net_tutar, sozlesmeler(sozlesme_no, firmalar(unvan))')
      .eq('proje_id', projeId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const ozet = {
      toplam_hakedis: data?.length || 0,
      taslak: 0,
      onaylanan: 0,
      odenen: 0,
      toplam_tutar: 0,
      toplam_net: 0
    };

    data?.forEach(h => {
      ozet.toplam_tutar += Number(h.ara_toplam || 0);
      ozet.toplam_net += Number(h.net_tutar || 0);
      if (h.durum === 'taslak') ozet.taslak++;
      if (h.durum === 'onaylandi') ozet.onaylanan++;
      if (h.durum === 'odendi') ozet.odenen++;
    });

    return { ozet, hakedisler: data };
  }
}
