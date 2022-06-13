import type {
  APIGatewayProxyResult,
  APIGatewayEvent,
  Context,
} from 'aws-lambda'
import { pick } from 'froebel'
import * as db from './db'
import jwt from 'jsonwebtoken'
import { generate } from './util/key'

export const get = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const quiz = await db.quiz.get(event.pathParameters!.id!, 'status')

  if (!quiz) return { statusCode: 404, body: '' }

  let userId = getUserId(getCookie('id', event.headers as any))
  const data = pick(quiz, 'title', 'status', 'players')

  const headers: Record<string, string | number | boolean> = {
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Origin':
      process.env.stage === 'dev'
        ? 'http://localhost:1234'
        : 'https://quiz.bullinger.dev',
  }

  if (!userId) {
    const [token, player] = await addPlayer(event.pathParameters!.id!)

    if (!data.players.find(({ id }) => id === player.id))
      data.players.push(player)

    userId = player.id

    headers['Set-Cookie'] = [
      `id=${token}`,
      `Expires=${new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 30
      ).toUTCString()}`,
      process.env.stage !== 'dev' && 'Secure',
      'HttpOnly',
      process.env.stage !== 'dev' && 'Domain=quiz.bullinger.dev',
      `SameSite=${process.env.stage === 'dev' ? 'Lax' : 'Strict'}`,
    ]
      .filter(Boolean)
      .join('; ')
  }

  ;(data as any).me = userId

  return {
    statusCode: 200,
    body: JSON.stringify(data),
    headers,
  }
}

const addPlayer = async (quizId: string) => {
  const player = {
    id: generate(16),
    name: 'Unnamed Player',
  }

  console.log(
    db.quiz
      .update([quizId, 'status'])
      .push({ players: [player] })
      .ifExists().expr
  )

  await db.quiz
    .update([quizId, 'status'])
    .push({ players: [player] })
    .ifExists()

  return [
    jwt.sign({ id: player.id }, process.env.JWT_SECRET!, {
      algorithm: 'RS256',
    }),
    player,
  ] as const
}

const getCookie = (name: string, headers: Record<string, string>) => {
  const cookieHeader = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === 'cookie'
  )?.[1]

  const cookies = Object.fromEntries(
    cookieHeader?.split(';').map(v => v.trim().split('=')) ?? []
  )

  return cookies[name]
}

const getUserId = (idCookie?: string) => {
  if (!idCookie) return

  const decoded = jwt.verify(idCookie, process.env.JWT_PUBLIC!, {
    algorithms: ['RS256'],
  })

  return (decoded as any)?.id as string
}
