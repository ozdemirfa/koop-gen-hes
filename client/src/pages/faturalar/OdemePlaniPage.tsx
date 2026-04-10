import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Table, Button, Space, message, Spin, Empty, InputNumber, DatePicker, Form, Row, Col, Statistic, Divider } from 'antd'
import { PlusOutlined, SaveOutlined, DeleteOutlined, CalculatorOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../lib/api'
import { PageHeader } from '../../components/common/PageHeader'
import { MoneyDisplay } from '../../components/common/MoneyDisplay'

export const OdemePlaniPage: React.FC = () => {
  const { id: faturaId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [taksitler, setTaksitler] = useState<any[]>([])

  const { data: fatura, isLoading } = useQuery({
    queryKey: ['fatura', faturaId],
    queryFn: async () => {
      const { data } = await api.get(`/faturalar/${faturaId}`)
      return data.data
    },
    onSuccess: (data) => {
      if (data.odeme_planlari && data.odeme_planlari.length > 0) {
        setTaksitler(data.odeme_planlari.map((t: any) => ({
          ...t,
          vade_tarihi: dayjs(t.vade_tarihi)
        })))
      }
    }
  })

  const saveMutation = useMutation({
    mutationFn: async (values: any[]) => {
      const payload = values.map((t, index) => ({
        taksit_no: index + 1,
        tutar: t.tutar,
        vade_tarihi: t.vade_tarihi.format('YYYY-MM-DD')
      }))
      return await api.post(`/faturalar/${faturaId}/odeme-plani`, { taksitler: payload })
    },
    onSuccess: () => {
      message.success('Ödeme planı kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['fatura', faturaId] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const handleAutoGenerate = (values: any) => {
    const { taksitSayisi, baslangicTarihi } = values
    const toplamTutar = fatura?.toplam_tutar || 0
    const taksitTutari = Math.floor((toplamTutar / taksitSayisi) * 100) / 100
    const fark = Math.round((toplamTutar - (taksitTutari * taksitSayisi)) * 100) / 100

    const newTaksitler = []
    for (let i = 0; i < taksitSayisi; i++) {
      newTaksitler.push({
        taksit_no: i + 1,
        tutar: i === taksitSayisi - 1 ? (taksitTutari + fark) : taksitTutari,
        vade_tarihi: dayjs(baslangicTarihi).add(i, 'month')
      })
    }
    setTaksitler(newTaksitler)
  }

  const handleAddTaksit = () => {
    setTaksitler([...taksitler, {
      taksit_no: taksitler.length + 1,
      tutar: 0,
      vade_tarihi: dayjs()
    }])
  }

  const handleRemoveTaksit = (index: number) => {
    setTaksitler(taksitler.filter((_, i) => i !== index))
  }

  const handleFieldChange = (index: number, field: string, value: any) => {
    const newTaksitler = [...taksitler]
    newTaksitler[index][field] = value
    setTaksitler(newTaksitler)
  }

  if (isLoading) return <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" /></div>
  if (!fatura) return <Empty description="Fatura bulunamadı" />

  const planToplam = taksitler.reduce((s, t) => s + (t.tutar || 0), 0)
  const kalan = Math.round((fatura.toplam_tutar - planToplam) * 100) / 100

  const columns = [
    { title: 'Taksit No', dataIndex: 'taksit_no', key: 'taksit_no', width: 100 },
    { 
      title: 'Vade Tarihi', 
      key: 'vade', 
      render: (_: any, record: any, index: number) => (
        <DatePicker 
          value={record.vade_tarihi} 
          onChange={(v) => handleFieldChange(index, 'vade_tarihi', v)} 
          format="DD.MM.YYYY"
        />
      )
    },
    { 
      title: 'Tutar', 
      key: 'tutar', 
      render: (_: any, record: any, index: number) => (
        <InputNumber 
          value={record.tutar} 
          onChange={(v) => handleFieldChange(index, 'tutar', v)} 
          style={{ width: '100%' }}
          formatter={(v) => `₺ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        />
      )
    },
    {
      title: 'İşlem',
      key: 'action',
      width: 80,
      render: (_: any, __: any, index: number) => (
        <Button danger icon={<DeleteOutlined />} onClick={() => handleRemoveTaksit(index)} />
      )
    }
  ]

  return (
    <div>
      <PageHeader
        title={`Ödeme Planı: ${fatura.fatura_no}`}
        onBack={() => navigate('/faturalar')}
        extra={
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={() => saveMutation.mutate(taksitler)}
            loading={saveMutation.isPending}
            disabled={kalan !== 0}
          >
            Planı Kaydet
          </Button>
        }
      />

      <Row gutter={16}>
        <Col span={8}>
          <Card title="Fatura Özeti">
            <Statistic title="Firma" value={fatura.firmalar?.unvan} valueStyle={{ fontSize: 16 }} />
            <Divider style={{ margin: '12px 0' }} />
            <Statistic title="Toplam Tutar" value={fatura.toplam_tutar} prefix="₺" precision={2} />
            <Statistic 
              title="Planlanan Toplam" 
              value={planToplam} 
              prefix="₺" 
              precision={2} 
              valueStyle={{ color: planToplam === fatura.toplam_tutar ? '#52c41a' : '#faad14' }} 
            />
            <Statistic 
              title="Kalan" 
              value={kalan} 
              prefix="₺" 
              precision={2} 
              valueStyle={{ color: kalan === 0 ? '#52c41a' : '#ff4d4f' }} 
            />
          </Card>

          <Card title="Otomatik Oluştur" style={{ marginTop: 16 }}>
            <Form layout="vertical" onFinish={handleAutoGenerate} initialValues={{ taksitSayisi: 3, baslangicTarihi: dayjs() }}>
              <Form.Item name="taksitSayisi" label="Taksit Sayısı">
                <InputNumber min={1} max={24} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="baslangicTarihi" label="İlk Taksit Tarihi">
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
              <Button type="dashed" block icon={<CalculatorOutlined />} htmlType="submit">Hesapla ve Dağıt</Button>
            </Form>
          </Card>
        </Col>

        <Col span={16}>
          <Card 
            title="Taksitler" 
            extra={<Button icon={<PlusOutlined />} onClick={handleAddTaksit}>Taksit Ekle</Button>}
          >
            <Table
              dataSource={taksitler}
              columns={columns}
              rowKey={(r, i) => i!}
              pagination={false}
              size="small"
            />
            {kalan !== 0 && (
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Text type="danger">Taksit toplamı fatura tutarına eşit olmalıdır. Fark: <MoneyDisplay amount={kalan} /></Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
