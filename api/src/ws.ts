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
  const question = data.status?.includes('@')
    ? await fetchQuestion(quizKey!, data.status)
    : undefined
  await wsPost(host, { type: 'quizInfo', ...data, question, quizId, quizKey })
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
  const peers = peersRaw.map(v =>
    omit(
      v,
      'connectionId',
      'auth',
      ...(data.status !== 'done' ? ['answers', 'scores'] : [])
    )
  )
  if (!player) return console.warn(`couldn't find player`)

  if (data.status === 'done') {
    const questions = await Promise.all(
      (data.questions ?? []).map(id => db.question.get(key!, `question#${id}`))
    )

    for (const person of [player, ...peers].filter(Boolean)) {
      for (let i = 0; i < person.answers ?? []; i++) {
        if (questions[i].answerType === 'multiple-choice') {
          person.answers[i] = questions[i].options.find(
            ({ id }) => id === person.answers[i]
          )
        }
      }
    }
  }

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
  let data: any = stage.startsWith('preview')
    ? pick(question, 'sk', 'previewText')
    : pick(
        question,
        'sk',
        'previewText',
        'question',
        'answerType',
        'options',
        'timeLimit',
        'closes',
        ...((stage.startsWith('result') ? ['correctAnswer'] : []) as any)
      )
  if (data.correctAnswer && data.options)
    data.correctAnswer = data.options.find(
      ({ id }: any) => id === data.correctAnswer
    )?.text
  data.id = data.sk.split('#').pop()
  delete data.sk
  return data
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
      answers: [],
      scores: [],
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
        answers: [],
        scores: [],
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
  answer: async ({ quizId, questionId, auth: authToken, answer }) => {
    const playerId = auth.getUserId(authToken)
    const data = await db.quiz.get(quizId, 'status')
    const playerIndex = data?.players?.findIndex(({ id }) => id === playerId)
    const questionIndex = data?.questions?.findIndex(id => id === questionId)
    if (playerIndex < 0 || questionIndex < 0) return
    await db.quiz.update([quizId, 'status'], {
      [`players[${playerIndex}].answers[${questionIndex}]`]: answer,
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
      status.status === 'pending' || status.status.startsWith(`result@`)

    const currentQuestionId = status.status.includes('@')
      ? status.status.split('@').pop()
      : null
    const currentQuestionIndex =
      status.status === 'pending'
        ? -1
        : data.questions.indexOf(currentQuestionId)

    if (status.status.startsWith('answer')) {
      const currentQuestion = await db.question.get(
        quizKey,
        `question#${currentQuestionId}`
      )
      console.log('rate answers', currentQuestionId)

      await db.quiz.update([quizId, 'status']).push(
        Object.fromEntries(
          status.players.map(({ id, answers }, i) => {
            let score = 0

            if (currentQuestion.answerType === 'multiple-choice') {
              if (
                answers[currentQuestionIndex] === currentQuestion.correctAnswer
              )
                score = 1
            } else {
              if (
                normalizeFreeText(answers[currentQuestionIndex]) ===
                normalizeFreeText(currentQuestion.correctAnswer)
              )
                score = 1
            }

            console.log(`score player ${id}: ${score}`)
            return [`players[${i}].scores`, [score]] as const
          }) as any
        )
      )
    }

    let nextStatus: string

    let question: any = null
    if (advanceQuestion) {
      nextStatus =
        currentQuestionIndex + 1 >= data.questions.length
          ? 'done'
          : data.questions[currentQuestionIndex + 1]

      if (nextStatus !== 'done') {
        question = await db.question.get(quizKey, `question#${nextStatus}`)
        nextStatus = question.showPreview
          ? `preview@${nextStatus}`
          : `answer@${nextStatus}`
      }
    } else {
      const nextStep = status.status.startsWith('preview@')
        ? 'answer'
        : 'result'
      nextStatus = `${nextStep}@${status.status.split('@').pop()}`
    }

    const update: any = { status: nextStatus }
    if (nextStatus.startsWith('answer@')) {
      const questionId = `question#${nextStatus.split('@').pop()}`
      question = question ?? (await db.question.get(quizKey, questionId))
      if (question.timeLimit)
        await db.question.update([quizKey, questionId], {
          closes: Date.now() + 1000 * question.timeLimit,
        })
    }
    await db.quiz.update([quizId, 'status'], update)
  },
}

const normalizeFreeText = (input: string = '') =>
  input
    .replace(/\r\n/g, '\n')
    .split(/\n/)
    .filter(v => v.match(/[^\s]/))
    .map(v => {
      let line = v.replace(/^\s*/, '').replace(/\s*$/, '')
      if (
        (line.startsWith('"') && line.endsWith('"')) ||
        (line.startsWith("'") && line.endsWith("'"))
      )
        line = line.slice(1, -1)
      return line
    })
    .join('\n')

const connectionTTL = () =>
  Math.round(new Date(Date.now() + 1000 * 60 * 60 * 24).getTime() / 1000)
