import React from 'react'
import { Typography } from 'antd'

const { Text } = Typography

interface MoneyDisplayProps {
  amount: number
  colored?: boolean // true ise pozitifler yeşil, negatifler kırmızı
  currency?: string
}

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({ 
  amount, 
  colored = false, 
  currency = 'TL' 
}) => {
  if (amount == null) return <span>-</span>;
  
  const formatted = amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  
  let color = 'inherit'
  if (colored) {
    if (amount > 0) color = '#52c41a' // Yeşil
    else if (amount < 0) color = '#ff4d4f' // Kırmızı
  }

  return (
    <Text style={{ color }}>
      {formatted} {currency}
    </Text>
  )
}
