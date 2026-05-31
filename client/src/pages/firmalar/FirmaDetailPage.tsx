import React, { useMemo } from 'react'
import { Card, Descriptions, Tabs, Tag, Table, Button, Space, Row, Col, Statistic, Typography, Popconfirm, message, App, Modal, Tooltip } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, FileTextOutlined, DollarOutlined, SolutionOutlined, FileSearchOutlined, EditOutlined, InfoCircleOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'
import { formatIBAN, getIBANRaw, trMoneyFormatter, formatPhone } from '../../lib/format'
import { usePermissions } from '../../hooks/usePermissions'
import { useProject } from '../../contexts/ProjectContext'

interface Sozlesme {
  id: string
  sozlesme_no?: string
  konu: string
  toplam_tutar: number
  baslangic_tarihi?: string
  bitis_tarihi?: string
  teminat_orani: number
  stopaj_orani: number
}

const durumRenk: Record<string, string> = {
  taslak: 'default',
  onaylandi: 'blue',
  odendi: 'green',
  iptal: 'red',
}

const { Text } = Typography

export const FirmaDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canEdit, canDelete } = usePermissions()
  const { message: messageApi } = App.useApp()
  const { activeProject } = useProject()
  const activeProjectId = activeProject?.id ?? null

  // --- Mutations ---
  
  const undoMatchMutation = useMutation({
    mutationFn: async (movementId: string) => {
      const { data } = await api.post(`/cari-hareketler/${movementId}/undo-closure`)
      return data
    },
    onSuccess: () => {
      messageApi.success('Eşleşme başarıyla kaldırıldı')
      queryClient.invalidateQueries({ queryKey: ['firma', id] })
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
      queryClient.invalidateQueries({ queryKey: ['firma-stats'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const unapproveMutation = useMutation({
    mutationFn: async (hakedisId: string) => {
      return api.put(`/hakedisler/${hakedisId}/onay-iptal`)
    },
    onSuccess: () => {
      messageApi.success('Hakediş onayı iptal edildi ve cari hareketi silindi.')
      queryClient.invalidateQueries({ queryKey: ['hakedisler'] })
      queryClient.invalidateQueries({ queryKey: ['firma-stats'] })
      queryClient.invalidateQueries({ queryKey: ['cari-ekstre'] })
    },
    onError: (err) => messageApi.error(getErrorMessage(err, 'İşlem başarısız')),
  })

  // --- Queries ---

  const { data: firma, isLoading: firmaLoading } = useQuery({
    queryKey: ['firma', id, activeProjectId],
    queryFn: async () => {
      // Owner-bazlı: proje_id ile sahiplik doğrulanır (başka owner'ın firması → 404).
      const params: any = {}
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get(`/firmalar/${id}`, { params })
      return data.data
    },
    enabled: !!activeProjectId,
  })

  const { data: sozlesmeler, isLoading: sozlesmeLoading } = useQuery({
    queryKey: ['sozlesmeler', { firma_id: id, activeProjectId }],
    queryFn: async () => {
      const params: any = { firma_id: id }
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get('/sozlesmeler', { params })
      return data.data
    },
  })

  const { data: hakedisler, isLoading: hakedisLoading } = useQuery({
    queryKey: ['hakedisler', { firma_id: id, activeProjectId }],
    queryFn: async () => {
      const params: any = { firma_id: id, limit: 1000 }
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get('/hakedisler', { params })
      return (data.data || []) as any[]
    },
  })

  const { data: faturalar, isLoading: faturaLoading } = useQuery({
    queryKey: ['faturalar', { firma_id: id, activeProjectId }],
    queryFn: async () => {
      const params: any = { firma_id: id, limit: 1000 }
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get('/faturalar', { params })
      return (data.data || []) as any[]
    },
  })

  const { data: cariData, isLoading: cariLoading } = useQuery({
    queryKey: ['cari-ekstre', id, activeProjectId],
    queryFn: async () => {
      const params: any = {}
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get(`/firmalar/${id}/cari-ekstre`, { params })
      return data.data
    },
  })

  const { data: statsData } = useQuery({
    queryKey: ['firma-stats', id, activeProjectId],
    queryFn: async () => {
      const params: any = {}
      if (activeProjectId) params.proje_id = activeProjectId
      const { data } = await api.get(`/firmalar/${id}/stats`, { params })
      return data.data
    },
    enabled: !!id
  })

  // --- Column Definitions ---

  // xs (<576px) için kolon stratejisi: kritik bilgi (No, Konu, Toplam Tutar, İşlem)
  // her zaman görünür; oran (Teminat/Stopaj) md+, tarih sm+ breakpoint'inde.
  const sozlesmeColumns = [
    { title: 'Sözleşme No', dataIndex: 'sozlesme_no', key: 'sozlesme_no', width: 90 },
    { title: 'Konu', dataIndex: 'konu', key: 'konu', ellipsis: true },
    {
      title: 'Toplam Tutar',
      dataIndex: 'toplam_tutar',
      key: 'toplam_tutar',
      align: 'right' as const,
      width: 130,
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: 'Teminat',
      dataIndex: 'teminat_orani',
      key: 'teminat_orani',
      align: 'right' as const,
      width: 80,
      responsive: ['md'] as ('md')[],
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Stopaj',
      dataIndex: 'stopaj_orani',
      key: 'stopaj_orani',
      align: 'right' as const,
      width: 80,
      responsive: ['md'] as ('md')[],
      render: (v: number) => `%${v}`,
    },
    {
      title: 'Tarih',
      key: 'tarih',
      width: 180,
      responsive: ['sm'] as ('sm')[],
      render: (_: unknown, r: Sozlesme) => {
        const start = r.baslangic_tarihi ? dayjs(r.baslangic_tarihi).format('DD.MM.YYYY') : '-'
        const end = r.bitis_tarihi ? dayjs(r.bitis_tarihi).format('DD.MM.YYYY') : '-'
        return `${start} - ${end}`
      },
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 60,
      fixed: 'right' as const,
      render: (_: unknown, r: Sozlesme) => (
        <Tooltip title="Sözleşmeyi Görüntüle">
          <Button
            icon={<FileTextOutlined />}
            type="text"
            size="small"
            onClick={() => navigate(`/sozlesmeler/${r.id}`)}
          />
        </Tooltip>
      ),
    },
  ]

  // xs (<576px) görünür: No, Net Ödeme, Durum, İşlem.
  // sm+: Dönem, Matrah eklenir. md+: Onay Tarihi, Hakediş Toplamı (KDVli).
  // lg+: Teminat, Stopaj.
  const hakedisColumns = [
    { title: 'No', dataIndex: 'hakedis_no', key: 'no', width: 60 },
    { title: 'Dönem', key: 'donem', width: 90, responsive: ['sm'] as ('sm')[], render: (_: any, r: any) => r.donem_ay ? `${r.donem_ay}/${r.donem_yil}` : dayjs(r.donem_baslangic).format('MM/YYYY') },
    { title: 'Onay Tarihi', dataIndex: 'onay_tarihi', key: 'onay_tarihi', width: 110, responsive: ['md'] as ('md')[], render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-' },
    { title: 'Matrah', key: 'brut', align: 'right' as const, width: 130, responsive: ['sm'] as ('sm')[], render: (_: any, r: any) => <MoneyDisplay amount={r.ara_toplam || r.brut_tutar || 0} /> },
    { title: 'Hakediş Toplamı (KDVli)', key: 'kdvli', align: 'right' as const, width: 150, responsive: ['md'] as ('md')[], render: (_: any, r: any) => <MoneyDisplay amount={r.hakedis_toplam || (Number(r.ara_toplam || r.brut_tutar || 0) + Number(r.kdv_tutar || 0))} /> },
    { title: 'Teminat', dataIndex: 'teminat_kesintisi', key: 'teminat', align: 'right' as const, width: 110, responsive: ['lg'] as ('lg')[], render: (v: number) => <MoneyDisplay amount={v} colored /> },
    { title: 'Stopaj', dataIndex: 'stopaj_kesintisi', key: 'stopaj', align: 'right' as const, width: 90, responsive: ['sm'] as ('sm')[], render: (v: number) => <MoneyDisplay amount={v} colored /> },
    { title: 'Net Ödeme', dataIndex: 'net_tutar', key: 'net', align: 'right' as const, width: 130, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Durum', dataIndex: 'durum', key: 'durum', width: 100, render: (d: string) => <Tag color={durumRenk[d] || 'default'}>{d.toUpperCase()}</Tag> },
    { 
      title: 'İşlem', 
      key: 'action', 
      fixed: 'right' as const,
      width: 80,
      render: (_: any, r: any) => (
        <Space size="small">
          <Tooltip title="Görüntüle">
            <Button icon={<FileSearchOutlined />} type="text" size="small" onClick={() => navigate(`/hakedisler/${r.id}`)} />
          </Tooltip>
          {r.durum === 'taslak' && canEdit && (
            <Tooltip title="Düzenle">
              <Button icon={<EditOutlined />} type="text" size="small" onClick={() => navigate(`/hakedisler/${r.id}?edit=true`)} />
            </Tooltip>
          )}
          {r.durum === 'onaylandi' && canDelete && (
            <Popconfirm
              title="Hakediş onayı iptal edilecek ve cari hareketi silinecek. Emin misiniz?"
              onConfirm={() => unapproveMutation.mutate(r.id)}
              okText="Evet"
              cancelText="Hayır"
            >
              <Tooltip title="Onay İptal (Revizyona Aç)">
                <Button
                  icon={<RollbackOutlined />}
                  type="text"
                  danger
                  size="small"
                  loading={unapproveMutation.isPending && unapproveMutation.variables === r.id}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ) 
    },
  ]

  const faturaColumns = [
    { title: 'Fatura No', dataIndex: 'fatura_no', key: 'no' },
    { title: 'Tarih', dataIndex: 'fatura_tarihi', key: 'tarih', render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    { title: 'Tutar', dataIndex: 'toplam_tutar', key: 'tutar', align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} /> },
    { title: 'Tip', dataIndex: 'fatura_tipi', key: 'tip', render: (t: string) => <Tag color={t === 'gelen' ? 'red' : 'green'}>{t.toUpperCase()}</Tag> },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: unknown, r: any) => (
        <Tooltip title="Faturayı Görüntüle">
          <Button icon={<FileTextOutlined />} type="text" onClick={() => navigate(`/faturalar?fatura=${r.id}`)} />
        </Tooltip>
      ),
    },
  ]

  // xs (<576px) görünür: Tarih, İşlem Türü, Bakiye.
  // sm+: Borç, Alacak. md+: Açıklama.
  // Sütun genişlikleri kompaktlaştırıldı (kullanıcı isteği 2026-05-24): tablo
  // sayfa kenarına kadar açılır, scroll'a düşmesin diye işlem türü 130→95,
  // tarih 100→90, borç/alacak/bakiye 110→100.
  const cariColumns = [
    { title: 'Tarih', dataIndex: 'tarih', key: 'tarih', width: 90, render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
    {
      title: 'İşlem Türü',
      key: 'islem_turu',
      width: 95,
      render: (_: any, r: any) => {
        // Hakediş satırı mı ve bu hakedişe bağlı ödeme var mı kontrol et
        const isHakedis = r.islem_turu === 'hakedis';
        // kaynak_id hakedis satırında hakedis.id'yi tutuyor. 
        // Ödemelerde de kaynak_id hakedis.id'yi tutuyor.
        const hasMatchedPayments = isHakedis && r.kaynak_id && cumulativeCariData?.some((m: any) => m.kaynak_id === r.kaynak_id && m.islem_turu !== 'hakedis');

        return (
          <Space orientation="vertical" size={2}>
            <Space>
              <Tag>{r.islem_turu?.toUpperCase()}</Tag>
              {hasMatchedPayments && (
                <Popconfirm
                  title="Eşleşmeyi Kaldır"
                  description="Bu hakedişe bağlı tüm ödemeler serbest bırakılacaktır. Emin misiniz?"
                  onConfirm={() => undoMatchMutation.mutate(r.kaynak_id!)}
                  okText="Evet, Kaldır"
                  cancelText="Vazgeç"
                >
                  <Tooltip title="Eşleşmeyi Geri Al">
                    <Button 
                      type="text" 
                      size="small" 
                      danger 
                      icon={<RollbackOutlined />} 
                      loading={undoMatchMutation.isPending && undoMatchMutation.variables === r.kaynak_id}
                    />
                  </Tooltip>
                </Popconfirm>
              )}
            </Space>
          </Space>
        )
      },
    },
    { title: 'Açıklama', dataIndex: 'aciklama', key: 'aciklama', responsive: ['md'] as ('md')[], ellipsis: true },
    { title: 'Borç', dataIndex: 'borc', key: 'borc', width: 100, align: 'right' as const, responsive: ['sm'] as ('sm')[], render: (v: number) => (v && v > 0) ? <span style={{ color: '#cf1322' }}><MoneyDisplay amount={v} /></span> : '-' },
    { title: 'Alacak', dataIndex: 'alacak', key: 'alacak', width: 100, align: 'right' as const, responsive: ['sm'] as ('sm')[], render: (v: number) => (v && v > 0) ? <span style={{ color: '#3f8600' }}><MoneyDisplay amount={v} /></span> : '-' },
    { title: 'Bakiye', dataIndex: 'bakiye', key: 'bakiye', width: 100, align: 'right' as const, render: (v: number) => <MoneyDisplay amount={v} colored /> },
  ]

  // --- Calculations ---

  const stats = useMemo(() => {
    if (statsData) {
      return {
        toplamMatrah: statsData.toplam_hakedis,
        toplamKdvli: statsData.toplam_kdvli,
        toplamTeminat: statsData.birikmis_teminat,
        toplamOdeme: statsData.toplam_odeme,
        toplamFatura: statsData.toplam_fatura,
        faturaAcigi: statsData.fatura_acigi,
        cariBakiye: statsData.bakiye
      }
    }
    return { toplamMatrah: 0, toplamKdvli: 0, toplamTeminat: 0, toplamOdeme: 0, toplamFatura: 0, faturaAcigi: 0, cariBakiye: 0 }
  }, [statsData])

  const cumulativeCariData = useMemo(() => {
    if (!cariData?.hareketler) return []
    let bakiye = 0
    return cariData.hareketler
      .filter((h: any) => h.islem_turu === 'hakedis' || h.islem_turu === 'giden_odeme' || h.islem_turu === 'odeme')
      .map((h: any) => {
        const borc = Number(h.borc || 0)
        const alacak = Number(h.alacak || 0)
        bakiye += (alacak - borc)
        return { ...h, bakiye }
      })
  }, [cariData])

  // --- Render ---

  if (firmaLoading) return <Card loading variant="borderless" />

  return (
    <div>
      <PageHeader
        title={firma ? firma.unvan : 'Firma Detayı'}
        onBack={() => navigate('/firmalar')}
      />

      {/* 7 Kartlı Tek Satır Düzeni */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Hakediş (Matrah)</span>} 
                value={stats.toplamMatrah} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#1677ff', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>KDVli: </Text>
                <Text strong style={{ fontSize: '15px', color: '#1677ff' }}>{trMoneyFormatter(stats.toplamKdvli)} TL</Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Space orientation="vertical" size={0} style={{ width: '100%' }}>
              <Statistic 
                title={<span style={{ fontSize: '12px' }}>Gelen Faturalar</span>} 
                value={stats.toplamFatura} 
                formatter={(v) => trMoneyFormatter(v as number)}
                styles={{ content: { color: '#faad14', fontSize: '15px', fontWeight: 'bold' } }}
              />
              <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>Fatura Açığı: </Text>
                <Text strong style={{ fontSize: '12px', color: stats.faturaAcigi < 0 ? '#b91c1c' : '#faad14' }}>
                  {trMoneyFormatter(stats.faturaAcigi)} TL
                </Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Birikmiş Teminat</span>} 
              value={stats.toplamTeminat} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#722ed1', fontSize: '15px', fontWeight: 'bold' } }}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '11px' }}>Net Kalan Teminat</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={4}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small">
            <Statistic 
              title={<span style={{ fontSize: '12px' }}>Toplam Ödeme</span>} 
              value={stats.toplamOdeme} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: '#3f8600', fontSize: '15px', fontWeight: 'bold' } }}
            />
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 4, paddingTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '11px' }}>Yapılan Toplam Ödeme</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={24} lg={8}>
          <Card variant="borderless" className="stat-card shadow-sm" size="small" style={{ background: '#f0f5ff' }}>
            <Statistic 
              title={<span style={{ fontSize: '12px', fontWeight: 'bold' }}>Cari Bakiye</span>} 
              value={stats.cariBakiye} 
              formatter={(v) => trMoneyFormatter(v as number)}
              styles={{ content: { color: stats.cariBakiye < 0 ? '#cf1322' : '#1677ff', fontSize: '20px', fontWeight: 'bold' } }}
            />
            <div style={{ borderTop: '1px solid #ddecff', marginTop: 4, paddingTop: 4 }}>
              <Text type="secondary" style={{ fontSize: '11px' }}>Ödeme - KDVli Tutar</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          defaultActiveKey="info"
          style={{ padding: '0 24px 24px' }}
          items={[
            {
              key: 'info',
              label: <Space><InfoCircleOutlined />Firma Bilgileri</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  {firma && (
                    <Descriptions bordered column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
                      <Descriptions.Item label="Tip">
                        <Tag color={firma.firma_tipi === 'yuklenici' ? 'blue' : 'purple'}>
                          {firma.firma_tipi === 'yuklenici' ? 'Yüklenici' : 'Tedarikçi'}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Durum">
                        <Tag color={firma.aktif ? 'green' : 'default'}>{firma.aktif ? 'Aktif' : 'Pasif'}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Vergi No">{firma.vergi_no || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Vergi Dairesi">{firma.vergi_dairesi || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Telefon">{formatPhone(firma.telefon) || '-'}</Descriptions.Item>
                      <Descriptions.Item label="E-posta">{firma.email || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Yetkili Kişi">{firma.yetkili_kisi || '-'}</Descriptions.Item>
                      <Descriptions.Item label="IBAN" span={2}>
                        {firma.iban ? (
                          <Typography.Text copyable={{ text: getIBANRaw(firma.iban), tooltips: ['Kopyala (Sadece Rakamlar)', 'Kopyalandı!'] }}>
                            {formatIBAN(firma.iban)}
                          </Typography.Text>
                        ) : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Adres" span={2}>{firma.adres || '-'}</Descriptions.Item>
                      {firma.notlar && <Descriptions.Item label="Notlar" span={2}>{firma.notlar}</Descriptions.Item>}
                    </Descriptions>
                  )}
                </div>
              ),
            },
            {
              key: 'sozlesmeler',
              label: <Space><SolutionOutlined />Sözleşmeler ({sozlesmeler?.length || 0})</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      disabled={!canEdit}
                      title={!canEdit ? 'Yetki yok' : undefined}
                      onClick={() => navigate(`/sozlesmeler/yeni?firma_id=${id}`)}
                    >
                      Yeni Sözleşme
                    </Button>
                  </div>
                  <Table columns={sozlesmeColumns} dataSource={sozlesmeler} rowKey="id" loading={sozlesmeLoading} pagination={false} size="small" scroll={{ x: 'max-content' }} />
                </div>
              ),
            },
            {
              key: 'hakedisler',
              label: <Space><FileSearchOutlined />Hakedişler ({hakedisler?.length || 0})</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <Table columns={hakedisColumns} dataSource={hakedisler} rowKey="id" loading={hakedisLoading} size="small" scroll={{ x: 'max-content' }} />
                </div>
              ),
            },
            {
              key: 'faturalar',
              label: <Space><FileTextOutlined />Faturalar ({faturalar?.length || 0})</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <Table columns={faturaColumns} dataSource={faturalar} rowKey="id" loading={faturaLoading} size="small" />
                </div>
              ),
            },
            {
              key: 'cari',
              label: <Space><DollarOutlined />Cari Ekstre</Space>,
              children: (
                <div style={{ paddingTop: 16 }}>
                  <Table columns={cariColumns} dataSource={cumulativeCariData} rowKey="id" loading={cariLoading} pagination={false} size="small" scroll={{ x: 'max-content' }} />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
