import React, { HTMLAttributes } from 'react'

type Props<T extends string> = {
  value: T extends 'number' ? number : string
  onChange(v: T extends 'number' ? number : string): void
  type?: T
  step?: number
  min?: number
  pattern?: RegExp
}

const Input = <T extends string>({
  value,
  onChange,
  type,
  pattern,
  ...props
}: Omit<HTMLAttributes<HTMLInputElement>, keyof Props<T>> & Props<T>) => (
  <input
    {...props}
    type={type}
    value={value}
    onChange={({ target }) => {
      if (pattern && !pattern.test(target.value)) return
      onChange(
        type === 'number' ? parseFloat(target.value) : (target.value as any)
      )
    }}
  />
)

export default Input
