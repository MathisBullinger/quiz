import React, { FC, useCallback, useEffect } from 'react'
import { RouteProps } from 'itinero'
import * as styles from './Host.module.css'
import * as ws from '../ws'
import Button from 'components/Button'
import Countdown from '../components/Countdown'

const Host: FC<RouteProps<{}, { key: string; id: string }>> = ({ match }) => {
  const data = ws.useSubscribe('quizInfo')

  useEffect(() => {
    ws.send({ type: 'host', quizKey: match.key, quizId: match.id })
  }, [match.key, match.id])

  if (!data) return null
  return <Main {...data} />
}

export default Host

const Main: FC<ws.QuizInfo> = ({
  title,
  players,
  status,
  quizId,
  quizKey,
  question,
}) => {
  const nextStage = useCallback(() => {
    ws.send({ type: 'nextStage', quizKey, quizId })
  }, [])

  useEffect(() => {
    if (!question?.closes) return
    setTimeout(nextStage, question.closes - Date.now())
  }, [question?.closes])

  return (
    <div className={styles.host}>
      <h1>Hosting {title}</h1>
      <ul>
        {players.map(({ id, name }) => (
          <li key={id}>{name}</li>
        ))}
      </ul>
      {!!question?.closes && <Countdown closes={question.closes} />}
      <p>stage: {status}</p>
      <Button onClick={nextStage}>advance stage</Button>
      {question?.previewText && (
        <p>
          Preview:{' '}
          <div dangerouslySetInnerHTML={{ __html: question.previewText }} />
        </p>
      )}
    </div>
  )
}
