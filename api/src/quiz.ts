import type { APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda'
import { pick } from 'froebel'
import * as db from './db'
import { respond } from './response'

export const get = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const quiz = await db.quiz.get(event.pathParameters!.id!, 'status')

  if (!quiz) return { statusCode: 404, body: '' }
  const data = pick(quiz, 'title', 'status')

  return respond(200, { body: data })
}
