import { useEffect, useState } from 'react'
import { localDay } from './daily'

export function useLocalDay() {
  const [day,setDay] = useState(() => localDay())
  useEffect(() => {
    const update = () => setDay(localDay())
    const timer = window.setInterval(update,30000)
    window.addEventListener('focus',update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus',update) }
  },[])
  return day
}
