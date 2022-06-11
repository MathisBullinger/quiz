import crypto from 'crypto'

export const generate = (bytes: number) =>
  crypto.randomBytes(bytes).toString('base64url')
