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
    : undefined
)

export const question = new DDB(
  'quiz',
  {
    [DDB.key]: ['pk', 'sk'],
    pk: String,
    sk: String,
    id: String,
    question: String,
    showPreview: Boolean,
    previewDuration: Number,
    previewText: String,
    answerType: String,
    options: [],
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
  },
  edit.client
)
