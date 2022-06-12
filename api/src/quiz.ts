import type { APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda'
import { pick } from 'froebel'
import * as db from './db'

export const get = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const quiz = await db.quiz.get(event.pathParameters!.id!, 'status')

  console.log({ quiz })

  if (!quiz) return { statusCode: 404, body: '' }

  const data = pick(quiz, 'title', 'status')

  return { statusCode: 200, body: JSON.stringify(data) }
}
