import { Injectable, UnauthorizedException, ConflictException, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import type { RegisterDto, LoginDto, AuthResponseDto, JwtPayload } from './dtos/auth.dto'

// 简单的用户存储（生产环境应使用数据库）
interface User {
  id: string
  username: string
  email?: string
  password: string
  createdAt: Date
}

@Injectable()
export class AuthService implements OnModuleInit {
  private users: Map<string, User> = new Map()
  private nextUserId = 2

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService
  ) {
  }

  async onModuleInit() {
    // 创建默认测试用户（确保 app.init() 前可用，避免竞态）
    await this.createDefaultUser()
  }

  private async createDefaultUser() {
    const username = this.configService.get<string>('DEFAULT_USERNAME') || 'admin'
    const password = this.configService.get<string>('DEFAULT_PASSWORD') || 'admin123'
    const hashedPassword = await bcrypt.hash(password, 10)

    if (this.users.has('1')) return

    this.users.set('1', {
      id: '1',
      username,
      password: hashedPassword,
      createdAt: new Date(),
    })
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // 检查用户名是否已存在
    for (const user of this.users.values()) {
      if (user.username === dto.username) {
        throw new ConflictException('Username already exists')
      }
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(dto.password, 10)

    // 创建新用户
    const userId = String(this.nextUserId++)
    const user: User = {
      id: userId,
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
      createdAt: new Date(),
    }
    this.users.set(userId, user)

    // 生成令牌
    return this.generateTokens(user)
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = this.findUserByUsername(dto.username)

    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password)

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials')
    }

    return this.generateTokens(user)
  }

  async validateUser(userId: string): Promise<{ id: string; username: string } | null> {
    const user = this.users.get(userId)
    if (!user) {
      return null
    }
    return {
      id: user.id,
      username: user.username,
    }
  }

  private findUserByUsername(username: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user
      }
    }
    return undefined
  }

  private async generateTokens(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
    }

    const accessToken = await this.jwtService.signAsync(payload)

    // 使用额外的 payload 信息作为 refresh token 基础
    const refreshPayload = { ...payload, type: 'refresh' }
    const refreshToken = await this.jwtService.signAsync(refreshPayload)

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    }
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload & { type?: string }>(
        refreshToken
      )

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token')
      }

      const user = this.users.get(payload.sub)
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token')
      }

      return this.generateTokens(user)
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }
}
