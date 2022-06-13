import jwt from 'jsonwebtoken'

export const getUserId = (idCookie?: string) => {
  if (!idCookie) return

  const decoded = jwt.verify(idCookie, process.env.JWT_PUBLIC!, {
    algorithms: ['RS256'],
  })

  return (decoded as any)?.id as string
}

export const createAuthToken = (userId: string) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET!, {
    algorithm: 'RS256',
  })
