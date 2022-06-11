import React, { FC } from 'react'
import { RouteProps } from 'itinero'

const Edit: FC<RouteProps<{}, { key: string }>> = ({ match }) => {
  return <div>Edit {match.key}</div>
}

export default Edit
