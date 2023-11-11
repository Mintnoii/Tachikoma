import qs from 'qs'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import {
  responseHandler,
  defaultRequestHandler,
  defaultRequestErrorHandler,
  defaultResponseErrorHandler,
} from './handlers'
import { IRequest, IAxiosHandlers } from './index.d'

const customConfig = {
  baseURL: 'https://api.test.com',
  timeout: 0,
  headers: { 'Content-Type': 'application/json' },
  paramsSerializer: (params: any) => {
    return qs.stringify(params, { arrayFormat: 'comma' })
  },
}

export const CreateAxiosInstance = (config: AxiosRequestConfig, handlers: IAxiosHandlers) => {
  const {
    responseHandler,
    requestHandler = defaultRequestHandler,
    requestErrorHandler = defaultRequestErrorHandler,
    responseErrorHandler = defaultResponseErrorHandler,
  } = handlers
  const axiosInstance: AxiosInstance = axios.create({ ...customConfig, ...config })
  // 请求拦截
  axiosInstance.interceptors.request.use(requestHandler, requestErrorHandler)
  // 响应拦截
  axiosInstance.interceptors.response.use(responseHandler, responseErrorHandler)
  return axiosInstance
}

/**
 * 请求服务 QingRequest
 * @param url api 地址
 * @param options axios 配置
 * @returns 返回 IResponse 格式数据的 promise
 */
const QingRequest: IRequest = (url, options) => {
  const config = { url, ...options }
  const QingAxios = CreateAxiosInstance(config, { responseHandler })
  return QingAxios(url, options)
}

export default QingRequest
