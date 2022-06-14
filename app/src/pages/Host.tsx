import React, { FC, useEffect } from 'react'
import { RouteProps } from 'itinero'
import * as styles from './Host.module.css'
import * as ws from '../ws'

const Host: FC<RouteProps<{}, { key: string; id: string }>> = ({ match }) => {
  const data = ws.useSubscribe('quizInfo')

  useEffect(() => {
    ws.send({ type: 'host', quizKey: match.key, quizId: match.id })
  }, [match.key, match.id])

  if (!data) return null
  return <Main {...data} />
}

export default Host

const Main: FC<ws.QuizInfo> = ({ title, players }) => {
  return (
    <div className={styles.host}>
      <h1>Hosting {title}</h1>
      <ul>
        {players.map(({ id, name }) => (
          <li key={id}>{name}</li>
        ))}
      </ul>
    </div>
  )
}
