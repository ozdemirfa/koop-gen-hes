import React, { useState, useMemo } from 'react'
import { Button, Modal, Form, Input, InputNumber, Tag, Space, Card, Row, Col, Select, Typography, App } from 'antd'
import { EditOutlined, ArrowLeftOutlined, UserAddOutlined, UserDeleteOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { DataTable } from '../../components/common/DataTable'
import { trNumberFormatter, trNumberParser, trMoneyFormatter } from '../../lib/format'

const { Text } = Typography

interface Serefiye {
  id: string
  proje_id: string
  blok_id: string
  daire_no: string
  daire_sira_no: number
  kat?: number
  yon?: string
  m2?: number
  oda_sayisi?: string
  serefiye_orani: number
  durum: 'bos' | 'dolu'
  uye_id?: string
  bloklar?: { blok_adi: string }
  uyeler?: { ad: string; soyad: string; uye_no: string }
}

export const SerefiyePage: React.FC = () => {
  const { id: projeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [uyeModalOpen, setUyeModalOpen] = useState(false)
  const [editingSerefiye, setEditingSerefiye] = useState<Serefiye | null>(null)
  const [form] = Form.useForm()
  const [uyeForm] = Form.useForm()
  const { message: messageApi, modal } = App.useApp()

  const { data: proje } = useQuery({
    queryKey: ['proje', projeId],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${projeId}`)
      return data.data
    },
  })

  const { data: serefiyeList, isLoading: serefiyeLoading } = useQuery({
    queryKey: ['serefiye-list', projeId],
    queryFn: async () => {
      const { data } = await api.get(`/projeler/${projeId}/serefiye`)
      return data.data as Serefiye[]
    },
  })

  // Boşta olan (daire atanmamış) üyeleri getir
  const { data: bostaUyeler } = useQuery({
    queryKey: ['bosta-uyeler', projeId],
    queryFn: async () => {
      const { data } = await api.get('/uyeler', { params: { proje_id: projeId, has_daire: 'false', durum: 'aktif' } })
      return data.data as any[]
    },
    enabled: uyeModalOpen
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      return await api.put(`/projeler/serefiye/${editingSerefiye?.id}`, values)
    },
    onSuccess: () => {
      messageApi.success('Daire bilgileri güncellendi')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
      setModalOpen(false)
      setEditingSerefiye(null)
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const assignUyeMutation = useMutation({
    mutationFn: async ({ serefiyeId, uyeId }: { serefiyeId: string, uyeId: string | null }) => {
      return await api.put(`/projeler/serefiye/${serefiyeId}`, { uye_id: uyeId, durum: uyeId ? 'dolu' : 'bos' })
    },
    onSuccess: () => {
      messageApi.success('Üyelik ataması güncellendi')
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
      queryClient.invalidateQueries({ queryKey: ['uyeler'] })
      queryClient.removeQueries({ queryKey: ['bosta-uyeler', projeId] })
      setUyeModalOpen(false)
      setEditingSerefiye(null)
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const handleRefresh = () => {
    modal.confirm({
      title: 'Tabloyu Yenile',
      content: 'Bu işlem mevcut TÜM şerefiye kayıtlarını silecek ve blok tanımlarına göre yeniden oluşturacaktır. Manuel girdiğiniz tüm oranlar, kat ve yön bilgileri KAYBOLACAKTIR. Emin misiniz?',
      okText: 'Evet, Yenile',
      okType: 'danger',
      cancelText: 'Vazgeç',
      onOk: async () => {
        try {
          await api.post(`/projeler/serefiye-actions/yenile`, { projeId })
          messageApi.success('Şerefiye tablosu yenilendi')
          queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
        } catch (err) {
          messageApi.error(getErrorMessage(err))
        }
      }
    })
  }

  const handleClear = () => {
    modal.confirm({
      title: 'Tabloyu Sil',
      content: 'Şerefiye tablosundaki tüm veriler silinecektir. Dolu (üye atanmış) daire varsa işlem yapılamaz. Emin misiniz?',
      okText: 'Evet, Sil',
      okType: 'danger',
      cancelText: 'Vazgeç',
      onOk: async () => {
      try {
        await api.post(`/projeler/serefiye-actions/temizle`, { projeId })
        messageApi.success('Şerefiye tablosu silindi')
        queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
      } catch (err) {
        messageApi.error(getErrorMessage(err))
      }
      }    })
  }

  const handleCsvDownload = async () => {
    try {
      const { data } = await api.get(`/projeler/${projeId}/serefiye/export`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `serefiye_tablosu_${projeId}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      messageApi.error('CSV indirilirken hata oluştu')
    }
  }

  const handleCsvUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post(`/projeler/${projeId}/serefiye/import`, formData)
      const { updated = 0, failed = 0, total = 0 } = data?.data || {}
      if (failed > 0) {
        messageApi.warning(`${updated}/${total} daire güncellendi · ${failed} satır başarısız (sunucu log'unda detay)`)
      } else {
        messageApi.success(`${updated} daire güncellendi`)
      }
      queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
    } catch (err) {
      messageApi.error(getErrorMessage(err))
    }
    return false
  }

  const actions = useMemo(() => (
    <Space orientation="horizontal">
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(`/projeler/${projeId}`)}
        type="text"
      />
      <Button 
        type="primary" 
        onClick={async () => {
          try {
            await api.post(`/projeler/serefiye-actions/olustur`, { projeId })
            messageApi.success('Şerefiye tablosu oluşturuldu')
            queryClient.invalidateQueries({ queryKey: ['serefiye-list', projeId] })
          } catch (err) {
            messageApi.error(getErrorMessage(err))
          }
        }} 
        disabled={serefiyeList && serefiyeList.length > 0}
        style={{ backgroundColor: '#1890ff', color: '#52c41a', fontWeight: 'bold' }}
      >
        Tabloyu Oluştur
      </Button>

      {serefiyeList && serefiyeList.length > 0 && (
        <Button danger onClick={handleClear}>
          Tabloyu Sil
        </Button>
      )}
    </Space>
  ), [navigate, projeId, serefiyeList])

  const rightActions = useMemo(() => (
    <Space>
      <Button 
        icon={<DownloadOutlined />} 
        onClick={handleCsvDownload}
        title="CSV İndir"
      >
        CSV İndir
      </Button>
      <label htmlFor="csv-upload" style={{ cursor: 'pointer' }}>
        <Button 
          icon={<UploadOutlined />} 
          onClick={() => document.getElementById('csv-upload')?.click()}
          title="CSV Yükle"
        >
          CSV Yükle
        </Button>
        <input
          id="csv-upload"
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleCsvUpload(file)
            e.target.value = ''
          }}
        />
      </label>
    </Space>
  ), [projeId])

  usePageSettings('Şerefiye Tablosu', actions, rightActions)

  const columns = [
    {
      title: 'Blok',
      dataIndex: ['bloklar', 'blok_adi'],
      key: 'blok',
      width: 100,
      sorter: (a: any, b: any) => (a.bloklar?.blok_adi || '').localeCompare(b.bloklar?.blok_adi || '')
    },
    {
      title: 'Daire No',
      dataIndex: 'daire_sira_no',
      key: 'daire_sira_no',
      width: 70,
      sorter: (a: any, b: any) => (Number(a.daire_sira_no) || 0) - (Number(b.daire_sira_no) || 0)
    },
    {
      title: 'Daire Kod',
      dataIndex: 'daire_no',
      key: 'daire_no',
      width: 100,
      sorter: (a: any, b: any) => (a.daire_no || '').localeCompare(b.daire_no || '')
    },
    { title: 'Kat', dataIndex: 'kat', key: 'kat', width: 70, sorter: (a: any, b: any) => (a.kat || 0) - (b.kat || 0) },
    { title: 'Yön', dataIndex: 'yon', key: 'yon', width: 100 },
    {
      title: 'm2',
      dataIndex: 'm2',
      key: 'm2',
      width: 90,
      render: (v: number) => v ? `${trMoneyFormatter(v)} m²` : '-'
    },
    {
      title: 'Oda Sayısı',
      dataIndex: 'oda_sayisi',
      key: 'oda_sayisi',
      width: 90,
      render: (v: string) => v || '-'
    },
    { title: 'Oran', dataIndex: 'serefiye_orani', key: 'oran', width: 90, render: (v: number) => trMoneyFormatter(v) },
    {
      title: 'Durum / Üye',
      key: 'durum_uye',
      render: (_: any, r: Serefiye) => {
        if (r.uyeler) {
          return (
            <Space>
              <Tag color="red">DOLU</Tag>
              <Text strong>{r.uyeler.ad} {r.uyeler.soyad}</Text>
              <Text type="secondary" style={{ fontSize: '11px' }}>({r.uyeler.uye_no})</Text>
            </Space>
          )
        }
        const colors: Record<string, string> = { bos: 'green', dolu: 'red' }
        return <Tag color={colors[r.durum]}>{r.durum.toUpperCase()}</Tag>
      }
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 150,
      render: (_: any, r: Serefiye) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => { setEditingSerefiye(r); form.setFieldsValue(r); setModalOpen(true) }}
            title="Daire Bilgilerini Düzenle"
          />
          {r.uye_id ? (
            <Button
              size="small"
              danger
              icon={<UserDeleteOutlined />}
              onClick={() => {
                modal.confirm({
                  title: 'Üyelik Atamasını Kaldır',
                  content: `${r.uyeler?.ad} ${r.uyeler?.soyad} isimli üyenin bu daire ile ilişiği kesilecektir. Emin misiniz?`,
                  onOk: () => assignUyeMutation.mutate({ serefiyeId: r.id, uyeId: null })
                })
              }}
              title="Üyeliği Kaldır"
            />
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => { setEditingSerefiye(r); uyeForm.resetFields(); setUyeModalOpen(true) }}
              title="Üyelik Ata"
              style={{ backgroundColor: '#ffa940', color: 'black', borderColor: '#ffa940' }}
            >
              Üyelik Ata
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="animate-in fade-in duration-500">
      <DataTable
        columns={columns}
        dataSource={serefiyeList}
        rowKey="id"
        loading={serefiyeLoading}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        size="small"
        scroll={{ x: 1000 }}
        emptyDescription="Şerefiye tablosu boş"
      />

      {/* Daire Bilgi Düzenleme Modalı */}
      <Modal
        title={`${editingSerefiye?.daire_no} Daire Bilgileri`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width="min(520px, 95vw)"
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)} autoComplete="off" validateTrigger={["onBlur", "onChange"]}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="kat" label="Kat">
                <InputNumber style={{ width: '100%' }} autoComplete="off" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="yon" label="Yön">
                <Input placeholder="Örn: Kuzey-Doğu" autoComplete="off" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="m2" label="Metrekare (m2)">
                <InputNumber 
                  style={{ width: '100%' }} 
                  step={0.01} 
                  min={0}
                  formatter={trMoneyFormatter}
                  parser={trNumberParser}
                  autoComplete="off"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="oda_sayisi" label="Oda Sayısı">
                <Input placeholder="Örn: 3+1" autoComplete="off" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="serefiye_orani" label="Şerefiye Oranı">
            <InputNumber 
              style={{ width: '100%' }} 
              step={0.01} 
              min={0}
              formatter={trMoneyFormatter}
              parser={trNumberParser}
              autoComplete="off"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Üye Atama Modalı */}
      <Modal
        title={`${editingSerefiye?.daire_no} Nolu Daireye Üye Ata`}
        open={uyeModalOpen}
        onCancel={() => setUyeModalOpen(false)}
        onOk={() => uyeForm.submit()}
        confirmLoading={assignUyeMutation.isPending}
        okText="Ata"
        destroyOnHidden
        width="min(520px, 95vw)"
      >
        <Form
          form={uyeForm}
          layout="vertical"
          onFinish={(v) => assignUyeMutation.mutate({ serefiyeId: editingSerefiye!.id, uyeId: v.uye_id })}
          style={{ marginTop: 16 }}
          autoComplete="off"
          validateTrigger={["onBlur", "onChange"]}
        >
          <Form.Item
            name="uye_id"
            label="Üye Seçin"
            rules={[{ required: true, message: 'Lütfen bir üye seçin' }]}
            extra="Sadece dairesi olmayan aktif üyeler listelenir."
          >
            <Select
              showSearch
              placeholder="İsim veya Üye No ile ara"
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={bostaUyeler?.map(u => ({
                value: u.id,
                label: `${u.ad} ${u.soyad} (${u.uye_no})`
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

