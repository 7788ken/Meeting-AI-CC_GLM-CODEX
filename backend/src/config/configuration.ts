export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  apiPrefix: process.env.API_PREFIX || 'api',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // 数据库配置
  postgres: {
    url: process.env.POSTGRES_URL || 'postgresql://localhost:5432/meeting_ai',
  },
  mongo: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/meeting_ai',
  },

  // AI模型配置
  ai: {
    qianwen: {
      apiKey: process.env.QIANWEN_API_KEY || '',
      endpoint: process.env.QIANWEN_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1',
    },
    doubao: {
      apiKey: process.env.DOUBAO_API_KEY || '',
      endpoint: process.env.DOUBAO_ENDPOINT || '',
    },
    glm: {
      apiKey: process.env.GLM_API_KEY || '',
      endpoint: process.env.GLM_ENDPOINT || '',
    },
  },

  // 语音识别配置
  transcript: {
    endpoint: process.env.TRANSCRIPT_ENDPOINT || '',
    apiKey: process.env.TRANSCRIPT_API_KEY || '',
  },
})
