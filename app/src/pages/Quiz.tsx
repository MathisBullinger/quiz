import React, { FC, useEffect, useRef, useState } from 'react'
import { RouteProps } from 'itinero'
import * as styles from './Quiz.module.css'
import * as ws from '../ws'
import Countdown from '../components/Countdown'
import TextArea from 'components/TextArea'
import Button from 'components/Button'

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
          auth={player.auth}
          options={question.options}
          disabled={question?.closes && Date.now() >= question?.closes}
        />
      )}
      {question?.answerType === 'free-text' && (
        <FreeText quizId={quizId} questionId={question.id} auth={player.auth} />
      )}
      {!!question?.correctAnswer && (
        <p>The correct answer is: {question.correctAnswer}</p>
      )}
      {!!question?.closes && <Countdown closes={question.closes} />}
      {status === 'done' && <Done people={[player, ...peers]} />}
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
  disabled?: boolean
}> = ({ options, quizId, questionId, auth, disabled }) => {
  const [selected, setSelected] = useState<string>()
  const optionRef = useRef(options)
  optionRef.current = options

  useEffect(() => {
    if (!selected || disabled) return
    ws.send({ type: 'answer', quizId, questionId, auth, answer: selected })
  }, [selected, quizId, questionId, auth, selected, disabled])

  useEffect(() => {
    if (disabled) return

    const onKeyPress = (e: KeyboardEvent) => {
      const select = e.key.toLowerCase().charCodeAt(0) - 97
      if (select >= 0 && select < optionRef.current.length)
        setSelected(optionRef.current[select].id)
    }

    window.addEventListener('keypress', onKeyPress)
    return () => {
      window.removeEventListener('keypress', onKeyPress)
    }
  }, [setSelected || disabled])

  if (!options?.length) return null
  return (
    <ul className={styles.multipleChoice} data-disabled={disabled}>
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

const FreeText: FC<{
  quizId: string
  questionId: string
  auth: string
  disabled?: boolean
}> = ({ disabled, quizId, questionId, auth }) => {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')

  const onSubmit = () => {
    if (disabled) return
    setSubmitted(text)
    ws.send({ type: 'answer', quizId, questionId, auth, answer: text })
  }

  return (
    <div className={styles.freeAnswer}>
      <TextArea
        value={text}
        onChange={disabled ? () => {} : setText}
        label="Answer"
      />
      <Button disabled={disabled || text === submitted} onClick={onSubmit}>
        Submit
      </Button>
    </div>
  )
}

const Done: FC<{ people: ws.Player[] }> = ({ people }) => {
  const [ranked, setRanked] = useState<(ws.Player & { totalScore: number })[]>(
    []
  )

  useEffect(() => {
    if (!people?.length) return setRanked([])

    setRanked(
      people
        .map(person => ({
          ...person,
          totalScore: person.scores.reduce((a, c) => a + c, 0),
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
    )
  }, [people])

  return (
    <ol className={styles.scoreBoard}>
      {ranked.map(v => (
        <li>
          <details>
            <summary>
              {v.name}: {v.totalScore}
            </summary>
            <ol>
              {v.answers.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ol>
          </details>
        </li>
      ))}
    </ol>
  )
}
