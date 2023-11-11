import { AxiosRequestConfig, InternalAxiosRequestConfig, AxiosError, AxiosResponse } from 'axios'

/**
 * 接口返回类型
 * ok 成功与否
 * data 接口数据
 * msg 错误信息
 */
export interface IResponse {
  ok: boolean
  data: any
  msg: string
  [key: string]: any
}

export interface IRequest {
  (url: string, options?: AxiosRequestConfig): Promise<IResponse>
}

export interface RequestHandlerFunc {
  (requestConfig: InternalAxiosRequestConfig): InternalAxiosRequestConfig
}

export interface ResponseHandlerFunc {
  (response: AxiosResponse): Promise<any>
}

export interface ErrorHandlerFunc {
  (error: AxiosError): Promise<never>
}

export interface IAxiosHandlers {
  responseHandler: ResponseHandlerFunc
  requestHandler?: RequestHandlerFunc
  requestErrorHandler?: ErrorHandlerFunc
  responseErrorHandler?: ErrorHandlerFunc
}
