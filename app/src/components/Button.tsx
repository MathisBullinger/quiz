import React, { FC } from 'react'
import * as styles from './Button.module.css'

const Button: FC<{ onClick?: () => void; children?: string }> = ({
  children,
  onClick,
}) => (
  <button className={styles.button} onClick={onClick}>
    {children}
  </button>
)

export default Button
