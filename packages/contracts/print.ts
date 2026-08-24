export type PrintSize = '4x6' | '6x8'

export type PaymentStatus = 'pending_payment' | 'paid' | 'failed' | 'cancelled'

export type PrintStatus = 'pending' | 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled'

export type PrintJobPublic = {
  id: string
  token: string
  quantity: number
  size: PrintSize
  amountCents: number
  currency: string
  paymentStatus: PaymentStatus
  printStatus: PrintStatus
  createdAt: string
  updatedAt: string
  paidAt: string | null
  completedAt: string | null
  attempts: number
  maxAttempts: number
  lastError: string | null
}

export type PrintSizeOption = {
  id: PrintSize
  label: string
  priceCents: number
}

export type PrintConfig = {
  currency: string
  sizes: PrintSizeOption[]
  paymentMode: 'mock' | 'webhook'
}
