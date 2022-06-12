import { useEffect, useState } from 'react'
import { useAppContext } from './context'

export class APIError extends Error {
  constructor(public readonly status: number, public readonly data?: unknown) {
    super()
  }
}

export type Question = {
  id: string
  question: string
  showPreview: boolean
  previewDuration: number
  previewText?: string
  answerType: 'multiple-choice' | 'free-text'
  options: AnswerOption[]
}

type AnswerOption = { id: string; text: string }

export const useAPI = () => {
  const context = useAppContext()

  const request = async <T extends Record<string | number, unknown>>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    body?: Record<string, unknown>
  ): Promise<T> => {
    try {
      const result = await fetch(`${process.env.API_ENDPOINT}/${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await result.json().catch(() => undefined)
      if (result.status >= 400) throw new APIError(result.status, data)
      return data
    } catch (err) {
      context.pushError({
        type: 'error',
        message: 'Something went wrong trying to reach the API.',
      })
      throw err
    }
  }

  const createQuiz = async () =>
    await request<{ key: string; quizId: string }>('quiz/create', 'POST')

  const getQuizEdit = async (key: string) =>
    await request<{ quizId: string; title: string; questions: Question[] }>(
      `quiz/edit/${key}`,
      'GET'
    )

  const editMeta = async (key: string, id: string, meta: { title?: string }) =>
    await request('quiz/edit', 'PATCH', { key, id, meta })

  const addQuestion = async (key: string, id: string) =>
    await request<Question>('quiz/question/add', 'POST', {
      key,
      id,
    })

  const editQuestion = async (
    key: string,
    questionId: string,
    data: Partial<Question>
  ) => await request('quiz/question/edit', 'PATCH', { key, questionId, data })

  const addAnswer = async (key: string, questionId: string) =>
    await request<AnswerOption>('quiz/answer/add', 'POST', { key, questionId })

  const editAnswer = async (
    key: string,
    questionId: string,
    answerId: string,
    text: string
  ) =>
    await request('quiz/answer/edit', 'PATCH', {
      key,
      questionId,
      answerId,
      text,
    })

  const deleteAnswer = async (
    key: string,
    questionId: string,
    answerId: string
  ) =>
    await request('quiz/answer/delete', 'DELETE', {
      key,
      questionId,
      answerId,
    })

  return {
    createQuiz,
    getQuizEdit,
    editMeta,
    addQuestion,
    editQuestion,
    addAnswer,
    editAnswer,
    deleteAnswer,
  }
}

type Queries = ReturnType<typeof useAPI>
export type QueryResult<T extends keyof Queries> = ReturnType<
  Queries[T]
> extends Promise<infer I>
  ? I
  : never

export const useAPICall = <T extends keyof Queries>(
  query: T,
  ...params: Parameters<Queries[T]>
) => {
  const api = useAPI()
  const [fetching, setFetching] = useState(true)
  const [result, setResult] = useState<QueryResult<T>>()
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    ;(api[query] as any)(...params)
      .then(setResult as any)
      .catch(setError)
      .finally(() => setFetching(false))
  }, [])

  return [fetching, result, error] as const
}
