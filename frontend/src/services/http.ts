import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

// API响应类型
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// 创建HTTP实例
const getBaseUrl = () => {
  return (globalThis as any).__VITE_API_BASE_URL__ || '/api'
}

export const http: AxiosInstance = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const setApiBaseUrl = (baseURL: string) => {
  http.defaults.baseURL = baseURL || '/api'
}

export const getApiBaseUrl = () => http.defaults.baseURL || '/api'

// 请求拦截器
http.interceptors.request.use(
  config => {
    // 可在此添加token等认证信息
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
http.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    const message = error.response?.data?.message || error.message || '请求失败'
    console.error('[API Error]', message)
    return Promise.reject(new Error(message))
  }
)

// 通用请求方法
export const request = async <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  return http.request<T>(config) as Promise<T>
}

export const get = <T = unknown>(url: string, config?: AxiosRequestConfig) => {
  return request<T>({ ...config, method: 'GET', url })
}

export const post = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) => {
  return request<T>({ ...config, method: 'POST', url, data })
}

export const put = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) => {
  return request<T>({ ...config, method: 'PUT', url, data })
}

export const del = <T = unknown>(url: string, config?: AxiosRequestConfig) => {
  return request<T>({ ...config, method: 'DELETE', url })
}

export default http
