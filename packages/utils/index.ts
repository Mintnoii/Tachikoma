import is from './src/is'
import fs from './src/fs'

/**
 * 处理 Promise 的结果和错误，返回一个包含结果或错误的数组。
 *
 * @template T - Promise 的结果类型
 * @template U - 错误类型，默认为 Error
 * @param {Promise<T>} promise - 要处理的 Promise 对象
 * @param {object} [errorExt] - 附加到错误对象的额外信息
 * @returns {Promise<[U, undefined] | [null, T]>} 处理后的结果，数组的第一项是错误（如果有），第二项是结果（如果有）
 */
// https://github.com/scopsy/await-to-js/blob/master/src/await-to-js.ts
export function handleErrorPromise<T, U = Error>(
  promise: Promise<T>,
  errorExt?: object,
): Promise<[U, undefined] | [null, T]> {
  return promise
    .then<[null, T]>((data: T) => [null, data])
    .catch<[U, undefined]>((err: U) => {
      if (errorExt) {
        const parsedError = Object.assign({}, err, errorExt)
        return [parsedError, undefined]
      }

      return [err, undefined]
    })
}

export default {
  is,
  fs,
  handleErrorPromise,
}
