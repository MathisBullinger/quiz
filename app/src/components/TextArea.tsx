import React, { FC, useState } from 'react'
import * as styles from './TextArea.module.css'

const TextArea: FC<{
  value: string
  onChange(value: string): void
  label?: string
}> = ({ value, onChange, label }) => {
  const [rows, setRows] = useState(1)
  const [id] = useState(Math.round(Math.random() * 1e6).toString(36))

  return (
    <div className={styles.wrap}>
      <textarea
        className={styles.text}
        value={value}
        onChange={({ target }) => {
          const textRows = (target.value.match(/\n/g)?.length ?? 0) + 1
          if (textRows !== rows) setRows(textRows)
          onChange(target.value)
        }}
        rows={rows}
        data-gramm={false}
        id={id}
      />
      {!!label && <label htmlFor={id}>{label}</label>}
    </div>
  )
}

export default TextArea
