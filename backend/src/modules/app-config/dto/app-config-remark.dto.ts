import { ApiProperty } from '@nestjs/swagger'

export class AppConfigRemarkDto {
  @ApiProperty({ description: '配置键名（与 app_configs.key 对应）' })
  key: string

  @ApiProperty({ description: '备注说明' })
  remark: string
}
