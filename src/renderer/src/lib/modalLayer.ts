import { useEffect, useState } from 'react'

const BASE_LAYER = 2500
let nextLayer = BASE_LAYER

export function useModalLayer(open: boolean): number {
  const [layer, setLayer] = useState(BASE_LAYER)

  useEffect(() => {
    if (!open) return
    nextLayer += 1
    setLayer(nextLayer)
  }, [open])

  return layer
}