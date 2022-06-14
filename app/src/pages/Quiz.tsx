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
  const user = ws.useSubscribe('user')

  useEffect(() => {
    if (error instanceof APIError && error.status === 404) {
      context.pushError({ type: 'error', message: "This quiz doesn't exist" })
      history.push('/')
    }
  }, [error])

  useEffect(() => {
    const existing = localStorage.getItem(match.id)
    if (existing) {
      const { auth } = JSON.parse(existing)
      ws.send({ type: 'restore', auth, quizId: match.id })
    } else ws.send({ type: 'join', quizId: match.id })
  }, [match.id])

  useEffect(() => {
    if (!user) return
    localStorage.setItem(match.id, JSON.stringify(user))
  }, [match.id, user])

  if (loading || error || !user) return null
  return <Main quizId={match.id} {...result} user={user} />
}

export default Quiz

const Main: FC<QuizMeta & { quizId: string; user: ws.Player }> = ({
  quizId,
  title,
  status,
  user,
}) => {
  const { peers } = ws.useSubscribe('peers') ?? {}
  const [ownName, setOwnName] = useState(user.name)

  const changeName = () => {
    ws.send({ type: 'setName', quizId, name: ownName })
  }

  return (
    <div className={styles.root}>
      <h1>{title}</h1>
      <ul className={styles.playerList}>
        {[user, ...(peers ?? [])].map(({ id, name }) => (
          <li key={id}>
            {id !== user.id ? (
              name
            ) : (
              <>
                <input
                  value={ownName}
                  onChange={({ target }) => setOwnName(target.value)}
                />
                <button disabled={name === ownName} onClick={changeName}>
                  save
                </button>
              </>
            )}
          </li>
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
