import React, { FC } from 'react'
import * as styles from './Button.module.css'

const Button: FC<{
  onClick?: () => void
  children?: string
  disabled?: boolean
  className?: string
  style?: 'text'
}> = ({ children, className, style, ...props }) => (
  <button
    {...props}
    className={[styles.button, className].filter(Boolean).join(' ')}
    {...(style && { 'data-style': style })}
  >
    {children}
  </button>
)

export default Button
