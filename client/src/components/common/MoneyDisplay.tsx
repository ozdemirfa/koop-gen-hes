import React from 'react'
import { Typography } from 'antd'
import { formatMoney } from '../../lib/format'

const { Text } = Typography

interface MoneyDisplayProps {
  amount: number
  colored?: boolean // true ise pozitifler yeşil, negatifler kırmızı
  currency?: string
  strong?: boolean
}

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({ 
  amount, 
  colored = false, 
  currency = 'TL',
  strong = false
}) => {
  if (amount == null) return <span>-</span>;
  
  const formatted = formatMoney(amount)
  
  let color = 'inherit'
  if (colored) {
    if (amount > 0) color = '#52c41a' // Yeşil
    else if (amount < 0) color = '#ff4d4f' // Kırmızı
  }

  return (
    <Text strong={strong} style={{ color }}>
      {formatted} {currency}
    </Text>
  )
}
