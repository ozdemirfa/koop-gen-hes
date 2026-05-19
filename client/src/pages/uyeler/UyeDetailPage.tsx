import React, { useMemo, useState } from 'react'
import { Card, Descriptions, Tabs, Tag, Row, Col, Statistic, Button, Space, App, Popconfirm, Tooltip } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DollarOutlined, HistoryOutlined, UserOutlined, AuditOutlined, RollbackOutlined, PercentageOutlined, InfoCircleOutlined, UserAddOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'

import { PageHeader } from '../../components/common/PageHeader'
import { DataTable } from '../../components/common/DataTable'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { LoadingState } from '../../components/common/LoadingState'
import { ErrorState } from '../../components/common/ErrorState'
import { FaizBorclandirModal } from './components/FaizBorclandirModal'
import { BaslangicBedeliTahakkukModal } from './components/BaslangicBedeliTahakkukModal'

import { trMoneyFormatter } from '../../lib/format'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { usePermissions } from '../../hooks/usePermissions'


interface AidatOdeme {
  id: string
  yil: number
  ay: number
  baz_tutar: number
  toplam_faiz: number
  toplam_tahakkuk: number
  toplam_odenen: number
  kalan_borc: number
  son_odeme_tarihi: string
  durum: string
  toplam_borc?: number
  toplam_tutar?: number
  gecikme_faizi?: number
  dinamik_odenen_tutar?: number
  odenen_tutar?: number
  // REV-AIDAT-01: başlangıç bedeli virtual row marker (Aidat Hesapları tab'inde
  // gerçek aidat satırlarıyla aynı kolonlarda gösterilir).
  isStarter?: boolean
}

export const UyeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canEdit } = usePermissions()
  const [faizModalOpen, setFaizModalOpen] = useState(false)
  const [baslangicModalOpen, setBaslangicModalOpen] = useState(false)
  const { message: messageApi } = App.useApp()
  const isTouchDevice = useIsTouchDevice()

  // Helper: tüm cache invalidation sweep'i (undo + match sonrası ortak).
  const invalidateAllPaymentCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['uye', id] })
    queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', id] })
    queryClient.invalidateQueries({ queryKey: ['uye-odemeler', id] })
    queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
    queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
    queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-ozet'] })
  }

  // Undo Match Mutation (ödeme satırı bazında)
  const undoMatchMutation = useMutation({
    mutationFn: async (movementId: string) => {
      const { data } = await api.post(`/cari-hareketler/${movementId}/undo-closure`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Eşleşme başarıyla kaldırıldı')
      invalidateAllPaymentCaches()
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  // A3 (sprint 20260511-uye-tahsilat-firma-revisions): aidat satırı bazında toplu undo.
  // Başlangıç bedeli virtual row'unun id'si `bb-<cari_hareket_id>` formatında olduğu
  // için (UI gerçek aidatlarla aynı tabloda göstermek için prefix ekliyor); undo
  // çağrısı bu prefix'i ayıklayıp doğru endpoint'e yönlendirir.
  const undoAidatMutation = useMutation({
    mutationFn: async (aidatId: string) => {
      if (aidatId.startsWith('bb-')) {
        const tahakkukId = aidatId.slice(3)
        const { data } = await api.post(`/cari-hareketler/baslangic-bedeli/${tahakkukId}/undo-closure`)
        return data
      }
      const { data } = await api.post(`/cari-hareketler/aidat/${aidatId}/undo-closure`)
      return data
    },
    onSuccess: (resp: any) => {
      messageApi.success(resp?.message || 'Kapama başarıyla geri alındı')
      invalidateAllPaymentCaches()
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Kapama iptal edilemedi'))
  })

  // Üye detaylarını getir
  // U-8 (2026-05-11): isError + error + refetch eklendi; aşağıda erken-return
  // guard pattern'iyle Result + retry button gösteriliyor.
  const {
    data: uye,
    isLoading: uyeLoading,
    isError: uyeIsError,
    error: uyeError,
    refetch: uyeRefetch,
  } = useQuery({
    queryKey: ['uye', id],
    queryFn: async () => {
      const { data } = await api.get(`/uyeler/${id}`)
      return data.data
    },
  })

  // FIFO Eşleştirme Mutation
  const matchMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/uyeler/${id}/match-payments`, null, {
        params: { proje_id: uye?.proje_id }
      })
    },
    onSuccess: (res: any) => {
      const count = res.data?.matched_count || 0
      messageApi.success(`${count} adet borç-ödeme kaydı FIFO kuralı ile eşleştirildi.`)
      // A1 (2026-05-12): match-payments sonrası özet kartlar + cari ekstresi de
      // yansımalı; genişletilmiş invalidation sweep'i.
      queryClient.invalidateQueries({ queryKey: ['uye', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-aidatlar', id] })
      queryClient.invalidateQueries({ queryKey: ['uye-odemeler', id] })
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ozet'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Eşleştirme hatası'))
  })

  // Aidatları getir
  const { data: aidatlar, isLoading: aidatLoading } = useQuery({
    queryKey: ['uye-aidatlar', id, uye?.proje_id],
    queryFn: async () => {
      const { data } = await api.get(`/aidatlar`, {
        params: { uye_id: id, proje_id: uye?.proje_id }
      })
      return data.data as AidatOdeme[]
    },
    enabled: !!uye?.proje_id,
  })

  // Üyeye ait ödeme + iade + başlangıç bedeli kalemlerini getir
  const { data: odemeler, isLoading: odemeLoading } = useQuery({
    queryKey: ['uye-odemeler', id, uye?.proje_id],
    queryFn: async () => {
      const { data } = await api.get(`/cari-hareketler`, {
        params: {
          uye_id: id,
          proje_id: uye?.proje_id,
          islem_turu_in: 'gelen_odeme,iade_odeme,uyelik_baslangic',
          limit: 1000
        }
      })
      return (data.data as any[]).map(o => ({
        ...o,
        odeme_tarihi: o.tarih,
        // Tutar her zaman pozitif gösterilir; yön bilgisi İşlem Türü Tag'inden okunur
        tutar: Math.max(Number(o.borc) || 0, Number(o.alacak) || 0),
        odeme_yontemi: o.odeme_yontemi || o.odeme_turu || '-',
      }))
    },
    enabled: !!uye?.proje_id,
  })

  const durumRenk: Record<string, string> = {
    aktif: 'green',
    pasif: 'default',
    ihrac: 'red',
    istifa: 'orange',
  }
  
  const aidatDurumRenk: Record<string, string> = {
    bekliyor: 'blue',
    odendi: 'green',
    gecikti: 'red',
    iptal: 'default',
  }

  // REV-AIDAT-01 (2026-05-12): Başlangıç bedeli tahakkukları artık Ödemeler tab'i
  // yerine Aidat Hesapları tab'inde gerçek aidatlarla aynı kolon yapısıyla görünür.
  // Cari hareketlerden uyelik_baslangic + alacak>0 + kaynak_tipi IS NULL satırlarını
  // virtual row olarak topla. Ödenen tutar, FIFO sonrası kaynak_tipi='baslangic_bedeli'
  // + kaynak_id=tahakkuk_ch.id ile bağlanmış borç kayıtlarının toplamı.
  const baslangicBedeliRows: AidatOdeme[] = useMemo(() => {
    if (!odemeler) return []
    const matchedByTarget = new Map<string, number>()
    odemeler.forEach((o: any) => {
      if (o.kaynak_tipi === 'baslangic_bedeli' && o.kaynak_id) {
        const prev = matchedByTarget.get(o.kaynak_id) ?? 0
        matchedByTarget.set(o.kaynak_id, prev + Number(o.borc || 0))
      }
    })
    return odemeler
      .filter((o: any) => o.islem_turu === 'uyelik_baslangic' && Number(o.alacak || 0) > 0)
      .map((o: any) => {
        const tahakkuk = Number(o.alacak || 0)
        const odenen = matchedByTarget.get(o.id) ?? 0
        const kalan = Math.max(0, tahakkuk - odenen)
        const durum = kalan <= 0.009 ? 'odendi' : 'bekliyor'
        return {
          id: `bb-${o.id}`,
          yil: 0,
          ay: 0,
          baz_tutar: tahakkuk,
          toplam_faiz: 0,
          toplam_tahakkuk: tahakkuk,
          toplam_odenen: odenen,
          kalan_borc: kalan,
          son_odeme_tarihi: o.tarih,
          durum,
          isStarter: true,
        } as AidatOdeme
      })
  }, [odemeler])

  // Aidat tab dataSource: başlangıç bedeli virtual rows (üstte) + aidatlar
  // dönem bilgisine göre eskiden yeniye sıralı (yıl → ay → vade tarihi).
  const aidatDataSource: AidatOdeme[] = useMemo(() => {
    const sorted = [...(aidatlar ?? [])].sort((a, b) => {
      if (a.yil !== b.yil) return a.yil - b.yil
      if (a.ay !== b.ay) return a.ay - b.ay
      return dayjs(a.son_odeme_tarihi).valueOf() - dayjs(b.son_odeme_tarihi).valueOf()
    })
    return [...baslangicBedeliRows, ...sorted]
  }, [baslangicBedeliRows, aidatlar])

  // Ödemeler tab dataSource: tahakkuk (alacak) satırlarını gizle + FIFO split sonucu
  // parçalanmış payment'ları orijinal ödemeye gruplayarak tek satır göster.
  // Grup anahtarı: (tarih + odeme_turu + banka_hesap_id + belge_no + aciklama)
  // FIFO INSERT'leri orijinal payment'tan tüm bu alanları kopyaladığı için bu set
  // tek bir kullanıcı ödemesini tanımlar.
  const visibleOdemeler = useMemo(() => {
    if (!odemeler) return []
    const filtered = odemeler.filter(
      (o: any) => !(o.islem_turu === 'uyelik_baslangic' && Number(o.alacak || 0) > 0)
    )
    // REV-PAY-14 (2026-05-12): split parçaları aynı (tarih, odeme_turu,
    // banka_hesap_id, belge_no, aciklama, islem_turu) ile tek satıra konsolide.
    const groups = new Map<string, any>()
    filtered.forEach((o: any) => {
      const key = [
        o.tarih,
        o.odeme_turu || '',
        o.banka_hesap_id || '',
        o.belge_no || '',
        o.aciklama || '',
        o.islem_turu,
      ].join('|')
      const existing = groups.get(key)
      if (existing) {
        existing.tutar = Number(existing.tutar || 0) + Number(o.tutar || 0)
        existing.borc = Number(existing.borc || 0) + Number(o.borc || 0)
        existing.alacak = Number(existing.alacak || 0) + Number(o.alacak || 0)
        // Eşleşme satırlarından biri matched ise grup matched sayılır
        if (o.kaynak_id) existing.kaynak_id = o.kaynak_id
      } else {
        groups.set(key, { ...o })
      }
    })
    return Array.from(groups.values())
  }, [odemeler])

  const aidatColumns = [
    {
      title: 'Dönem',
      key: 'donem',
      render: (_: unknown, r: AidatOdeme) =>
        r.isStarter ? <Tag color="orange">Başl. Bedeli</Tag> : `${r.ay}/${r.yil}`,
    },
    {
      title: 'Vade',
      dataIndex: 'son_odeme_tarihi',
      key: 'son_odeme_tarihi',
      render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-',
    },
    {
      title: 'Aidat',
      dataIndex: 'baz_tutar',
      key: 'baz_tutar',
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    {
      title: 'Faiz',
      dataIndex: 'toplam_faiz',
      key: 'toplam_faiz',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Tahakkuk',
      dataIndex: 'toplam_tahakkuk',
      key: 'toplam_tahakkuk',
      render: (v: number) => <MoneyDisplay amount={v} />
    },
    {
      title: 'Ödenen',
      dataIndex: 'toplam_odenen',
      key: 'toplam_odenen',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      title: 'Kalan',
      dataIndex: 'kalan_borc',
      key: 'kalan_borc',
      render: (v: number) => v > 0 ? <MoneyDisplay amount={v} colored /> : '-',
    },
    {
      // REV-FIFO-04 (2026-05-12): rozet derived-from-kalan.
      // View'daki durum kolonuna güvenmek yerine kalan_borc + son_odeme_tarihi
      // üzerinden yeniden hesaplıyoruz; böylece view ile sapsa bile UI tutarlı kalır.
      // Kurallar:
      //   kalan_borc = 0          → odendi (yeşil)
      //   kalan_borc < tahakkuk   → kismi  (sarı)  ← yeni durum (FIFO realloc öncesi görünür)
      //   kalan_borc = tahakkuk, vade geçmiş → gecikti (kırmızı)
      //   kalan_borc = tahakkuk, vade geçmedi → bekliyor (mavi)
      title: 'Durum',
      key: 'durum',
      render: (_: unknown, r: AidatOdeme) => {
        const tahakkuk = Number(r.toplam_tahakkuk || r.toplam_borc || r.toplam_tutar || 0)
        const odenen = Number(r.toplam_odenen ?? r.dinamik_odenen_tutar ?? r.odenen_tutar ?? 0)
        const kalan = Math.max(0, tahakkuk - odenen)
        const vadeGecmis = r.son_odeme_tarihi && dayjs(r.son_odeme_tarihi).isBefore(dayjs(), 'day')

        let durumKey: string
        let label: string
        if (kalan <= 0.009) {
          durumKey = 'odendi'
          label = 'ÖDENDİ'
        } else if (odenen > 0.009) {
          durumKey = 'kismi'
          label = 'KISMİ'
        } else if (vadeGecmis) {
          durumKey = 'gecikti'
          label = 'GECİKTİ'
        } else {
          durumKey = 'bekliyor'
          label = 'BEKLİYOR'
        }
        const colorMap: Record<string, string> = {
          odendi: 'green',
          kismi: 'gold',
          gecikti: 'red',
          bekliyor: 'blue',
        }
        return <Tag color={colorMap[durumKey] || aidatDurumRenk[r.durum] || 'default'}>{label}</Tag>
      },
    },
    {
      // A3 (sprint 20260511-uye-tahsilat-firma-revisions): aidat satırı bazında
      // toplu kapama iptal. toplam_odenen > 0 olan satırlarda undo butonu görünür.
      title: 'İşlem',
      key: 'aidat_action',
      width: 80,
      render: (_: unknown, r: AidatOdeme) => {
        const odenen = Number(r.toplam_odenen ?? r.dinamik_odenen_tutar ?? r.odenen_tutar ?? 0)
        if (odenen <= 0) {
          return (
            <Tooltip
              trigger={isTouchDevice ? ['click', 'hover'] : ['hover']}
              title="Bu aidata henüz bir ödeme eşleştirilmemiş, geri alınacak kapama yok."
            >
              <InfoCircleOutlined
                style={{ color: '#bfbfbf', cursor: isTouchDevice ? 'pointer' : 'help' }}
                aria-label="Bu aidat için kapama iptal edilemez"
              />
            </Tooltip>
          )
        }
        return (
          <Popconfirm
            title="Aidat Kapamayı Geri Al"
            description="Bu aidata bağlı tüm ödeme eşleşmeleri kaldırılacak ve durum yeniden hesaplanacak. Emin misiniz?"
            onConfirm={() => undoAidatMutation.mutate(r.id)}
            okText="Evet, Geri Al"
            cancelText="Vazgeç"
            okButtonProps={{ danger: true }}
            disabled={!canEdit}
          >
            <Button
              type="text"
              size="small"
              danger
              disabled={!canEdit}
              icon={<RollbackOutlined />}
              loading={undoAidatMutation.isPending && undoAidatMutation.variables === r.id}
              title={!canEdit ? 'Yetki yok' : 'Kapama Geri Al'}
              aria-label="Aidat kapamayı geri al"
            />
          </Popconfirm>
        )
      },
    },
  ]

  const islemTuruMeta: Record<string, { color: string; label: string }> = {
    gelen_odeme:      { color: 'green',  label: 'Tahsilat' },
    iade_odeme:       { color: 'blue',   label: 'İade' },
    uyelik_baslangic: { color: 'orange', label: 'Başl. Bedeli' },
  }

  const odemeColumns = [
    { title: 'Tarih', dataIndex: 'odeme_tarihi', key: 'tarih', render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    {
      // TASK-FE-05 (sprint 20260511-backlog-batch1): filter + sorter eklendi.
      title: 'İşlem Türü',
      dataIndex: 'islem_turu',
      key: 'islem_turu',
      width: 140,
      filters: Object.entries(islemTuruMeta).map(([k, v]) => ({ text: v.label, value: k })),
      onFilter: (val: any, r: any) => r.islem_turu === val,
      sorter: (a: any, b: any) =>
        (islemTuruMeta[a.islem_turu]?.label ?? a.islem_turu ?? '').localeCompare(
          islemTuruMeta[b.islem_turu]?.label ?? b.islem_turu ?? '',
          'tr',
        ),
      render: (v: string) => {
        const m = islemTuruMeta[v] ?? { color: 'default', label: v }
        return <Tag color={m.color}>{m.label}</Tag>
      },
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama' },
    { title: 'Tutar', dataIndex: 'tutar', key: 'tutar', render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Yöntem', dataIndex: 'odeme_yontemi', key: 'yontem', render: (v: string) => <Tag>{(v || '-').toUpperCase()}</Tag> },
    { title: 'Makbuz No', dataIndex: 'makbuz_no', key: 'makbuz' },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      // TASK-PM-01 (sprint 20260511-backlog-batch3): iade_odeme ve uyelik_baslangic
      // için undo flow YOK. Bu kalemler aidat ile FIFO eşleşmediği için "Eşleşmeyi Kaldır"
      // anlamlı değil. Kullanıcıya neden butonun çıkmadığını info ikonu ile açıkla.
      render: (_: any, r: any) => {
        const NO_UNDO_TYPES = ['iade_odeme', 'uyelik_baslangic']
        if (NO_UNDO_TYPES.includes(r.islem_turu)) {
          return (
            <Tooltip
              // A8-01 (2026-05-11): mobile/touch cihazlarda hover yok; click ile aç.
              trigger={isTouchDevice ? ['click', 'hover'] : ['hover']}
              title={
                r.islem_turu === 'iade_odeme'
                  ? 'İade kayıtları aidat ile eşleşmez. Geri almak için karşıt bir tahsilat kaydı oluşturun.'
                  : 'Üyelik başlangıç bedeli bir tahakkuk kalemidir; ödeme/iade ile manuel kapatılır, geri alınamaz.'
              }
            >
              <InfoCircleOutlined
                style={{ color: '#bfbfbf', cursor: isTouchDevice ? 'pointer' : 'help' }}
                aria-label="Bu kalem için işlem geri alınamaz; detay için tıklayın"
              />
            </Tooltip>
          )
        }

        const isMatched = !!r.kaynak_id;
        if (!isMatched) return null;

        return (
          <Popconfirm
            title="Eşleşmeyi Kaldır"
            description="Bu ödemenin aidat ile olan eşleşmesi kaldırılacaktır. Emin misiniz?"
            onConfirm={() => undoMatchMutation.mutate(r.id)}
            okText="Evet, Kaldır"
            cancelText="Vazgeç"
            disabled={!canEdit}
          >
            <Button
              type="text"
              size="small"
              danger
              disabled={!canEdit}
              icon={<RollbackOutlined />}
              loading={undoMatchMutation.isPending && undoMatchMutation.variables === r.id}
              title={!canEdit ? 'Yetki yok' : 'Eşleşmeyi Geri Al'}
            />
          </Popconfirm>
        );
      }
    }
  ]

  // Finansal özet hesapla
  // REV-PAY-12 (2026-05-12): Aggregator cari_hareketler üzerinden gerçek nakit yön
  // hesabı kullanır (FIFO eşleşmesi olsun olmasın). Mantık:
  //   - Toplam Tahakkuk = aidat tahakkukları + uyelik_baslangic alacakları
  //   - Toplam Ödeme    = tüm gelen_odeme borçları + uyelik_baslangic borçları (tahsilatlar)
  //                       - iade_odeme alacakları (üyeye geri verilen para)
  //   - Toplam Kalan    = Toplam Tahakkuk - Toplam Ödeme
  const baslangicBedeliTahakkuk = (odemeler ?? []).reduce(
    (s: number, o: any) => s + (o.islem_turu === 'uyelik_baslangic' ? Number(o.alacak || 0) : 0),
    0
  )
  const tumTahsilat = (odemeler ?? []).reduce(
    (s: number, o: any) =>
      s + ((o.islem_turu === 'gelen_odeme' || o.islem_turu === 'uyelik_baslangic') ? Number(o.borc || 0) : 0),
    0
  )
  const toplamIadeOdeme = (odemeler ?? []).reduce(
    (s: number, o: any) => s + (o.islem_turu === 'iade_odeme' ? Number(o.alacak || 0) : 0),
    0
  )

  const aidatTahakkuk = aidatlar?.reduce((sum, a) => sum + Number(a.toplam_tahakkuk || a.toplam_borc || a.toplam_tutar || 0), 0) || 0

  const toplamTahakkuk = aidatTahakkuk + baslangicBedeliTahakkuk
  const toplamGecikmeFaizi = aidatlar?.reduce((sum, a) => sum + Number(a.toplam_faiz || a.gecikme_faizi || 0), 0) || 0
  const toplamOdenen = tumTahsilat - toplamIadeOdeme

  // Geciken Borç: Toplam Tahakkuk - Toplam Ödeme (negatif olamaz; iade fazlasında alacaklı)
  const toplamKalan = toplamTahakkuk - toplamOdenen

  const daireNo = uye?.serefiye_tablosu?.daire_no || '-'

  // U-8 (2026-05-11): error/loading guard — Result + retry
  if (uyeLoading) {
    return <LoadingState fullHeight />
  }
  if (uyeIsError || (!uyeLoading && !uye)) {
    return (
      <ErrorState
        error={uyeError}
        title={uyeIsError ? 'Üye yüklenemedi' : 'Üye bulunamadı'}
        onRetry={() => uyeRefetch()}
      />
    )
  }

  return (
    <div>
      <PageHeader 
        title={uye ? `${uye.ad} ${uye.soyad}` : "Üye Detayı"} 
        subtitle={uye ? `Üye No: ${uye.uye_no} | Daire Kod: ${daireNo}` : ""}
        onBack={() => navigate('/uyeler')}
        extra={
          <Space>
            <Button
              icon={<AuditOutlined />}
              onClick={() => matchMutation.mutate()}
              loading={matchMutation.isPending}
              disabled={!canEdit}
              title={!canEdit ? 'Yetki yok' : 'Mevcut eşleşmemiş ödemeleri borçlarla FIFO kuralına göre kapatır'}
            >
              Hesap Kapatma (FIFO)
            </Button>
            <Button
              icon={<UserAddOutlined />}
              onClick={() => setBaslangicModalOpen(true)}
              disabled={!canEdit}
              title={!canEdit ? 'Yetki yok' : 'Üyelik başlangıç bedeli için cari hesaba tahakkuk (alacak) kaydı açar'}
            >
              Başlangıç Bedeli Tahakkuk
            </Button>
            <Button
              type="primary"
              size="large"
              danger
              icon={<PercentageOutlined />}
              onClick={() => setFaizModalOpen(true)}
              disabled={!canEdit}
              title={!canEdit ? 'Yetki yok' : undefined}
            >
              Üye Faiz Borç İşle
            </Button>
          </Space>
        }
      />

      <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Toplam Tahakkuk" 
              value={toplamTahakkuk} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { fontWeight: 700 } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Toplam Ödeme" 
              value={toplamOdenen} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { color: 'var(--success)', fontWeight: 700 } }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Geciken Borç" 
              value={toplamKalan} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { 
                color: toplamKalan > 0 ? 'var(--error)' : 'var(--success)',
                fontWeight: 700 
              } }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic 
              title="Gecikme Faizi" 
              value={toplamGecikmeFaizi} 
              prefix="₺" 
              formatter={(v) => trMoneyFormatter(v as number)} 
              styles={{ content: { color: '#fa8c16', fontWeight: 700 } }} 
            />
          </Card>
        </Col>
      </Row>

      <Card 
        styles={{ body: { padding: 0 } }}
        style={{ overflow: 'hidden' }}
      >
        <Tabs
          defaultActiveKey="1"
          type="line"
          size="large"
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: '1',
              label: <Space><DollarOutlined />Aidat Hesapları</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <DataTable
                    columns={aidatColumns}
                    dataSource={aidatDataSource}
                    rowKey="id"
                    loading={aidatLoading || odemeLoading}
                    hideCard
                    pagination={false}
                  />
                </div>
              ),
            },
            {
              key: '2',
              label: <Space><HistoryOutlined />Ödemeler / Makbuzlar</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <DataTable
                    columns={odemeColumns}
                    dataSource={visibleOdemeler}
                    rowKey="id"
                    loading={odemeLoading}
                    hideCard
                  />
                </div>
              ),
            },
            {
              key: '3',
              label: <Space><UserOutlined />Profil Bilgileri</Space>,
              children: (
                <div style={{ paddingTop: 24 }}>
                  {uye && (
                    <Descriptions 
                      bordered 
                      column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
                      styles={{ label: { background: '#f8fafc', fontWeight: 600, width: '150px' } }}
                    >
                      <Descriptions.Item label="Üye No">{uye.uye_no}</Descriptions.Item>
                      <Descriptions.Item label="TC Kimlik">{uye.tc_kimlik || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Durum">
                        <Tag color={durumRenk[uye.durum]}>{uye.durum.toUpperCase()}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Daire Kod">
                        {daireNo}
                      </Descriptions.Item>
                      <Descriptions.Item label="Şerefiye Oranı">
                        {uye.serefiye_tablosu?.serefiye_orani || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Üyelik Tarihi">
                        {uye.uyelik_tarihi ? dayjs(uye.uyelik_tarihi).format('DD.MM.YYYY') : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Telefon">{uye.telefon || '-'}</Descriptions.Item>
                      <Descriptions.Item label="E-Posta">{uye.email || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Adres" span={3}>{uye.adres || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Notlar" span={3}>{uye.notlar || '-'}</Descriptions.Item>
                    </Descriptions>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {id && (
        <FaizBorclandirModal
          open={faizModalOpen}
          onCancel={() => setFaizModalOpen(false)}
          uyeId={id}
          aidatlar={aidatlar || []}
        />
      )}

      {id && uye?.proje_id && (
        <BaslangicBedeliTahakkukModal
          open={baslangicModalOpen}
          onCancel={() => setBaslangicModalOpen(false)}
          uyeId={id}
          projeId={uye.proje_id}
          uyeAd={`${uye.ad ?? ''} ${uye.soyad ?? ''}`.trim()}
        />
      )}
    </div>
  )
}
