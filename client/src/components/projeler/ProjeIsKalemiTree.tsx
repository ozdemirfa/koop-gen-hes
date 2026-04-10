import React, { useState } from 'react'
import { Tree, Button, Modal, Form, Input, InputNumber, Select, Space, message, Popconfirm, Card, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, NodeIndexOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'

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

export const ProjeIsKalemiTree: React.FC<Props> = ({ projeId, data }) => {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingKalem, setEditingKalem] = useState<any>(null)
  const [parentKalem, setParentKalem] = useState<any>(null)
  const [form] = Form.useForm()

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingKalem) {
        return await api.put(`/projeler/is-kalemleri/${editingKalem.id}`, values)
      }
      return await api.post(`/projeler/${projeId}/is-kalemleri`, {
        ...values,
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
          setModalOpen(true)
        }}>
          Ana Kalem Ekle
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
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Henüz iş kalemi eklenmemiş.</div>
      )}

      <Modal
        title={editingKalem ? 'İş Kalemi Düzenle' : (parentKalem ? `${parentKalem.tanim} Altına Kalem Ekle` : 'Yeni Ana Kalem')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)} initialValues={{ durum: 'planli', sira_no: 0 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="kalem_kodu" label="Kalem Kodu" style={{ flex: 1 }}>
              <Input placeholder="Örn: 1.1" />
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
              <Input placeholder="m2, m3, kg vb." />
            </Form.Item>
            <Form.Item name="miktar" label="Miktar" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="birim_fiyat" label="Birim Fiyat" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="butce_tutari" label="Bütçe Tutarı" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
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
      `}</style>
    </Card>
  )
}
