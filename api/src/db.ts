import { DDB } from 'ddbjs'

export const edit = new DDB(
  'quiz',
  {
    [DDB.key]: ['pk', 'sk'],
    pk: String,
    sk: String,
    title: String,
    questions: [],
  },
  process.env.stage === 'dev'
    ? { region: 'localhost', endpoint: 'http://localhost:8000' }
    : { region: 'eu-west-1' }
)

export const question = new DDB(
  'quiz',
  {
    [DDB.key]: ['pk', 'sk'],
    pk: String,
    sk: String,
    id: String,
    question: String,
    timeLimit: Number,
    closes: Number,
    showPreview: Boolean,
    previewDuration: Number,
    previewText: String,
    answerType: String,
    options: [],
    correctAnswer: String,
  },
  edit.client
)

export const quiz = new DDB(
  'quiz',
  {
    [DDB.key]: ['pk', 'sk'],
    pk: String,
    sk: String,
    key: String,
    title: String,
    status: String,
    players: [],
    questions: [],
  },
  edit.client
)

export const connection = new DDB(
  'quiz',
  {
    [DDB.key]: ['pk', 'sk'],
    pk: String,
    sk: String,
    userId: String,
    quizzes: [String],
    hosts: [String],
    ttl: Number,
  },
  edit.client
)

export const host = new DDB(
  'quiz',
  {
    [DDB.key]: ['pk', 'sk'],
    pk: String,
    sk: String,
    hosts: [String],
  },
  edit.client
)
