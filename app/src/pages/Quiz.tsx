import React, { FC, useEffect } from 'react'
import { RouteProps } from 'itinero'
import styles from './Quiz.module.css'
import { useAPICall, APIError, QuizMeta } from '../api'
import { useAppContext } from '../context'
import { history } from 'itinero'

const Quiz: FC<RouteProps<{}, { id: string }>> = ({ match }) => {
  const [loading, result, error] = useAPICall('getQuiz', match.id)
  const context = useAppContext()

  useEffect(() => {
    if (error instanceof APIError && error.status === 404) {
      context.pushError({ type: 'error', message: "This quiz doesn't exist" })
      history.push('/')
    }
  }, [error])

  if (loading || error) return null
  return <Main {...result} />
}

export default Quiz

const Main: FC<QuizMeta> = ({ title, status }) => {
  return (
    <div className={styles.root}>
      <h1>{title}</h1>
      {status === 'pending' && <Pending />}
    </div>
  )
}

const Pending = () => {
  return (
    <div>
      <span>Waiting for the host to start the quiz.</span>
    </div>
  )
}
