import dayjs from 'dayjs'
import 'dayjs/locale/tr'

dayjs.locale('tr')

export function formatTL(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY'
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return dayjs(date).format('DD.MM.YYYY')
}

export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('DD.MM.YYYY HH:mm')
}

export function makeAidatSonOdemeTarihi(yil: number, ay: number, gun: number): string {
  return dayjs(`${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`).format('YYYY-MM-DD')
}
