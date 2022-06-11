import type {
  Context,
  APIGatewayProxyResult,
  APIGatewayEvent,
} from 'aws-lambda'
import { generate } from './util/key'

export const create = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const key = generate(8)
  const id = generate(4)

  return { statusCode: 200, body: JSON.stringify({ key, id }) }
}
