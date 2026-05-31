import React, { useState, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Modal, Form, InputNumber, Select, message, Card, Typography, Tag, Space, DatePicker, Input, Row, Col, Statistic, App, Popconfirm, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, DollarCircleOutlined, CalculatorOutlined, HistoryOutlined, WalletOutlined, RollbackOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import api from '../lib/api'
import { getErrorMessage } from '../lib/apiError'
import { MoneyDisplay } from '../components/common/MoneyDisplay'
import { DataTable } from '../components/common/DataTable'
import { HeaderActionsToolbar } from '../components/common/HeaderActionsToolbar'
import { usePageSettings } from '../contexts/LayoutContext'
import { useProject } from '../contexts/ProjectContext'
import { usePermissions } from '../hooks/usePermissions'
import { trNumberFormatter, trNumberParser, formatMoney, trMoneyFormatter } from '../lib/format'
import { LoadingState } from '../components/common/LoadingState'
import { ErrorState } from '../components/common/ErrorState'
import { useDebounce } from '../hooks/useDebounce'

const { Text, Title } = Typography

interface Aidat {
  id: string
  proje_id: string
  serefiye_id: string
  uye_id: string
  aidat_tanimi_id: string
  durum: string
  son_odeme_tarihi: string
  gecikme_faizi: number
  gecikme_gun_sayisi: number
  faiz_yansitildi: boolean
  ad: string
  soyad: string
  uye_no: string
  daire_no: string
  blok_adi: string
  hesaplanan_tutar: number
  dinamik_odenen_tutar: number
  toplam_borc: number
  yil: number
  ay: number
  aidat_turu: string
  serefiye_tablosu?: {
    daire_no: string
    bloklar?: { blok_adi: string }
  }
}

interface AidatTanimi {
  id: string
  proje_id: string
  yil: number
  ay: number
  katsayi_tutari: number
  son_odeme_gunu: number
  gecikme_faiz_orani: number
  tur: string
  durum: 'plan' | 'borclandi'
  created_at: string
}

export const Aidatlar: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const isTanimlarPage = location.pathname.includes('/tanimlar')

  // Filtre state'leri (Aidat Listesi)
  const [filterYil, setFilterYil] = useState<number | undefined>(undefined)
  const [filterAy, setFilterAy] = useState<number | undefined>(undefined)
  const [filterDurum, setFilterDurum] = useState<string | undefined>(undefined)
  const [filterBlokId, setFilterBlokId] = useState<string | undefined>(undefined)
  const [filterHasDaire, setFilterHasDaire] = useState<string | undefined>(undefined)
  const [filterUyeAdi, setFilterUyeAdi] = useState<string | undefined>(undefined)
  const debouncedUyeAdi = useDebounce(filterUyeAdi, 300)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 })

  // Filtre state'leri (Aidat Tanımları)
  const [filterTanimYil, setFilterTanimYil] = useState<number | undefined>(undefined)
  const [filterTanimAy, setFilterTanimAy] = useState<number | undefined>(undefined)
  const [filterTanimTur, setFilterTanimTur] = useState<string | undefined>(undefined)

  // Modal state'leri
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTanim, setEditingTanim] = useState<AidatTanimi | null>(null)
  const [form] = Form.useForm()

  const queryClient = useQueryClient()
  const { activeProject } = useProject()
  const { canEdit, canDelete } = usePermissions()
  const { message: messageApi } = App.useApp()

  // OC-07 (sprint 20260511-ui-responsive-sprint extension):
  // Inline useBreakpoint() + filterDrawerOpen state'i HeaderActionsToolbar
  // wrapper'ına devredildi. Mobile/desktop detect + Drawer açma artık
  // helper component'in sorumluluğunda.

  // Aktif filtre sayısı (badge için) — Aidat Listesi filtreleri
  const activeListFilterCount = useMemo(() => {
    let count = 0
    if (filterUyeAdi) count++
    if (filterYil) count++
    if (filterAy) count++
    if (filterDurum) count++
    if (filterBlokId) count++
    if (filterHasDaire) count++
    return count
  }, [filterUyeAdi, filterYil, filterAy, filterDurum, filterBlokId, filterHasDaire])

  // Proje tarihlerine göre yıl listesi oluştur
  const yearOptions = useMemo(() => {
    const currentYear = dayjs().year()
    if (!activeProject?.baslangic_tarihi) {
      return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)
    }

    const startYear = dayjs(activeProject.baslangic_tarihi).year()
    const endYear = activeProject.bitis_tarihi
      ? dayjs(activeProject.bitis_tarihi).year()
      : currentYear + 1

    const years = []
    for (let y = startYear; y <= endYear; y++) {
      years.push(y)
    }
    return years
  }, [activeProject])

  // Bloklar (Aktif proje için)
  const { data: bloklar } = useQuery({
    queryKey: ['bloklar', activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return []
      const { data } = await api.get('/bloklar', { params: { proje_id: activeProject?.id } })
      return data.data as { id: string; blok_adi: string; toplam_daire: number }[]
    },
    enabled: !!activeProject?.id
  })

  // Aidat tanımları
  const { data: tanimlar, isLoading: tanimLoading } = useQuery({
    queryKey: ['aidat-tanimlari', activeProject?.id, filterTanimYil, filterTanimAy, filterTanimTur],
    queryFn: async () => {
      const params: Record<string, string> = { proje_id: activeProject?.id! }
      if (filterTanimYil) params.yil = String(filterTanimYil)
      if (filterTanimAy) params.ay = String(filterTanimAy)
      if (filterTanimTur) params.tur = filterTanimTur

      const { data } = await api.get('/aidatlar/tanimlar', { params })
      return data.data as AidatTanimi[]
    },
    enabled: !!activeProject?.id
  })

  // Aidatlar listesi (filtreli + sayfalı)
  const { data: aidatData, isLoading: aidatLoading } = useQuery({
    queryKey: ['aidatlar', activeProject?.id, filterYil, filterAy, filterDurum, filterBlokId, filterHasDaire, debouncedUyeAdi, pagination.current, pagination.pageSize],
    queryFn: async () => {
      if (!activeProject?.id) return { data: [], pagination: { totalCount: 0 } }
      const params: Record<string, string> = {
        page: String(pagination.current),
        limit: String(pagination.pageSize),
        proje_id: activeProject.id
      }
      if (filterYil) params.yil = String(filterYil)
      if (filterAy) params.ay = String(filterAy)
      if (filterDurum) params.durum = filterDurum
      if (filterBlokId) params.blok_id = filterBlokId
      if (filterHasDaire === 'atanmis') params.has_daire = 'true'
      if (filterHasDaire === 'atanmamis') params.has_daire = 'false'
      if (debouncedUyeAdi) params.uye_adi = debouncedUyeAdi

      const { data } = await api.get('/aidatlar', { params })
      return data
    },
    enabled: !!activeProject?.id && !isTanimlarPage
  })

  // Aidat özet (filtrelere göre)
  const { data: ozet } = useQuery({
    queryKey: ['aidat-ozet', activeProject?.id, filterYil, filterAy, filterDurum, filterBlokId, filterHasDaire, debouncedUyeAdi],
    queryFn: async () => {
      if (!activeProject?.id) return null
      const params: Record<string, string> = { proje_id: activeProject.id }
      if (filterYil) params.yil = String(filterYil)
      if (filterAy) params.ay = String(filterAy)
      if (filterDurum) params.durum = filterDurum
      if (filterBlokId) params.blok_id = filterBlokId
      if (filterHasDaire === 'atanmis') params.has_daire = 'true'
      if (filterHasDaire === 'atanmamis') params.has_daire = 'false'
      if (debouncedUyeAdi) params.uye_adi = debouncedUyeAdi

      const { data } = await api.get('/aidatlar/ozet', { params })
      return data.data
    },
    enabled: !!activeProject?.id && !isTanimlarPage
  })

  // Filtreler değişince başa dön
  useEffect(() => {
    setPagination(prev => ({ ...prev, current: 1 }))
  }, [filterYil, filterAy, filterDurum, filterBlokId, filterHasDaire, debouncedUyeAdi, activeProject?.id])

  // Mutation: Aidat Tanımı Kaydet
  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingTanim) {
        const { data } = await api.put(`/aidatlar/tanimlar/${editingTanim.id}`, values)
        return data
      }
      const { data } = await api.post('/aidatlar/tanimlar', { ...values, proje_id: activeProject?.id })
      return data
    },
    onSuccess: () => {
      messageApi.success('Aidat tanımı kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['aidat-tanimlari'] })
      setModalVisible(false)
      setEditingTanim(null)
      form.resetFields()
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  // Mutation: Borçlandır (Tahakkuk ettir)
  const chargeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/aidatlar/tanimlar/${id}/borclandir`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Borçlandırma işlemi başarıyla tamamlandı')
      queryClient.invalidateQueries({ queryKey: ['aidat-tanimlari'] })
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Borçlandırma hatası'))
  })

  // Mutation: Aidat Tanımı Sil (yalnızca 'plan' durumunda; borçlandırılmışsa önce geri al)
  const deleteTanimMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/aidatlar/tanimlar/${id}`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Aidat tanımı silindi')
      queryClient.invalidateQueries({ queryKey: ['aidat-tanimlari'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Tanım silinemedi')),
  })

  // Mutation: Borçlandırmayı Geri Al (tanım → 'plan'a döner, ödeme yoksa)
  const unchargeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/aidatlar/tanimlar/${id}/borclandirma-geri-al`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Borçlandırma geri alındı. Tanım artık düzenlenebilir/silinebilir.')
      queryClient.invalidateQueries({ queryKey: ['aidat-tanimlari'] })
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['cari-hareketler'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Borçlandırma geri alınamadı')),
  })

  // Mutation: Tekil aidat satırı sil (ödeme yoksa)
  const deleteAidatMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/aidatlar/${id}`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Aidat kaydı silindi')
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['cari-hareketler'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'Aidat silinemedi')),
  })

  // Mutation: Faiz Toggle (Ekle/Sil)
  const toggleInterestMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string, active: boolean }) => {
      const { data } = await api.post(`/aidatlar/${id}/toggle-faiz`, { active })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aidatlar'] })
      queryClient.invalidateQueries({ queryKey: ['aidat-ozet'] })
      messageApi.success('Faiz durumu güncellendi')
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const setModalOpen = (visible: boolean) => {
    setModalVisible(visible)
    if (!visible) {
      setEditingTanim(null)
      form.resetFields()
    }
  }

  const handleAdd = () => {
    setEditingTanim(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleEdit = (tanim: AidatTanimi) => {
    setEditingTanim(tanim)
    form.setFieldsValue(tanim)
    setModalOpen(true)
  }

  // Desktop'ta inline filter satırı; mobile'da Drawer içinde tek button trigger.
  // useMemo zorunlu: bu JSX usePageSettings → setHeaderActions'a geçiliyor;
  // referans değişmezse LayoutContext strict-ref-check (44ac886) re-render loop'u önler.
  const listFilterControls = useMemo(() => (
    <Space orientation="horizontal" size="small" wrap>
      <Input
        placeholder="Üye Ara"
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        value={filterUyeAdi}
        onChange={(e) => setFilterUyeAdi(e.target.value)}
        allowClear
        style={{ width: 140 }}
        size="small"
      />
      <Select
        placeholder="Yıl"
        value={filterYil}
        onChange={setFilterYil}
        allowClear
        style={{ width: 75 }}
        size="small"
      >
        {yearOptions.map(y => <Select.Option key={y} value={y}>{y}</Select.Option>)}
      </Select>
      <Select
        placeholder="Ay"
        value={filterAy}
        onChange={setFilterAy}
        allowClear
        style={{ width: 65 }}
        size="small"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
          <Select.Option key={m} value={m}>{m}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Durum"
        value={filterDurum}
        onChange={setFilterDurum}
        allowClear
        style={{ width: 90 }}
        size="small"
      >
        <Select.Option value="bekliyor">Bekliyor</Select.Option>
        <Select.Option value="gecikti">Gecikti</Select.Option>
        <Select.Option value="odendi">Ödendi</Select.Option>
      </Select>
      <Select
        placeholder="Blok"
        value={filterBlokId}
        onChange={setFilterBlokId}
        allowClear
        style={{ width: 85 }}
        size="small"
      >
        {bloklar?.map(b => (
          <Select.Option key={b.id} value={b.id}>{b.blok_adi}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Daire"
        value={filterHasDaire}
        onChange={setFilterHasDaire}
        allowClear
        style={{ width: 95 }}
        size="small"
      >
        <Select.Option value="atanmis">Atanmış</Select.Option>
        <Select.Option value="atanmamis">Atanmamış</Select.Option>
      </Select>
    </Space>
  ), [filterUyeAdi, filterYil, filterAy, filterDurum, filterBlokId, filterHasDaire, yearOptions, bloklar])

  // Mobile filter Drawer içeriği — daha geniş kolonlar, vertical layout
  // useMemo zorunlu: bu JSX usePageSettings → setHeaderActions'a geçiliyor;
  // referans değişmezse LayoutContext strict-ref-check (44ac886) re-render loop'u önler.
  const listFilterControlsVertical = useMemo(() => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Input
        placeholder="Üye Ara"
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        value={filterUyeAdi}
        onChange={(e) => setFilterUyeAdi(e.target.value)}
        allowClear
      />
      <Select
        placeholder="Yıl"
        value={filterYil}
        onChange={setFilterYil}
        allowClear
        style={{ width: '100%' }}
      >
        {yearOptions.map(y => <Select.Option key={y} value={y}>{y}</Select.Option>)}
      </Select>
      <Select
        placeholder="Ay"
        value={filterAy}
        onChange={setFilterAy}
        allowClear
        style={{ width: '100%' }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
          <Select.Option key={m} value={m}>{m}. Ay</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Durum"
        value={filterDurum}
        onChange={setFilterDurum}
        allowClear
        style={{ width: '100%' }}
      >
        <Select.Option value="bekliyor">Bekliyor</Select.Option>
        <Select.Option value="gecikti">Gecikti</Select.Option>
        <Select.Option value="odendi">Ödendi</Select.Option>
      </Select>
      <Select
        placeholder="Blok"
        value={filterBlokId}
        onChange={setFilterBlokId}
        allowClear
        style={{ width: '100%' }}
      >
        {bloklar?.map(b => (
          <Select.Option key={b.id} value={b.id}>{b.blok_adi}</Select.Option>
        ))}
      </Select>
      <Select
        placeholder="Daire"
        value={filterHasDaire}
        onChange={setFilterHasDaire}
        allowClear
        style={{ width: '100%' }}
      >
        <Select.Option value="atanmis">Atanmış</Select.Option>
        <Select.Option value="atanmamis">Atanmamış</Select.Option>
      </Select>
      {activeListFilterCount > 0 && (
        <Button
          block
          onClick={() => {
            setFilterUyeAdi(undefined)
            setFilterYil(undefined)
            setFilterAy(undefined)
            setFilterDurum(undefined)
            setFilterBlokId(undefined)
            setFilterHasDaire(undefined)
          }}
        >
          Filtreleri Temizle
        </Button>
      )}
    </Space>
  ), [filterUyeAdi, filterYil, filterAy, filterDurum, filterBlokId, filterHasDaire, yearOptions, bloklar, activeListFilterCount])

  // OC-07: Aidat Listesi header — HeaderActionsToolbar
  // (Aidat Listesi sayfasında primary CTA yok; tüm filter'lar secondary).
  const listActions = useMemo(() => (
    <HeaderActionsToolbar
      secondary={listFilterControls}
      secondaryMobile={listFilterControlsVertical}
      filterCount={activeListFilterCount}
      drawerTitle="Aidat Filtreleri"
    />
  ), [listFilterControls, listFilterControlsVertical, activeListFilterCount])

  // OC-07: Aidat Tanımları header — HeaderActionsToolbar
  // primary=Yeni + Yıllık Plan, secondary=Yıl Select. Mobil/desktop ortak görünüm
  // için kullanıcı isteği üzerine (2026-05-24) butonlar ikon-only + Tooltip.
  const tanimPrimary = useMemo(() => (
    <Space size="small">
      <Tooltip title={!canEdit ? 'Yetki yok' : 'Yeni Tanım'}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAdd}
          disabled={!activeProject || !canEdit}
          size="small"
          aria-label="Yeni Tanım"
        />
      </Tooltip>
      <Tooltip title="Yıllık Plan">
        <Button
          type="default"
          icon={<HistoryOutlined />}
          onClick={() => navigate('/aidatlar/yillik-plan')}
          size="small"
          aria-label="Yıllık Plan"
        />
      </Tooltip>
    </Space>
  ), [activeProject, navigate, canEdit])

  const tanimSecondary = useMemo(() => (
    <Select
      placeholder="Yıl"
      value={filterTanimYil}
      onChange={setFilterTanimYil}
      allowClear
      style={{ width: 90 }}
      size="small"
    >
      {yearOptions.map(y => <Select.Option key={y} value={y}>{y}</Select.Option>)}
    </Select>
  ), [filterTanimYil, yearOptions])

  const tanimActions = useMemo(() => (
    <HeaderActionsToolbar
      primary={tanimPrimary}
      secondary={tanimSecondary}
      filterCount={filterTanimYil ? 1 : 0}
      drawerTitle="Tanım Filtreleri"
    />
  ), [tanimPrimary, tanimSecondary, filterTanimYil])

  usePageSettings(isTanimlarPage ? 'Aidat Tanımları' : 'Aidat Listesi', isTanimlarPage ? tanimActions : listActions)

  const aidatColumns = [
    {
      title: 'Daire',
      key: 'daire',
      width: 60,
      render: (_: unknown, r: Aidat) =>
        r.serefiye_tablosu ? r.serefiye_tablosu.daire_no : '-',
    },
    {
      title: 'Üye',
      key: 'uye',
      render: (_: unknown, r: Aidat) => r.ad ? `${r.ad} ${r.soyad}` : <Text type="secondary">Üye yok</Text>,
    },
    {
      title: 'Dönem',
      key: 'donem',
      responsive: ['sm'] as const,
      render: (_: unknown, r: Aidat) => `${r.ay}/${r.yil}`
    },
    {
      title: 'Ana Borç',
      dataIndex: 'hesaplanan_tutar',
      key: 'tutar',
      align: 'right' as const,
      responsive: ['md'] as const,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Gecikme Faizi',
      key: 'faiz',
      align: 'right' as const,
      width: 140,
      responsive: ['lg'] as const,
      render: (_: any, r: Aidat) => {
        const hasInterest = Number(r.gecikme_faizi || 0) >= 0.01;
        const isOverdue = r.son_odeme_tarihi && dayjs(r.son_odeme_tarihi).isBefore(dayjs(), 'day');
        const showButton = (r.durum === 'gecikti' || (r.durum === 'bekliyor' && isOverdue)) && hasInterest;

        return (
          <Space orientation="vertical" size={2} style={{ width: '100%', alignItems: 'flex-end' }}>
            <Text type={r.faiz_yansitildi ? "danger" : "secondary"} strong={r.faiz_yansitildi}>
              {r.gecikme_faizi > 0 ? <MoneyDisplay amount={r.gecikme_faizi} /> : '-'}
            </Text>
            {showButton && (
              r.faiz_yansitildi ? (
                <Tooltip title={Number(r.dinamik_odenen_tutar || 0) > 0 ? "Bu aidata ödeme yapılmış. Faizi silmek için önce ödeme eşleştirmesini kaldırınız." : ""}>
                  <div style={{ display: 'inline-block' }}>
                    <Popconfirm
                      title="Faiz Silinsin mi?"
                      description="Bu işlem ilgili muhasebe kaydını (tahakkuk) silecek ve faizi borçtan düşecektir."
                      onConfirm={() => toggleInterestMutation.mutate({ id: r.id, active: false })}
                      okText="Evet, Sil"
                      cancelText="Vazgeç"
                      okButtonProps={{ danger: true }}
                      disabled={Number(r.dinamik_odenen_tutar || 0) > 0}
                    >
                      <Button
                        size="small"
                        type="primary"
                        danger
                        loading={toggleInterestMutation.isPending && toggleInterestMutation.variables?.id === r.id}
                        disabled={Number(r.dinamik_odenen_tutar || 0) > 0}
                        style={{ fontSize: '11px', height: '24px' }}
                      >
                        Faiz Sil
                      </Button>
                    </Popconfirm>
                  </div>
                </Tooltip>
              ) : (
                <Button
                  size="small"
                  onClick={() => toggleInterestMutation.mutate({ id: r.id, active: true })}
                  loading={toggleInterestMutation.isPending && toggleInterestMutation.variables?.id === r.id}
                  disabled={!r.ad}
                  style={{
                    fontSize: '11px',
                    height: '24px',
                    color: '#fa8c16',
                    borderColor: '#fa8c16'
                  }}
                >
                  Faiz Ekle
                </Button>
              )
            )}
          </Space>
        )
      }
    },
    {
      title: 'Toplam',
      key: 'toplam_borc',
      align: 'right' as const,
      render: (_: any, r: Aidat) => {
        const gosterilecekToplam = Number(r.hesaplanan_tutar) + (r.faiz_yansitildi ? Number(r.gecikme_faizi || 0) : 0)
        return <MoneyDisplay amount={gosterilecekToplam} strong />
      },
    },
    {
      title: 'Bakiye',
      key: 'bakiye',
      align: 'right' as const,
      render: (_: any, r: Aidat) => {
        const gosterilecekToplam = Number(r.hesaplanan_tutar) + (r.faiz_yansitildi ? Number(r.gecikme_faizi || 0) : 0)
        const bakiye = gosterilecekToplam - Number(r.dinamik_odenen_tutar || 0)
        return bakiye > 0 ? <MoneyDisplay amount={bakiye} colored /> : <Tag color="green">ÖDENDİ</Tag>
      }
    },
    {
      title: 'Durum',
      key: 'durum',
      responsive: ['sm'] as const,
      render: (_: any, r: Aidat) => {
        const colors: Record<string, string> = { bekliyor: 'blue', gecikti: 'red', odendi: 'green' }
        return (
          <Space orientation="vertical" size={0}>
            <Tag color={colors[r.durum]}>{r.durum.toUpperCase()}</Tag>
            {r.durum === 'gecikti' && r.gecikme_gun_sayisi > 0 && (
              <Text type="danger" style={{ fontSize: '11px' }}>{r.gecikme_gun_sayisi} Gün</Text>
            )}
          </Space>
        )
      },
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 70,
      align: 'center' as const,
      render: (_: any, r: Aidat) => {
        const odenmis = Number(r.dinamik_odenen_tutar || 0) > 0
        return (
          <Popconfirm
            title="Aidatı Sil"
            description="Bu aidat kaydı (ve tahakkuku) silinecek. Ödeme eşleştirmesi yapılmışsa işlem reddedilir. Emin misiniz?"
            onConfirm={() => deleteAidatMutation.mutate(r.id)}
            okText="Evet, Sil"
            cancelText="Vazgeç"
            okButtonProps={{ danger: true }}
            disabled={!canDelete || odenmis}
          >
            <Tooltip title={!canDelete ? 'Yetki yok (manager+ gerekli)' : odenmis ? 'Ödeme yapılmış — önce eşleştirmeyi geri alın' : 'Aidatı Sil'}>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!canDelete || odenmis}
                loading={deleteAidatMutation.isPending && deleteAidatMutation.variables === r.id}
                aria-label="Aidatı sil"
              />
            </Tooltip>
          </Popconfirm>
        )
      },
    },
  ]

  const tanimColumns = [
    { title: 'Yıl/Ay', key: 'donem', render: (_: any, r: AidatTanimi) => `${r.yil}/${r.ay}` },
    { title: 'Katsayı Tutarı', dataIndex: 'katsayi_tutari', key: 'tutar', render: (v: number) => formatMoney(v) },
    { title: 'Son Ödeme Günü', dataIndex: 'son_odeme_gunu', key: 'gun', responsive: ['sm'] as const, render: (v: number) => `${v}. Gün` },
    { title: 'Gecikme Faizi', dataIndex: 'gecikme_faiz_orani', key: 'faiz', responsive: ['sm'] as const, render: (v: number) => `% ${v}` },
    {
      title: 'Durum',
      dataIndex: 'durum',
      key: 'durum',
      render: (d: string) => <Tag color={d === 'borclandi' ? 'green' : 'blue'}>{d === 'borclandi' ? 'BORÇLANDIRILDI' : 'PLAN'}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      render: (_: any, r: AidatTanimi) => (
        <Space orientation="horizontal">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(r)}
            disabled={r.durum === 'borclandi' || !canEdit}
            title={!canEdit ? 'Yetki yok' : undefined}
          />
          {r.durum === 'plan' && canEdit && (
            <Popconfirm title="Tüm aktif üyelere borç yansıtılacak. Emin misiniz?" onConfirm={() => chargeMutation.mutate(r.id)}>
              <Tooltip title="Aidat Borçlandır">
                <Button size="small" type="primary" icon={<DollarCircleOutlined />} loading={chargeMutation.isPending} />
              </Tooltip>
            </Popconfirm>
          )}
          {r.durum === 'borclandi' && canDelete && (
            <Popconfirm
              title="Borçlandırmayı Geri Al"
              description="Bu aya ait tüm aidat tahakkukları kaldırılır ve tanım düzenlenebilir/silinebilir hale gelir. Ödeme eşleştirmesi yapılmışsa işlem reddedilir. Devam edilsin mi?"
              onConfirm={() => unchargeMutation.mutate(r.id)}
              okText="Evet, Geri Al"
              cancelText="Vazgeç"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Borçlandırmayı Geri Al">
                <Button size="small" danger icon={<RollbackOutlined />} loading={unchargeMutation.isPending} />
              </Tooltip>
            </Popconfirm>
          )}
          {r.durum === 'plan' && canDelete && (
            <Popconfirm
              title="Tanımı Sil"
              description="Bu aidat tanımı silinecek. Emin misiniz?"
              onConfirm={() => deleteTanimMutation.mutate(r.id)}
              okText="Evet, Sil"
              cancelText="Vazgeç"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Tanımı Sil">
                <Button size="small" danger icon={<DeleteOutlined />} loading={deleteTanimMutation.isPending} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="animate-in fade-in duration-500">
      {!isTanimlarPage && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={12} lg={6}>
            <Card variant="borderless" className="stat-card shadow-sm" size="small">
              <Statistic
                title="Toplam Tahakkuk"
                value={ozet?.toplam_aidat || 0}
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { fontWeight: 700, fontSize: 'clamp(16px, 4vw, 20px)' } }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} lg={6}>
            <Card variant="borderless" className="stat-card shadow-sm" size="small">
              <Statistic
                title="Toplam Tahsilat"
                value={ozet?.toplam_tahsilat || 0}
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#3f8600', fontWeight: 700, fontSize: 'clamp(16px, 4vw, 20px)' } }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} lg={6}>
            <Card variant="borderless" className="stat-card shadow-sm" size="small">
              <Statistic
                title="Geciken Aidat"
                value={ozet?.geciken || 0}
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#cf1322', fontWeight: 700, fontSize: 'clamp(16px, 4vw, 20px)' } }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} lg={6}>
            <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#fff7e6' }}>
              <Statistic
                title="Bekleyen Aidat"
                value={ozet?.bekleyen || 0}
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#d46b08', fontWeight: 700, fontSize: 'clamp(16px, 4vw, 20px)' } }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <DataTable
        columns={(isTanimlarPage ? tanimColumns : aidatColumns) as any[]}
        dataSource={isTanimlarPage ? tanimlar : aidatData?.data}
        rowKey="id"
        loading={isTanimlarPage ? tanimLoading : aidatLoading}
        totalItems={aidatData?.pagination?.totalCount || 0}
        pagination={isTanimlarPage ? false : {
          current: pagination.current,
          pageSize: pagination.pageSize,
          pageSizeOptions: ['20', '50', '100'],
          showSizeChanger: true
        }}
        onChange={(p) => setPagination({ current: p.current || 1, pageSize: p.pageSize || 50 })}
        size="small"
      />

      {/* OC-07: Inline filter Drawer kaldırıldı — HeaderActionsToolbar
          mobile Drawer'ı kendi içinde yönetiyor (secondaryMobile prop). */}

      <Modal
        title={editingTanim ? 'Tanım Düzenle' : 'Yeni Tanım Ekle'}
        open={modalVisible}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width="min(520px, 95vw)"
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
          initialValues={{
            yil: dayjs().year(),
            ay: dayjs().month() + 1,
            tur: 'normal',
            gecikme_faiz_orani: 5,
            son_odeme_gunu: 15
          }}
          autoComplete="off"
          size="small"
          validateTrigger={["onBlur", "onChange"]}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="yil" label="Yıl" rules={[{ required: true }]}>
                <Select>
                  {yearOptions.map(y => <Select.Option key={y} value={y}>{y}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ay" label="Ay" rules={[{ required: true }]}>
                <Select>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <Select.Option key={m} value={m}>{m}. Ay</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="katsayi_tutari" label="Katsayı Tutarı (Baz Tutar)" rules={[{ required: true, message: 'Tutar giriniz' }]}>
                <InputNumber
                  className="w-full"
                  formatter={trMoneyFormatter}
                  parser={trNumberParser}
                  decimalSeparator=","
                  style={{ width: '100%' }}
                  min={0}
                  step={0.01}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tur" label="Tür" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="normal">Normal Aidat</Select.Option>
                  <Select.Option value="ara_odeme">Ara Ödeme / Ek Ödeme</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="gecikme_faiz_orani" label="Gecikme Faiz Oranı (%)" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="son_odeme_gunu" label="Son Ödeme Günü" rules={[{ required: true, message: 'Gün giriniz' }]}>
                <InputNumber min={1} max={31} className="w-full" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
