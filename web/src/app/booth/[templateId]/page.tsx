'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Booth from '../../../components/Booth'
import { fetchBoothConfig, type BoothConfig } from '../../../lib/api'
import { DEFAULT_BOOTH_CONFIG } from '../../../lib/defaultBoothConfig'
import { useLiveBoothConfig } from '../../../features/booth/useLiveBoothConfig'

export default function BoothPage() {
  const params = useParams<{ templateId: string }>()
  const templateId = params?.templateId ?? DEFAULT_BOOTH_CONFIG.defaultTemplateId
  const [config, setConfig] = useState<BoothConfig>(DEFAULT_BOOTH_CONFIG)
  const [apiUnavailable, setApiUnavailable] = useState(false)

  useEffect(() => {
    let active = true

    void fetchBoothConfig()
      .then((loaded) => {
        if (!active) return
        setConfig(loaded)
        setApiUnavailable(false)
      })
      .catch(() => {
        if (active) setApiUnavailable(true)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <BoothPageInner
      templateId={templateId}
      config={config}
      apiUnavailable={apiUnavailable}
    />
  )
}

function BoothPageInner({
  templateId,
  config,
  apiUnavailable,
}: {
  templateId: string
  config: BoothConfig
  apiUnavailable: boolean
}) {
  const liveConfig = useLiveBoothConfig(config)
  return <Booth templateId={templateId} boothConfig={liveConfig} apiUnavailable={apiUnavailable} />
}
