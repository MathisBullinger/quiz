import type { APIGatewayEvent, DynamoDBStreamEvent } from 'aws-lambda'
import * as db from './db'
import * as auth from './util/auth'
import { generate } from './util/key'
import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk'
import pick from 'froebel/pick'
import { DBRecord } from 'ddbjs'
import { isRejected } from 'froebel/settled'

const gateway = new ApiGatewayManagementApi({
  endpoint:
    process.env.stage === 'dev'
      ? 'http://localhost:3001'
      : process.env.WS_ENDPOINT,
})

const wsPost = async (ConnectionId: string, data: Record<string, unknown>) =>
  await gateway
    .postToConnection({ ConnectionId, Data: JSON.stringify(data) })
    .promise()

export const handler = async (event: APIGatewayEvent) => {
  if (event.requestContext.routeKey === '$connect') {
    return { statusCode: 200 }
  }
  if (event.requestContext.routeKey === '$disconnect') {
    const conInfo = await db.connection.get(
      event.requestContext.connectionId!,
      'connectionId'
    )
    if (conInfo)
      await Promise.all([
        ...conInfo.quizzes.map(quizId =>
          db.quiz.get(quizId, 'status').then(quiz => {
            const playerIndex = quiz.players.find(
              ({ id }) => id === conInfo.userId
            )
            if (playerIndex < 0) return
            db.quiz.update([quizId, 'status']).remove(`players[${playerIndex}]`)
          })
        ),
        ...conInfo.hosts.map(key =>
          db.host
            .update([key, 'host'])
            .delete({ hosts: [event.requestContext.connectionId!] })
        ),
      ])

    return { statusCode: 200 }
  }

  try {
    const msg = JSON.parse(event.body!)
    await handlers[msg.type]?.(msg, event.requestContext.connectionId!)
    return { statusCode: 200 }
  } catch (err) {
    console.error(err)
    return { statusCode: 500 }
  }
}

export const dbPush = async (event: DynamoDBStreamEvent) => {
  const data = DynamoDB.Converter.unmarshall(
    event.Records[0].dynamodb?.NewImage!
  )
  if (data.sk !== 'status') return
  await updateHost(data)
}

const updateHost = async (data: any) => {
  const hostData = await db.host.get(data.key, 'host')
  const results = await Promise.allSettled(
    hostData?.hosts?.map(id => sendQuizInfoToHost(id, data))
  )
  results.filter(isRejected).forEach(res => console.log('failed to push', res))
}

const updatePlayers = async (data: any) => {
  const results = await Promise.allSettled(
    data.players?.map(({ connectionId }: any) =>
      sendQuizInfoToPlayer(connectionId, data)
    )
  )
  results.filter(isRejected).forEach(res => console.log('failed to push', res))
}

const sendQuizInfoToHost = async (
  host: string,
  { pk: quizId, key: quizKey, sk, ...data }: DBRecord<typeof db['quiz']>
) => {
  await wsPost(host, { type: 'quizInfo', ...data, quizId, quizKey })
}

const sendQuizInfoToPlayer = async (
  player: string,
  { pk: quizId, key, sk, ...data }: DBRecord<typeof db['quiz']>
) => {
  for (const player of data.players ?? []) delete player.connectionId
  await wsPost(player, { type: 'quizStatus', ...data, quizId })
}

const handlers: Record<
  string,
  (payload: Record<string, string>, connectionId: string) => Promise<void>
> = {
  join: async ({ quizId }, connectionId) => {
    if (!quizId || !connectionId)
      throw Error('must provide quizId and connectionId')

    const player = {
      id: generate(16),
      name: 'Unnamed Player',
      connectionId,
    }

    const [quizData] = await Promise.all([
      db.quiz
        .update([quizId, 'status'])
        .push({ players: [player] })
        .ifExists()
        .returning('NEW'),
      db.connection
        .update([connectionId, 'connection'], {
          userId: player.id,
          ttl: connectionTTL(),
        })
        .add({ quizzes: [quizId] }),
    ])

    const peers = quizData.players
      ?.filter(({ id }) => id !== player.id)
      .map(filterPlayerPublic)

    await respondInit(connectionId, player, peers ?? [])
  },
  restore: async ({ quizId, auth: token }, connectionId) => {
    const userId = auth.getUserId(token)
    if (!quizId || !userId) throw Error('must provide quizId & auth')

    const [quizData] = await Promise.all([
      db.quiz.get(quizId, 'status'),
      db.connection
        .update([connectionId, 'connection'], {
          userId: userId,
          ttl: connectionTTL(),
        })
        .add({ quizzes: [quizId] }),
    ])

    let player = quizData.players.find(({ id }) => id === userId)
    const peers = quizData.players.filter(v => v !== player)

    if (!player) {
      player = {
        id: generate(16),
        name: 'Unnamed Player',
        connectionId,
      }
      await db.quiz.update([quizId, 'status']).push({ players: [player] })
    }

    await respondInit(connectionId, player, peers)
  },
  host: async ({ quizKey, quizId }, connectionId) => {
    if (!quizKey || !quizId) throw Error('must provide quiz key & id')

    const [quizInfo] = await Promise.all([
      db.quiz.get(quizId, 'status'),
      db.host.update([quizKey, 'host']).add({ hosts: [connectionId] }),
      db.connection
        .update([connectionId, 'connection'], { ttl: connectionTTL() })
        .add({ hosts: [quizKey] }),
    ])

    await sendQuizInfoToHost(connectionId, quizInfo)
  },
  nextStage: async ({ quizKey, quizId }) => {
    const [status, data] = await Promise.all([
      db.quiz.get(quizId, 'status'),
      db.edit.get(quizKey, `id#${quizId}`),
    ])

    if (status.status === 'done') return

    let advanceQuestion =
      status.status === 'pending' || status.status.startsWith(`answer@`)

    const currentQuestionIndex =
      status.status === 'pending'
        ? -1
        : data.questions.indexOf(status.status.split('@').pop())

    let nextStatus: string

    if (advanceQuestion) {
      nextStatus =
        currentQuestionIndex + 1 >= data.questions.length
          ? 'done'
          : data.questions[currentQuestionIndex + 1]

      if (nextStatus !== 'done') {
        const question = await db.question.get(
          quizKey,
          `question#${nextStatus}`
        )
        console.log('advance to question', question)
        nextStatus = question.showPreview
          ? `preview@${nextStatus}`
          : `answer@${nextStatus}`
      }
    } else {
      nextStatus = `answer@${status.status.split('@').pop()}`
    }

    await db.quiz.update([quizId, 'status'], { status: nextStatus })
  },
}

const respondInit = async (connectionId: string, player: any, peers: any[]) => {
  await Promise.all([
    wsPost(connectionId, {
      type: 'user',
      ...player,
      auth: auth.createAuthToken(player.id),
    }),
    (peers?.length ?? 0) > 0 &&
      wsPost(connectionId, {
        type: 'peers',
        peers,
      }),
  ])
}

const filterPlayerPublic = (data: any) => pick(data, 'id', 'name')
const connectionTTL = () =>
  Math.round(new Date(Date.now() + 1000 * 60 * 60 * 24).getTime() / 1000)
