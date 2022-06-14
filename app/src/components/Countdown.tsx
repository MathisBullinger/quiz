import React, { FC, useState, useEffect } from 'react'
import * as styles from './Countdown.module.css'

const CountDown: FC<{ closes: number }> = ({ closes }) => {
  const [sec, setSec] = useState(Math.round((closes - Date.now()) / 1000))

  useEffect(() => {
    const update = () => {
      const updated = (closes - Date.now()) / 1000
      if (updated <= 0) {
        setSec(0)
        return
      }
      setSec(Math.round(updated))
      setTimeout(update, (updated % 1000) + 50)
    }
    update()
  }, [closes, setSec])

  return <span className={styles.countdown}>{sec}</span>
}

export default CountDown
