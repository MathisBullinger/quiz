import { DDB } from 'ddbjs'

const db = new DDB('quiz', { [DDB.key]: ['pk', 'sk'], pk: String, sk: String })

export default db
