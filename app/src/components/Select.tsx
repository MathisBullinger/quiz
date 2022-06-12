import React, { FC } from 'react'

const Select: FC<{
  options: string[]
  selected: string
  onSelect(value: string): void
}> = ({ options, selected, onSelect }) => (
  <select value={selected} onChange={({ target }) => onSelect(target.value)}>
    {options.map(text => (
      <option key={text}>{text}</option>
    ))}
  </select>
)

export default Select
