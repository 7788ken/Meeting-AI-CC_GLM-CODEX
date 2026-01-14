export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5181,
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
    glm: {
      apiKey: process.env.GLM_API_KEY || '',
      endpoint: process.env.GLM_ENDPOINT || '',
    },
  },
})
