import CreateAxiosInstance from "./create-axios";
import { IXmovRequest } from ".";
import { responseHandler } from "./handlers";
const XMovAxios = CreateAxiosInstance({ responseHandler });

/**
 * 请求服务 xmovRequest
 * @param url api 地址
 * @param options axios 配置
 * @returns 返回 IResponse 格式数据的 promise
 */
const xmovRequest: IXmovRequest = (url, options) => XMovAxios({ url, ...options });

export default xmovRequest;
