import React, { useState } from 'react'
import { Card, Table, Button, Modal, Form, InputNumber, App, Typography, Tag, Space } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getErrorMessage } from '../../lib/apiError'
import { usePageSettings } from '../../contexts/LayoutContext'
import { usePermissions } from '../../hooks/usePermissions'

const { Text, Paragraph } = Typography

interface SystemParameter {
  key: string
  name: string
  value: number
  description: string
  unit?: string
}

export const ParametersPage: React.FC = () => {
  const { message: messageApi } = App.useApp()
  const queryClient = useQueryClient()
  const [editModalVisible, setEditModalOpen] = useState(false)
  const [editingParam, setEditingParam] = useState<SystemParameter | null>(null)
  const [form] = Form.useForm()
  // Sprint role-system-modernization (PR-C): Sistem parametreleri yalnızca manager+
  const { isManager } = usePermissions()

  usePageSettings('Sistem Parametreleri')

  // Parametreleri getir
  const { data: parameters, isLoading } = useQuery({
    queryKey: ['system-parameters-list'],
    queryFn: async () => {
      const saved = localStorage.getItem('system_parameters')
      const defaults = {
        default_gecikme_faizi: 5,
        default_son_odeme_gunu: 15
      }
      const values = saved ? JSON.parse(saved) : defaults

      return [
        {
          key: 'default_gecikme_faizi',
          name: 'Varsayılan Gecikme Faizi',
          value: values.default_gecikme_faizi,
          description: 'Yeni aidat planları oluşturulurken varsayılan olarak gelen aylık gecikme faiz oranı.',
          unit: '%'
        },
        {
          key: 'default_son_odeme_gunu',
          name: 'Varsayılan Son Ödeme Günü',
          value: values.default_son_odeme_gunu,
          description: 'Aidat borçlandırmalarında son ödeme tarihinin ayın kaçıncı günü olacağını belirler.',
          unit: 'Gün'
        }
      ] as SystemParameter[]
    }
  })

  const saveMutation = useMutation({
    mutationFn: async (values: { key: string, value: number }) => {
      const saved = localStorage.getItem('system_parameters')
      const current = saved ? JSON.parse(saved) : { default_gecikme_faizi: 5, default_son_odeme_gunu: 15 }
      
      const updated = {
        ...current,
        [values.key]: values.value
      }
      
      localStorage.setItem('system_parameters', JSON.stringify(updated))
      return updated
    },
    onSuccess: () => {
      messageApi.success('Parametre güncellendi')
      queryClient.invalidateQueries({ queryKey: ['system-parameters-list'] })
      setEditModalOpen(false)
    },
    onError: (err) => messageApi.error(getErrorMessage(err))
  })

  const handleEdit = (record: SystemParameter) => {
    setEditingParam(record)
    form.setFieldsValue({ value: record.value })
    setEditModalOpen(true)
  }

  const columns = [
    {
      title: 'Parametre Adı',
      dataIndex: 'name',
      key: 'name',
      width: '30%',
      render: (text: string, record: SystemParameter) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>{record.description}</Text>
        </Space>
      )
    },
    {
      title: 'Değer',
      dataIndex: 'value',
      key: 'value',
      width: '20%',
      render: (val: number, record: SystemParameter) => (
        <Tag color="blue" style={{ fontSize: '14px', padding: '4px 12px' }}>
          {val} {record.unit}
        </Tag>
      )
    },
    {
      title: 'İşlem',
      key: 'action',
      width: '10%',
      align: 'right' as const,
      render: (_: any, record: SystemParameter) => (
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
          disabled={!isManager}
          title={!isManager ? 'Yetki yok (manager+ gerekli)' : undefined}
        >
          Düzenle
        </Button>
      )
    }
  ]

  return (
    <div className="animate-in fade-in duration-500">
      <Card 
        title="Parametre Listesi" 
        variant="borderless"
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '16px 24px' }}>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Uygulama genelinde kullanılan temel hesaplama ve varsayılan değer parametreleri aşağıda listelenmiştir.
          </Paragraph>
        </div>

        <Table
          dataSource={parameters}
          columns={columns}
          rowKey="key"
          pagination={false}
          loading={isLoading}
        />
      </Card>

      <Modal
        title="Parametre Düzenle"
        open={editModalVisible}
        onCancel={() => setEditModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
        width="min(520px, 95vw)"
      >
        {editingParam && (
          <Form
            form={form}
            layout="vertical"
            onFinish={(v) => saveMutation.mutate({ key: editingParam.key, value: v.value })}
            style={{ marginTop: 16 }}
            validateTrigger={["onBlur", "onChange"]}
          >
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Düzenlenen Parametre:</Text>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>{editingParam.name}</div>
              <Paragraph type="secondary" style={{ marginTop: 4 }}>{editingParam.description}</Paragraph>
            </div>

            <Form.Item 
              name="value" 
              label={`Yeni Değer (${editingParam.unit || ''})`}
              rules={[{ required: true, message: 'Lütfen bir değer giriniz' }]}
            >
              <InputNumber 
                style={{ width: '100%' }} 
                min={editingParam.key.includes('gunu') ? 1 : 0}
                max={editingParam.key.includes('gunu') ? 31 : 100}
                step={editingParam.key.includes('faizi') ? 0.1 : 1}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <div style={{ marginTop: 24 }}>
        <Text type="secondary" italic>
          * Parametrelerde yapılan değişiklikler geriye dönük mevcut kayıtları etkilemez, sadece bundan sonra yapılacak işlemlerde (yeni planlar vb.) varsayılan olarak kullanılır.
        </Text>
      </div>
    </div>
  )
}
