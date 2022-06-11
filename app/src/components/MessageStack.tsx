import React from 'react'
import { useAppContext } from '../context'
import * as styles from './MessageStack.module.css'

const MessageStack = () => {
  const context = useAppContext()

  return (
    <div className={styles.stack}>
      {context.errors.map(({ id, type, message }) => (
        <div className={styles.item} key={id} data-type={type}>
          {message}
        </div>
      ))}
    </div>
  )
}

export default MessageStack
