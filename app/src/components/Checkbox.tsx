import React, { FC } from 'react'

const CheckBox: FC<{ checked: boolean; onChange(v: boolean): void }> = ({
  checked,
  onChange,
}) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={({ target }) => onChange(target.checked)}
  />
)

export default CheckBox
