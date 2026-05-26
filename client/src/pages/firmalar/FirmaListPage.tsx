import React, { useState, useMemo, useEffect } from 'react'
import { Button, Form, Input, Select, Space, Switch, Tag, Modal, message, Row, Col, Statistic, Card, Typography, Grid } from 'antd'

const { useBreakpoint } = Grid
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, EditOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { useDebounce } from '../../hooks/useDebounce'
import { usePageSettings } from '../../contexts/LayoutContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useProject } from '../../contexts/ProjectContext'
import { formatIBAN, formatIBANInput, getIBANRaw, trMoneyFormatter, formatPhone, getPhoneRaw } from '../../lib/format'
import { DataTable } from '../../components/common/DataTable'
import { ErrorState } from '../../components/common/ErrorState'
import { HeaderActionsToolbar } from '../../components/common/HeaderActionsToolbar'
import { HeaderSearchPortal } from '../../components/common/HeaderSearchPortal'

interface Firma {
  id: string
  firma_tipi: 'yuklenici' | 'tedarikci'
  unvan: string
  vergi_no?: string
  vergi_dairesi?: string
  telefon?: string
  email?: string
  adres?: string
  iban?: string
  yetkili_kisi?: string
  notlar?: string
  aktif: boolean
  guncel_bakiye?: number
  toplam_teminat?: number
}

export const FirmaListPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canEdit } = usePermissions()
  const screens = useBreakpoint()
  // SSR-safe: ilk render screens={} → desktop varsay. Header search slot gear
  // ile çakıştığı için mobile'da Drawer'a taşınır.
  const isMobile = screens.md === false
  const [search, setSearch] = useState('')
  const [filterTip, setFilterTip] = useState<string | undefined>(undefined)
  const [filterAktif, setFilterAktif] = useState<string | undefined>('true')
  // 2026-05-15 UX: 300ms çok agresif — her harfte query tetikleyip loading state
  // kullanıcının yazımını "duraklatma" hissi veriyordu. 1000ms ile yazma akışı bitince
  // bir kez arama yapılır.
  const debouncedSearch = useDebounce(search, 1000)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Firma | null>(null)
  const [form] = Form.useForm()

  const { activeProject } = useProject()
  const activeProjectId = activeProject?.id ?? null

  // Modal kapandığında verileri sıfırla
  useEffect(() => {
    if (!isModalOpen) {
      setEditing(null)
      form.resetFields()
    }
  }, [isModalOpen, form])

  // OC-05 (sprint 20260511-ui-responsive-sprint extension):
  // HeaderActionsToolbar — primary=Yeni Firma, secondary=Tip+Aktif Select (search HARİÇ)
  //
  // Sprint 20260514 (PR #30/#33 sonrası kalıcı fix):
  //   Search Input artık <HeaderSearchPortal> ile sayfa-sahipli (page-owned) bir
  //   subtree'de render ediliyor — LayoutContext'in shallow (type + key) eşitlik
  //   bailout zincirinin dışında. Sebep: search'ı header secondary'sine koyup
  //   stateKey içine almak (PR #30) her keystroke'ta toolbar'ı unmount/mount
  //   ediyor (focus kaybı). Stale render koruması olarak getirilen fingerprint
  //   key'i tamamen kaldırmak ise (PR #14 ile geri eklenen) shallow check
  //   nedeniyle Input value'sunu donuk bırakıyor. Portal yaklaşımı her iki
  //   sorunu da çözer: search state'i sayfa subtree'sinde reconcile edilir,
  //   header re-mount zincirine girmez.
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (search) count++
    if (filterTip) count++
    if (filterAktif && filterAktif !== 'true') count++ // 'true' default kabul
    return count
  }, [search, filterTip, filterAktif])

  const primaryAction = useMemo(() => (
    <Button
      type="primary"
      size="small"
      icon={<PlusOutlined />}
      onClick={() => setIsModalOpen(true)}
      disabled={!canEdit}
      title={!canEdit ? 'Yetki yok' : undefined}
    >
      Yeni Firma
    </Button>
  ), [canEdit])

  const secondaryActions = useMemo(() => (
    <>
      <Select
        placeholder="Tip"
        value={filterTip}
        onChange={setFilterTip}
        allowClear
        style={{ width: 130 }}
        size="small"
      >
        <Select.Option value="yuklenici">Yüklenici</Select.Option>
        <Select.Option value="tedarikci">Tedarikçi</Select.Option>
      </Select>
      <Select
        placeholder="Durum"
        value={filterAktif}
        onChange={setFilterAktif}
        allowClear
        style={{ width: 110 }}
        size="small"
      >
        <Select.Option value="true">Aktif</Select.Option>
        <Select.Option value="false">Pasif</Select.Option>
      </Select>
    </>
  ), [filterTip, filterAktif])

  // Mobile Drawer içeriği — search Input dahil, vertical layout.
  // Header'daki search slot mobile'da gear ile çakıştığından (UyeListPage ile
  // aynı bug class) search Input Drawer'a taşınır. Aynı `search` state'ine
  // bağlı; aynı anda sadece bir Input mount oluyor (isMobile branch).
  const secondaryMobileActions = useMemo(() => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Input
        placeholder="Firma ara..."
        prefix={<SearchOutlined />}
        allowClear
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoComplete="off"
      />
      <Select
        placeholder="Tip"
        value={filterTip}
        onChange={setFilterTip}
        allowClear
        style={{ width: '100%' }}
      >
        <Select.Option value="yuklenici">Yüklenici</Select.Option>
        <Select.Option value="tedarikci">Tedarikçi</Select.Option>
      </Select>
      <Select
        placeholder="Durum"
        value={filterAktif}
        onChange={setFilterAktif}
        allowClear
        style={{ width: '100%' }}
      >
        <Select.Option value="true">Aktif</Select.Option>
        <Select.Option value="false">Pasif</Select.Option>
      </Select>
      {activeFilterCount > 0 && (
        <Button
          block
          onClick={() => {
            setSearch('')
            setFilterTip(undefined)
            setFilterAktif('true')
          }}
        >
          Filtreleri Temizle
        </Button>
      )}
    </Space>
  ), [search, filterTip, filterAktif, activeFilterCount])

  const headerActions = useMemo(() => {
    // stateKey artık SADECE discrete (Select) state'ler + filterCount'u içerir.
    // search ham metni key zincirinden ÇIKARILDI — keystroke'ta toolbar
    // remount olmaz. activeFilterCount search'a bağlı olduğundan boş↔dolu
    // geçişte 1 kez Badge sayısını güncellemek için key'e bağımlı kaldı
    // (Badge re-render için secondary güncellemesi yeter, ama eski pattern
    // korunarak Tip/Aktif değişimleriyle de prev'i kıralım).
    const stateKey = [filterTip || 'none', filterAktif || 'none', `f${activeFilterCount}`].join('|')
    return (
      <HeaderActionsToolbar
        key={`firma-list-${stateKey}`}
        primary={primaryAction}
        secondary={secondaryActions}
        secondaryMobile={secondaryMobileActions}
        filterCount={activeFilterCount}
        drawerTitle="Firma Filtreleri"
      />
    )
  }, [primaryAction, secondaryActions, secondaryMobileActions, activeFilterCount, filterTip, filterAktif])

  usePageSettings('Firma Listesi', headerActions)

  const { data: firmaData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['firmalar', debouncedSearch, filterTip, filterAktif, activeProjectId],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (debouncedSearch) params.search = debouncedSearch
      if (filterTip) params.firma_tipi = filterTip
      if (filterAktif) params.aktif = filterAktif
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get('/firmalar', { params })
      return data
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['firmalar-stats', activeProjectId],
    queryFn: async () => {
      const { data } = await api.get('/firmalar/stats', { params: { proje_id: activeProjectId } })
      return data.data
    },
    enabled: !!activeProjectId
  })

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (editing) {
        const { data } = await api.put(`/firmalar/${editing.id}`, values)
        return data
      }
      const { data } = await api.post('/firmalar', values)
      return data
    },
    onSuccess: () => {
      message.success(editing ? 'Firma güncellendi' : 'Firma eklendi')
      queryClient.invalidateQueries({ queryKey: ['firmalar'] })
      setIsModalOpen(false)
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const openEdit = (firma: Firma) => {
    setEditing(firma)
    form.setFieldsValue(firma)
    setIsModalOpen(true)
  }

  const columns = [
    { 
      title: 'Ünvan', 
      dataIndex: 'unvan', 
      key: 'unvan',
      sorter: true 
    },
    {
      title: 'Tip',
      dataIndex: 'firma_tipi',
      key: 'firma_tipi',
      width: 100,
      render: (t: string) => (
        <Tag color={t === 'yuklenici' ? 'blue' : 'purple'}>
          {t === 'yuklenici' ? 'Yüklenici' : 'Tedarikçi'}
        </Tag>
      ),
    },
    {
      title: 'Cari Bakiye',
      dataIndex: 'guncel_bakiye',
      key: 'bakiye',
      align: 'right' as const,
      width: 150,
      render: (v: number) => (
        <div style={{ 
          background: '#f0f9ff', 
          padding: '4px 8px', 
          borderRadius: '6px', 
          fontWeight: 600,
          color: v >= 0 ? '#0369a1' : '#b91c1c'
        }}>
          {trMoneyFormatter(v)} TL
        </div>
      )
    },
    {
      title: 'Birikmiş Teminat',
      dataIndex: 'toplam_teminat',
      key: 'teminat',
      align: 'right' as const,
      width: 150,
      render: (v: number) => (
        <div style={{ 
          background: '#f8fafc', 
          padding: '4px 8px', 
          borderRadius: '6px', 
          border: '1px solid #e2e8f0',
          fontWeight: 600,
          color: '#475569'
        }}>
          {trMoneyFormatter(v)} TL
        </div>
      )
    },
    { 
      title: 'Telefon', 
      dataIndex: 'telefon', 
      key: 'telefon', 
      width: 130,
      render: (v: string) => formatPhone(v)
    },
    {
      title: 'IBAN',
      dataIndex: 'iban',
      key: 'iban',
      width: 250,
      render: (v: string) => v ? (
        <Typography.Text copyable={{ text: getIBANRaw(v), tooltips: ['Kopyala (Sadece Rakamlar)', 'Kopyalandı!'] }}>
          {formatIBAN(v)}
        </Typography.Text>
      ) : '-'
    },
    {
      title: 'Durum',
      dataIndex: 'aktif',
      key: 'aktif',
      width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Aktif' : 'Pasif'}</Tag>,
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 100,
      render: (_: unknown, record: Firma) => (
        <Space>
          <Button 
            icon={<EyeOutlined />} 
            type="text" 
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/firmalar/${record.id}`)
            }} 
          />
          <Button
            icon={<EditOutlined />}
            type="text"
            disabled={!canEdit}
            title={!canEdit ? 'Yetki yok' : 'Düzenle'}
            onClick={(e) => {
              e.stopPropagation()
              openEdit(record)
            }}
          />
        </Space>
      ),
    },
  ]

  return (
    <div className="animate-in fade-in duration-500">
      {/*
        Desktop: Header'a portal'lanan search input — bkz. HeaderSearchPortal jsdoc.
        Mobile (<768px): Portal hiç render edilmez; search Input HeaderActionsToolbar
        Drawer'ı (secondaryMobile) içinde sunulur. Gerekçe: 220px header search slot
        mobile'da sağdaki settings gear (40x40) ile çakışıyordu. Aynı state'e bağlı
        Drawer içindeki Input keystroke davranışında portal'a ihtiyaç duymaz.
      */}
      {!isMobile && (
        <HeaderSearchPortal>
          <Input
            placeholder="Firma ara..."
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
            size="small"
          />
        </HeaderSearchPortal>
      )}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Hakediş (Matrah)</span>} 
                value={stats?.toplam_hakedis || 0} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#1677ff', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: '11px' }}>KDVli: </Typography.Text>
                <Typography.Text strong style={{ fontSize: '15px', color: '#1677ff' }}>{trMoneyFormatter(stats?.toplam_kdvli || 0)} TL</Typography.Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Gelen Faturalar</span>} 
                value={stats?.toplam_fatura || 0} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#faad14', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Fatura Açığı: </Typography.Text>
                <Typography.Text strong style={{ fontSize: '12px', color: (stats?.toplam_fatura || 0) - (stats?.toplam_kdvli || 0) < 0 ? '#b91c1c' : '#faad14' }}>
                  {trMoneyFormatter((stats?.toplam_fatura || 0) - (stats?.toplam_kdvli || 0))} TL
                </Typography.Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Birikmiş Teminat</span>} 
              value={stats?.birikmis_teminat || 0} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#722ed1', fontSize: '15px', fontWeight: 'bold' } }}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Net Kalan Teminat</Typography.Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Toplam Ödeme</span>} 
              value={stats?.toplam_odeme || 0} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '15px', fontWeight: 'bold' } }}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Yapılan Toplam Ödeme</Typography.Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={24} lg={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic 
              title={<span style={{ fontSize: '12px', fontWeight: 'bold' }}>Cari Bakiye</span>} 
              value={stats?.bakiye || 0} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: (stats?.bakiye || 0) < 0 ? '#cf1322' : '#1677ff', fontSize: '20px', fontWeight: 'bold' } }}
            />
            <div style={{ borderTop: '1px solid #ddecff', marginTop: 4, paddingTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: '11px' }}>Ödeme - KDVli Tutar</Typography.Text>
            </div>
          </Card>
        </Col>
      </Row>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Card variant="borderless" styles={{ body: { padding: 0 } }} className="shadow-sm overflow-hidden rounded-xl">
          <DataTable
            columns={columns}
            dataSource={firmaData?.data}
            rowKey="id"
            loading={isLoading}
            totalItems={firmaData?.pagination?.totalCount}
            stickyFirstColumn /* A2-03: firma adı kolonu sticky */
            onRow={(record) => ({
              onClick: () => navigate(`/firmalar/${record.id}`),
              style: { cursor: 'pointer' }
            })}
          />
        </Card>
      )}

      <Modal
        title={editing ? 'Firma Düzenle' : 'Yeni Firma'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width="min(640px, 95vw)"
        destroyOnHidden
        okText="Kaydet"
        cancelText="İptal"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => saveMutation.mutate(v)}
          style={{ marginTop: 16 }}
          validateTrigger={["onBlur", "onChange"]}
          autoComplete="off"
        >
          <Form.Item name="firma_tipi" label="Firma Tipi" rules={[{ required: true, message: 'Tip seçin' }]}>
            <Select>
              <Select.Option value="yuklenici">Yüklenici</Select.Option>
              <Select.Option value="tedarikci">Tedarikçi</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="unvan" label="Ünvan" rules={[{ required: true, message: 'Ünvan zorunlu' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            {/* C1 (sprint 20260511-uye-tahsilat-firma-revisions): vergi_no tam 10 hane rakam */}
            <Form.Item
              name="vergi_no"
              label="Vergi No"
              style={{ flex: 1 }}
              normalize={(v?: string) => (v ? v.replace(/\D/g, '').slice(0, 10) : v)}
              rules={[
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve()
                    if (!/^\d{10}$/.test(value)) {
                      return Promise.reject(new Error('Vergi No 10 haneli rakam olmalı'))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <Input
                autoComplete="off"
                inputMode="numeric"
                maxLength={10}
                placeholder="10 haneli rakam"
              />
            </Form.Item>
            <Form.Item name="vergi_dairesi" label="Vergi Dairesi" style={{ flex: 1 }}>
              <Input autoComplete="off" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
               name="telefon"
               label="Telefon"
               style={{ flex: 1 }}
               rules={[
                 {
                   validator: (_, value) => {
                     if (!value) return Promise.resolve()
                     const clean = getPhoneRaw(value)
                     if (clean.length !== 10) {
                       return Promise.reject('Lütfen 10 haneli telefon numarasını giriniz (örn: 5xx xxx xx xx)')
                     }
                     return Promise.resolve()
                   }
                 }
               ]}
               getValueFromEvent={(e) => formatPhone(e.target.value)}
             >
              <Input autoComplete="off" placeholder="5xx xxx xx xx" maxLength={13} />
            </Form.Item>
            <Form.Item name="email" label="E-posta" rules={[{ type: 'email', message: 'Geçerli e-posta girin' }]} style={{ flex: 1 }}>
              <Input autoComplete="off" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="yetkili_kisi" label="Yetkili Kişi" style={{ flex: 1 }}>
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="iban"
              label="IBAN"
              style={{ flex: 1 }}
              rules={[
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve()
                    const clean = value.replace(/\s/g, '')
                    if (clean.length !== 26) {
                      return Promise.reject('IBAN TR dahil 26 karakter olmalıdır')
                    }
                    return Promise.resolve()
                  }
                }
              ]}
            >
              <Input
                autoComplete="off"
                maxLength={34}
                placeholder="TR..."
                onChange={(e) => {
                  const formatted = formatIBANInput(e.target.value)
                  form.setFieldsValue({ iban: formatted })
                }}
              />
            </Form.Item>
          </div>
          <Form.Item name="adres" label="Adres">
            <Input.TextArea autoComplete="off" rows={2} />
          </Form.Item>
          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea autoComplete="off" rows={2} />
          </Form.Item>
          <Form.Item name="aktif" label="Aktif" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
