import { useEffect, useRef, useState } from 'react'

export const useComputed = <T extends unknown[], V>(
  compute: (...v: T) => V,
  ...data: T
): V => {
  const [computed, setComputed] = useState<V>(compute(...data))
  const intialized = useRef(false)

  useEffect(() => {
    if (!intialized.current) {
      intialized.current = true
      return
    }
    setComputed(compute(...data))
  }, data)

  return computed
}
