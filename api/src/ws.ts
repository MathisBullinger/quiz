import type { APIGatewayEvent, DynamoDBStreamEvent } from 'aws-lambda'
import * as db from './db'
import * as auth from './util/auth'
import { generate } from './util/key'
import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk'
import { DBRecord } from 'ddbjs'
import { isRejected } from 'froebel/settled'
import omit from 'froebel/omit'
import { partition, pick } from 'froebel'

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
  await updatePlayers(data)
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
      sendQuizInfoToPlayer({ connectionId }, data)
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
  { playerId, connectionId }: { playerId?: string; connectionId?: string },
  { pk: quizId, key, sk, players, ...data }: DBRecord<typeof db['quiz']>
) => {
  const [[player], peersRaw] = partition(
    players ?? [],
    ({ id, connectionId: conId }) =>
      playerId ? id === playerId : connectionId === conId
  )
  const peers = peersRaw.map(v => omit(v, 'connectionId', 'auth'))
  if (!player) return console.warn(`couldn't find player`)
  const question = data.status?.includes('@')
    ? await fetchQuestion(key!, data.status)
    : undefined
  await wsPost(player.connectionId, {
    type: 'quizStatus',
    ...data,
    question,
    quizId,
    player,
    peers,
  })
}

const fetchQuestion = async (key: string, stage: string) => {
  if (!stage.includes('@')) return
  const question = await db.question.get(
    key,
    `question#${stage.split('@').pop()}`
  )
  if (!question) return
  if (stage.startsWith('preview')) return pick(question, 'id', 'previewText')
  return pick(question, 'id', 'question', 'answerType')
}

const handlers: Record<
  string,
  (payload: Record<string, string>, connectionId: string) => Promise<void>
> = {
  join: async ({ quizId }, connectionId) => {
    if (!quizId || !connectionId)
      throw Error('must provide quizId and connectionId')

    const playerId = generate(16)
    const player = {
      id: playerId,
      name: 'Unnamed Player',
      connectionId,
      auth: auth.createAuthToken(playerId),
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

    if (process.env.stage === 'dev')
      await sendQuizInfoToPlayer({ connectionId }, quizData)
  },
  restore: async ({ quizId, auth: token }, connectionId) => {
    const userId = auth.getUserId(token)
    if (!quizId || !userId) throw Error('must provide quizId & auth')

    let [quizData] = await Promise.all([
      db.quiz.get(quizId, 'status'),
      db.connection
        .update([connectionId, 'connection'], {
          userId: userId,
          ttl: connectionTTL(),
        })
        .add({ quizzes: [quizId] }),
    ])

    let player = quizData.players.find(({ id }) => id === userId)

    if (player?.connectionId !== connectionId) {
      await db.quiz.update([quizId, 'status'], {
        [`players[${quizData.players.indexOf(player)}].connectionId`]:
          connectionId,
      })
      player.connectionId = connectionId
    }

    if (!player) {
      const playerId = generate(16)
      player = {
        id: playerId,
        name: 'Unnamed Player',
        connectionId,
        auth: playerId,
      }
      quizData = (await db.quiz
        .update([quizId, 'status'])
        .push({ players: [player] })
        .returning('NEW')) as any
    }

    if (process.env.stage === 'dev')
      await sendQuizInfoToPlayer({ playerId: player.id }, quizData)
  },
  setName: async ({ quizId, name, auth: authToken }) => {
    const playerId = auth.getUserId(authToken)
    const data = await db.quiz.get(quizId, 'status')
    const playerIndex = data?.players?.findIndex(({ id }) => id === playerId)
    if (playerIndex < 0) return
    await db.quiz.update([quizId, 'status'], {
      [`players[${playerIndex}].name`]: name,
    })
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

const connectionTTL = () =>
  Math.round(new Date(Date.now() + 1000 * 60 * 60 * 24).getTime() / 1000)
