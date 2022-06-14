import React, { FC, useEffect, useState } from 'react'
import { RouteProps } from 'itinero'
import * as styles from './Quiz.module.css'
import * as ws from '../ws'

const Quiz: FC<RouteProps<{}, { id: string }>> = ({ match }) => {
  const quiz = ws.useSubscribe('quizStatus')
  console.log(quiz)

  useEffect(() => {
    const existing = localStorage.getItem(match.id)
    if (existing) {
      const { auth } = JSON.parse(existing)
      ws.send({ type: 'restore', auth, quizId: match.id })
    } else ws.send({ type: 'join', quizId: match.id })
  }, [match.id])

  const auth = quiz?.player?.auth
  useEffect(() => {
    if (!auth) return
    localStorage.setItem(match.id, JSON.stringify(quiz.player))
  }, [auth])

  if (!quiz) return null
  return <Main {...quiz} />
}

export default Quiz

const Main: FC<ws.QuizInfoPlayer> = ({
  quizId,
  title,
  status,
  player,
  peers,
  question,
}) => {
  const [ownName, setOwnName] = useState(player.name)

  const changeName = () => {
    ws.send({
      type: 'setName',
      quizId,
      name: ownName,
      auth: player.auth,
    })
  }

  return (
    <div className={styles.root}>
      <h1>{title}</h1>
      <ul className={styles.playerList}>
        {[player, ...(peers ?? [])].map(({ id, name }) => (
          <li key={id}>
            {id !== player.id ? (
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
      {status.startsWith('preview@') && (
        <Preview html={question?.previewText} />
      )}
      {status.startsWith('question@') && (
        <Question question={question?.question} />
      )}
      {status === 'done' && <Done />}
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

const Preview: FC<{ html?: string }> = ({ html }) => {
  if (!html) return null
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

const Question: FC<{ question: React.ReactNode }> = () => {
  return <div>question</div>
}

const Done = () => {
  return <span>Done</span>
}
