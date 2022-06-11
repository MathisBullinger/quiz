import { useAppContext } from './context'

export const useAPI = () => {
  const context = useAppContext()

  const request = async <T extends Record<string | number, unknown>>(
    path: string,
    method = 'POST'
  ): Promise<T> => {
    try {
      const result = await fetch(`${process.env.API_ENDPOINT}/${path}`, {
        method,
      })
      return await result.json()
    } catch (err) {
      context.pushError({
        type: 'error',
        message: 'Something went wrong trying to reach the API.',
      })
      throw err
    }
  }

  const createQuiz = async () =>
    await request<{ key: string; id: string }>('quiz/create')

  return { createQuiz }
}
