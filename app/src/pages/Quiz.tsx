import React, { FC, useEffect, useState } from 'react'
import { RouteProps } from 'itinero'
import * as styles from './Quiz.module.css'
import { useAPICall, APIError, QuizMeta, Player } from '../api'
import { useAppContext } from '../context'
import { history } from 'itinero'
import * as ws from '../ws'
import { useComputed } from '../hooks'

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
  return <Main quizId={match.id} {...result} />
}

export default Quiz

const Main: FC<QuizMeta & { quizId: string }> = ({ quizId, title, status }) => {
  const user = ws.useSubscribe('user')
  const { peers } = ws.useSubscribe('peers') ?? {}
  const players = useComputed(
    (a, b) => [...(a ? [a] : []), ...(b ?? [])],
    user,
    peers
  )

  useEffect(() => {
    const existing = localStorage.getItem(quizId)
    if (existing) {
      const { auth } = JSON.parse(existing)
      ws.send({ type: 'restore', auth, quizId })
    } else ws.send({ type: 'join', quizId })
  }, [quizId])

  useEffect(() => {
    if (!user) return
    localStorage.setItem(quizId, JSON.stringify(user))
  }, [quizId, user])

  return (
    <div className={styles.root}>
      <h1>{title}</h1>
      <ul>
        {players.map(({ id, name }) => (
          <li key={id}>{name}</li>
        ))}
      </ul>
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
