'use client'

import PrintCheckout from '../../../../components/PrintCheckout'
import { useParams } from 'next/navigation'

export default function PrintPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''
  return (
    <main className="page photo-view">
      <div className="pixel-grid-bg" aria-hidden />
      <PrintCheckout token={token} />
    </main>
  )
}
