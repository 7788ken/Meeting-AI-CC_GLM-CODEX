import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MinLength } from 'class-validator'

export class AppConfigSecurityStatusDto {
  @ApiProperty({ description: '是否已设置系统安全密码' })
  enabled: boolean
}

export class VerifyAppConfigSecurityDto {
  @ApiProperty({ description: '系统安全密码' })
  @IsString()
  @MinLength(1)
  password: string
}

export class AppConfigSecurityVerifyResponseDto {
  @ApiProperty({ description: '密码是否校验通过' })
  verified: boolean
}

export class UpdateAppConfigSecurityPasswordDto {
  @ApiProperty({ description: '新的系统安全密码' })
  @IsString()
  @MinLength(1)
  password: string

  @ApiPropertyOptional({ description: '当前系统安全密码（已设置时必填）' })
  @IsOptional()
  @IsString()
  currentPassword?: string
}

export class AppConfigSecurityUpdateResponseDto {
  @ApiProperty({ description: '密码是否更新成功' })
  updated: boolean
}
