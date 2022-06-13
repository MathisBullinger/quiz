import React, { FC, useEffect, useState } from 'react'
import { RouteProps } from 'itinero'
import styles from './Quiz.module.css'
import { useAPICall, APIError, QuizMeta, Player } from '../api'
import { useAppContext } from '../context'
import { history } from 'itinero'
import * as ws from '../ws'

const Quiz: FC<RouteProps<{}, { id: string }>> = ({ match }) => {
  const [loading, result, error] = useAPICall('getQuiz', match.id)
  const context = useAppContext()

  useEffect(() => {
    if (error instanceof APIError && error.status === 404) {
      context.pushError({ type: 'error', message: "This quiz doesn't exist" })
      history.push('/')
    }
  }, [error])

  // useEffect(() => {
  //   if (!result?.auth) return
  //   ws.send({ type: 'authenticate', token: result.auth, quizId: match.id })
  // }, [result, match.id])

  if (loading || error) return null
  return <Main quizId={match.id} {...result} />
}

export default Quiz

const Main: FC<QuizMeta & { quizId: string }> = ({ quizId, title, status }) => {
  // const playerList = useSortedPlayers(players, me)

  useEffect(() => {
    ws.send({ type: 'join', quizId })
  }, [quizId])

  return (
    <div className={styles.root}>
      <h1>{title}</h1>
      {/* <ul>
        {playerList.map(({ id, name }) => (
          <li key={id}>{name}</li>
        ))}
      </ul> */}
      {status === 'pending' && <Pending />}
    </div>
  )
}

const useSortedPlayers = (players: Player[], me: string) => {
  const [sorted, setSorted] = useState<Player[]>([])

  useEffect(() => {
    setSorted(
      players.sort((a, b) => playerSortScore(a, me) - playerSortScore(b, me))
    )
  }, [players])

  return sorted
}

const playerSortScore = (player: Player, me: string) =>
  player.id === me ? 0 : Infinity

const Pending = () => {
  return (
    <div>
      <span>Waiting for the host to start the quiz.</span>
    </div>
  )
}
