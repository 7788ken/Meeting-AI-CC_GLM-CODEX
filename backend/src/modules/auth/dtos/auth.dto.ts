export interface RegisterDto {
  username: string
  password: string
  email?: string
}

export interface LoginDto {
  username: string
  password: string
}

export interface AuthResponseDto {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    username: string
    email?: string
  }
}

export interface JwtPayload {
  sub: string
  username: string
  iat?: number
  exp?: number
}
