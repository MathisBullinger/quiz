import React, { FC, useEffect, useState } from 'react'
import { RouteProps } from 'itinero'
import { useAPICall, QueryResult, APIError, useAPI, Question } from '../api'
import * as styles from './Edit.module.css'
import { useAppContext } from '../context'
import { history } from 'itinero'
import Button from 'components/Button'
import Input from 'components/Input'
import TextArea from 'components/TextArea'
import omit from 'froebel/omit'
import CheckBox from 'components/Checkbox'
import Select from 'components/Select'

const Edit: FC<RouteProps<{}, { key: string }>> = ({ match }) => {
  const [fetching, data, error] = useAPICall('getQuizEdit', match.key)
  const context = useAppContext()

  useEffect(() => {
    if (error instanceof APIError && error.status === 404) {
      context.pushError({ type: 'error', message: "This quiz doesn't exist" })
      history.push('/')
    }
  }, [error])

  if (fetching || error) return null
  return <Main quizKey={match.key} {...data} />
}

export default Edit

const Main: FC<QueryResult<'getQuizEdit'> & { quizKey: string }> = ({
  quizId,
  quizKey,
  ...initial
}) => {
  const linkParticipate = `${location.origin}/${quizId}`
  const linkHost = `${location.origin}/host/${quizKey}/${quizId}`
  const [questions, setQuestions] = useState(initial.questions)
  const [questionDiff, setQuestionDiff] = useState<
    Record<
      string,
      Partial<Omit<Question, 'options'>> & {
        options?: Record<string, string>
        correct?: string
      }
    >
  >(Object.fromEntries(questions.map(({ id }) => [id, {}])))
  const [title, setTitle] = useState(initial.title)
  const [savedTitle, setSavedTitle] = useState(initial.title)
  const api = useAPI()

  const saveTitle = async () => {
    await api.editMeta(quizKey, quizId, { title })
    setSavedTitle(title)
  }

  const addQuestion = async () => {
    const question = await api.addQuestion(quizKey, quizId)
    setQuestions(questions => [...questions, question])
  }

  useEffect(() => {
    setQuestionDiff(diff =>
      Object.fromEntries(
        Object.entries(diff).map(([id, v]) => {
          const known = questions.find(q => q.id === id)

          const qDiff = Object.fromEntries(
            Object.entries(omit(v, 'options')).filter(
              ([k, v]) => v !== known?.[k]
            )
          )

          const aDiff = Object.entries(v.options ?? {}).filter(
            ([oId, text]) => text !== known.options.find(v => v.id === oId).text
          )
          if (aDiff.length) qDiff.options = Object.fromEntries(aDiff) as any

          return [id, qDiff]
        })
      )
    )
  }, [questions])

  const editQuestion =
    <T extends keyof Question>(id: string, key: T) =>
    (value: Question[T]) => {
      const known = questions.find(question => question.id === id)
      if (known[key] === value)
        setQuestionDiff(diff => ({ ...diff, [id]: omit(diff[id], key) }))
      else
        setQuestionDiff(diff => ({
          ...diff,
          [id]: { ...diff[id], [key]: value },
        }))
    }

  const saveQuestion = (id: string) => async () => {
    const known = questions.find(question => question.id === id)
    if (!known || !questionDiff[id]) return
    const { options, ...diff } = questionDiff[id] ?? {}
    const newData = {
      ...known,
      ...diff,
    }
    if (questionDiff[id]?.options) {
      for (let i = 0; i < known.options.length; i++) {
        const { id, text } = known.options[i]
        newData.options[i] = { id, text: options[id] ?? text }
      }
    }
    let requests: Promise<unknown>[] = []

    if (Object.keys(diff).length)
      requests.push(api.editQuestion(quizKey, id, diff))

    for (const [answerId, text] of Object.entries(options ?? {}))
      requests.push(api.editAnswer(quizKey, id, answerId, text))

    await Promise.all(requests)

    setQuestions(questions =>
      questions.map(question => (question.id === id ? newData : question))
    )
  }

  const addAnswer = (questionId: string) => async () => {
    const answer = await api.addAnswer(quizKey, questionId)
    setQuestions(questions =>
      questions.map(q =>
        q.id === questionId ? { ...q, options: [...q.options, answer] } : q
      )
    )
  }

  const editAnswer =
    (questionId: string, answerId: string) => (text: string) => {
      const known = questions
        .find(({ id }) => id === questionId)
        ?.options.find(({ id }) => id === answerId)

      if (known?.text === text) {
        let diffed = { ...questionDiff[questionId] }
        if (diffed.options) {
          delete diffed.options[answerId]
          if (Object.keys(diffed.options ?? {}).length === 0)
            delete diffed.options
        }
        if (Object.keys(diffed).length === 0)
          setQuestionDiff(
            Object.fromEntries(
              Object.entries(questionDiff).filter(([k]) => k !== questionId)
            )
          )
        else setQuestionDiff({ ...questionDiff, [questionId]: diffed })
      } else {
        setQuestionDiff({
          ...questionDiff,
          [questionId]: {
            ...questionDiff[questionId],
            options: { ...questionDiff[questionId]?.options, [answerId]: text },
          },
        })
      }
    }

  const deleteAnser = (questionId: string, answerId: string) => async () => {
    await api.deleteAnswer(quizKey, questionId, answerId)
    setQuestions(questions =>
      questions.map(q =>
        q.id === questionId
          ? { ...q, options: q.options.filter(({ id }) => id !== answerId) }
          : q
      )
    )
  }

  return (
    <div className={styles.edit}>
      <span>
        Editing quiz <a href={linkParticipate}>{linkParticipate}</a>. Note: Save
        this link. Without it you can't access to this quiz.
      </span>
      <span>
        Host this quiz at <a href={linkHost}>{linkHost}</a>.
      </span>
      <div className={styles.title}>
        <Button disabled={title === savedTitle} onClick={saveTitle}>
          {title === savedTitle ? 'Title: ' : 'Save'}
        </Button>
        <Input value={title} onChange={setTitle} />
      </div>
      <ol className={styles.questions}>
        {questions.map(({ id, ...initial }) => {
          const data = {
            ...initial,
            ...omit(questionDiff[id] ?? {}, 'options'),
          }
          console.log(data)
          const options = initial.options.map(({ id: answerId, text }) => ({
            id: answerId,
            text: questionDiff[id]?.options?.[answerId] ?? text,
          }))

          return (
            <li key={id} className={styles.question}>
              <TextArea
                value={data.question}
                onChange={editQuestion(id, 'question')}
                label="Question"
              />
              <label>
                Question time limit:{' '}
                <Input
                  type="number"
                  value={data.timeLimit}
                  onChange={editQuestion(id, 'timeLimit')}
                  step={1}
                  min={1}
                  pattern={/^\d*$/}
                />
              </label>
              <label>
                Show preview text:
                <CheckBox
                  checked={data.showPreview}
                  onChange={editQuestion(id, 'showPreview')}
                />
              </label>
              {data.showPreview && (
                <>
                  <label>
                    Preview Duration:{' '}
                    <Input
                      type="number"
                      value={data.previewDuration}
                      onChange={editQuestion(id, 'previewDuration')}
                      step={1}
                      min={1}
                      pattern={/^\d*$/}
                    />
                  </label>
                  <TextArea
                    value={data.previewText}
                    onChange={editQuestion(id, 'previewText')}
                    label="Preview Text"
                  />
                </>
              )}
              <label>
                Answer Type:{' '}
                <Select
                  options={['multiple-choice', 'free-text']}
                  selected={data.answerType}
                  onSelect={editQuestion(id, 'answerType')}
                />
              </label>
              {data.answerType === 'multiple-choice' && (
                <>
                  {data.options.length > 0 && (
                    <ol className={styles.answers}>
                      {options.map(({ id: answerId, text }) => (
                        <li key={answerId} className={styles.answerOption}>
                          <TextArea
                            value={text}
                            onChange={editAnswer(id, answerId)}
                          />
                          <Button
                            style="text"
                            onClick={deleteAnser(id, answerId)}
                          >
                            x
                          </Button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <Button style="text" onClick={addAnswer(id)}>
                    Add Answer
                  </Button>
                  <label>
                    Correct:{' '}
                    <select
                      value={data.correctAnswer}
                      onChange={({ target }) =>
                        editQuestion(id, 'correctAnswer')(target.value)
                      }
                    >
                      {options.map(({ id, text }) => (
                        <option key={id} value={id}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <Button
                disabled={!Object.values(questionDiff[id] ?? {}).length}
                onClick={saveQuestion(id)}
                className={styles.saveQuestion}
              >
                Save
              </Button>
            </li>
          )
        })}
      </ol>
      <Button onClick={addQuestion}>Add Question</Button>
    </div>
  )
}
