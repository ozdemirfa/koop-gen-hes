import React, { useState, useEffect } from 'react'
import { Tree, Button, Modal, Form, Input, InputNumber, Select, Space, message, Popconfirm, Card, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, NodeIndexOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { trNumberFormatter, trNumberParser } from '../../lib/format'

const { Text } = Typography

interface ProjeIsKalemi {
  id: string
  proje_id: string
  ust_kalem_id?: string
  sira_no: number
  kalem_kodu?: string
  tanim: string
  birim?: string
  miktar?: number
  birim_fiyat?: number
  butce_tutari: number
  durum: 'planli' | 'devam_ediyor' | 'tamamlandi' | 'iptal'
  children?: ProjeIsKalemi[]
}

interface Props {
  projeId: string
  data: ProjeIsKalemi[]
}

const BIRIMLER = ['m2', 'm3', 'mt', 'adet', 'ton', 'kg', 'litre', 'set', 'gun', 'saat', 'ls']

export const ProjeIsKalemiTree: React.FC<Props> = ({ projeId, data }) => {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingKalem, setEditingKalem] = useState<any>(null)
  const [parentKalem, setParentKalem] = useState<any>(null)
  const [isBudgetManual, setIsBudgetManual] = useState(false)
  const [form] = Form.useForm()

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      // Boş stringleri temizle
      const cleanValues = { ...values }
      if (cleanValues.kalem_kodu === '') delete cleanValues.kalem_kodu
      if (cleanValues.notlar === '') delete cleanValues.notlar

      if (editingKalem) {
        return await api.put(`/projeler/is-kalemleri/${editingKalem.id}`, cleanValues)
      }
      return await api.post(`/projeler/${projeId}/is-kalemleri`, {
        ...cleanValues,
        ust_kalem_id: parentKalem?.id || null
      })
    },
    onSuccess: () => {
      message.success('İş kalemi kaydedildi')
      queryClient.invalidateQueries({ queryKey: ['proje', projeId] })
      setModalOpen(false)
      form.resetFields()
      setEditingKalem(null)
      setParentKalem(null)
      setIsBudgetManual(false)
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/projeler/is-kalemleri/${id}`)
    },
    onSuccess: () => {
      message.success('İş kalemi silindi')
      queryClient.invalidateQueries({ queryKey: ['proje', projeId] })
    },
    onError: (err: any) => message.error(err.message || 'Hata oluştu')
  })

  // Sonraki sıra numarasını bul
  const getNextSiraNo = (items: ProjeIsKalemi[], parentId?: string) => {
    let siblings: ProjeIsKalemi[] = []
    if (!parentId) {
      siblings = items
    } else {
      const findParent = (list: ProjeIsKalemi[]): ProjeIsKalemi | undefined => {
        for (const item of list) {
          if (item.id === parentId) return item
          if (item.children) {
            const found = findParent(item.children)
            if (found) return found
          }
        }
      }
      const p = findParent(items)
      siblings = p?.children || []
    }
    const maxSira = siblings.reduce((max, curr) => Math.max(max, curr.sira_no || 0), 0)
    return maxSira === 0 ? 1 : maxSira + 1
  }

  const renderTitle = (node: ProjeIsKalemi) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', minWidth: 400 }}>
      <Space>
        <Text strong>{node.kalem_kodu}</Text>
        <Text>{node.tanim}</Text>
        {node.butce_tutari > 0 && <Text type="secondary">({new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(node.butce_tutari)})</Text>}
      </Space>
      <Space className="tree-actions">
        <Button 
          type="text" 
          size="small" 
          icon={<PlusOutlined />} 
          onClick={(e) => {
            e.stopPropagation()
            setParentKalem(node)
            setEditingKalem(null)
            form.resetFields()
            form.setFieldsValue({ sira_no: getNextSiraNo(data, node.id) })
            setIsBudgetManual(false)
            setModalOpen(true)
          }} 
        />
        <Button 
          type="text" 
          size="small" 
          icon={<EditOutlined />} 
          onClick={(e) => {
            e.stopPropagation()
            setEditingKalem(node)
            setParentKalem(null)
            form.setFieldsValue(node)
            setIsBudgetManual(false)
            setModalOpen(true)
          }} 
        />
        <Popconfirm title="Bu kalemi silmek istediğinize emin misiniz?" onConfirm={(e) => {
          e?.stopPropagation()
          deleteMutation.mutate(node.id)
        }}>
          <Button 
            type="text" 
            size="small" 
            danger 
            icon={<DeleteOutlined />} 
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      </Space>
    </div>
  )

  const convertToTreeData = (items: ProjeIsKalemi[]): any[] => {
    return items.map(item => ({
      key: item.id,
      title: renderTitle(item),
      children: item.children ? convertToTreeData(item.children) : []
    }))
  }

  const handleValuesChange = (changedValues: any, allValues: any) => {
    const { miktar, birim_fiyat, butce_tutari } = allValues

    // Eğer miktar veya birim fiyat değiştiyse ve Manuel Bütçe Modu kapalıysa
    if ((changedValues.miktar !== undefined || changedValues.birim_fiyat !== undefined) && !isBudgetManual) {
      const calculatedTotal = (miktar || 0) * (birim_fiyat || 0)
      form.setFieldsValue({ butce_tutari: calculatedTotal })
    }
    
    // Eğer bütçe tutarı değiştiyse (Manuel moddayken)
    if (changedValues.butce_tutari !== undefined && isBudgetManual) {
      if (miktar && miktar > 0) {
        const calculatedUnitPrice = (butce_tutari || 0) / miktar
        form.setFieldsValue({ birim_fiyat: calculatedUnitPrice })
      }
    }
  }

  return (
    <Card 
      title={
        <Space>
          <NodeIndexOutlined />
          İş Kalemleri (Ağaç Yapısı)
        </Space>
      }
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
          setParentKalem(null)
          setEditingKalem(null)
          form.resetFields()
          form.setFieldsValue({ sira_no: getNextSiraNo(data) })
          setIsBudgetManual(false)
          setModalOpen(true)
        }}>
          Harcama Kalemi Ekle
        </Button>
      }
    >
      {data && data.length > 0 ? (
        <Tree
          treeData={convertToTreeData(data)}
          blockNode
          defaultExpandAll
          selectable={false}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Henüz harcama kalemi eklenmemiş.</div>
      )}

      <Modal
        title={editingKalem ? 'İş Kalemi Düzenle' : (parentKalem ? `${parentKalem.tanim} Altına Kalem Ekle` : 'Yeni Harcama Kalemi')}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setIsBudgetManual(false)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={500}
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={(v) => saveMutation.mutate(v)} 
          onValuesChange={handleValuesChange}
          initialValues={{ durum: 'planli', sira_no: 0 }}
          autoComplete="off"
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="kalem_kodu" label="Poz No / Kalem Kodu" style={{ flex: 1 }}>
              <Input placeholder="Arama yapmak için yazın..." suffix={<SearchOutlined />} />
            </Form.Item>
            <Form.Item name="sira_no" label="Sıra No" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="tanim" label="Tanım" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="birim" label="Birim" style={{ flex: 1 }}>
              <Select placeholder="Seçiniz..." showSearch>
                {BIRIMLER.map(b => <Select.Option key={b} value={b}>{b}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="miktar" label="Miktar" style={{ flex: 1 }}>
              <InputNumber 
                style={{ width: '100%' }} 
                formatter={trNumberFormatter}
                parser={trNumberParser}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="birim_fiyat" label="Birim Fiyat" style={{ flex: 1 }}>
              <InputNumber 
                style={{ width: '100%' }} 
                formatter={trNumberFormatter}
                parser={trNumberParser}
              />
            </Form.Item>
            <Form.Item name="butce_tutari" label="Bütçe Tutarı" style={{ flex: 1 }}>
              <InputNumber 
                style={{ width: '100%' }} 
                formatter={trNumberFormatter}
                parser={trNumberParser}
                readOnly={!isBudgetManual}
                placeholder={isBudgetManual ? "Manuel giriş" : "Otomatik hesaplanır"}
                className={!isBudgetManual ? "read-only-input" : ""}
                addonAfter={
                  <Button 
                    type={isBudgetManual ? "primary" : "default"} 
                    size="small" 
                    icon={<EditOutlined />} 
                    style={{ border: 'none', height: 20, padding: '0 4px' }}
                    onClick={() => setIsBudgetManual(!isBudgetManual)}
                    title="Bütçeyi manuel düzenle / Otomatik hesapla"
                  />
                }
              />
            </Form.Item>
          </div>
          <Form.Item name="durum" label="Durum" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="planli">Planlı</Select.Option>
              <Select.Option value="devam_ediyor">Devam Ediyor</Select.Option>
              <Select.Option value="tamamlandi">Tamamlandı</Select.Option>
              <Select.Option value="iptal">İptal</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notlar" label="Notlar">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .tree-actions {
          opacity: 0;
          transition: opacity 0.2s;
        }
        .ant-tree-node-content-wrapper:hover .tree-actions {
          opacity: 1;
        }
        .read-only-input {
          background-color: #f5f5f5;
        }
      `}</style>
    </Card>
  )
}
