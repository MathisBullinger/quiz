import type { APIGatewayProxyResult } from 'aws-lambda'

export const respond = (
  statusCode: number,
  {
    body = '',
    headers = {},
  }: { body?: unknown; headers?: Record<string, string> } = {}
): APIGatewayProxyResult => ({
  statusCode,
  body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: {
    ...headers,
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Origin':
      process.env.stage === 'dev'
        ? 'http://localhost:1234'
        : 'https://quiz.bullinger.dev',
  },
})
