import React, { FC, useEffect, useRef, useState } from 'react'
import { RouteProps } from 'itinero'
import * as styles from './Quiz.module.css'
import * as ws from '../ws'

const Quiz: FC<RouteProps<{}, { id: string }>> = ({ match }) => {
  const quiz = ws.useSubscribe('quizStatus')

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

  console.log(question)

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
      {!!question?.previewText && <Preview html={question.previewText} />}
      {status.startsWith('answer@') && (
        <Question question={question?.question} />
      )}
      {question?.answerType === 'multiple-choice' && (
        <MultipleChoice
          quizId={quizId}
          questionId={question.id}
          options={question.options}
          auth={player.auth}
        />
      )}
      {!!question?.closes && <CountDown closes={question.closes} />}
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

const Question: FC<{ question: string }> = ({ question }) => {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: question }}
      className={styles.question}
    />
  )
}

const MultipleChoice: FC<{
  quizId: string
  questionId: string
  auth: string
  options?: { id: string; text: string }[]
}> = ({ options, quizId, questionId, auth }) => {
  const [selected, setSelected] = useState<string>()
  const optionRef = useRef(options)
  optionRef.current = options

  useEffect(() => {
    if (!selected) return
    ws.send({ type: 'answer', quizId, questionId, auth, answer: selected })
  }, [selected, quizId, questionId, auth, selected])

  useEffect(() => {
    const onKeyPress = (e: KeyboardEvent) => {
      const select = e.key.toLowerCase().charCodeAt(0) - 97
      if (select < optionRef.current.length)
        setSelected(optionRef.current[select].id)
    }

    window.addEventListener('keypress', onKeyPress)
    return () => {
      window.removeEventListener('keypress', onKeyPress)
    }
  }, [setSelected])

  if (!options?.length) return null
  return (
    <ul className={styles.multipleChoice}>
      {options.map(({ id, text }) => (
        <li
          key={id}
          onClick={() => setSelected(id)}
          data-selected={id === selected}
        >
          <div
            className={styles.option}
            dangerouslySetInnerHTML={{ __html: text }}
          />
        </li>
      ))}
    </ul>
  )
}

const CountDown: FC<{ closes: number }> = ({ closes }) => {
  const [sec, setSec] = useState(Math.round((closes - Date.now()) / 1000))

  useEffect(() => {
    const update = () => {
      const updated = (closes - Date.now()) / 1000
      if (updated <= 0) {
        setSec(0)
        return
      }
      setSec(Math.round(updated))
      setTimeout(update, (updated % 1000) + 50)
    }
    update()
  }, [closes, setSec])

  return <span className={styles.countdown}>{sec}</span>
}

const Done = () => {
  return <span>Done</span>
}
