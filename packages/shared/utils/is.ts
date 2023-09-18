const toString = Object.prototype.toString
const isArray = Array.isArray
const isMap = (val: unknown): val is Map<any, any> => toString.call(val) === '[object Map]'
const isSet = (val: unknown): val is Set<any> => toString.call(val) === '[object Set]'
const isDate = (val: unknown): val is Date => toString.call(val) === '[object Date]'
const isBoolean = (val: unknown): val is boolean => typeof val === 'boolean'
const isFunction = <T extends Function>(val: unknown): val is T => typeof val === 'function'
const isNumber = (val: unknown): val is number => typeof val === 'number'
const isString = (val: unknown): val is string => typeof val === 'string'
const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'
const isObject = (val: unknown): val is Record<any, any> => toString.call(val) === '[object Object]'
const hasOwn = <T extends object, K extends keyof T>(val: T, key: K): key is K => Object.prototype.hasOwnProperty.call(val, key)
export const typeOf = function(obj: unknown) {
  return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase()
}
export {
  isArray,
  isMap,
  isSet,
  isDate,
  isFunction,
  isBoolean,
  isNumber,
  isString,
  isSymbol,
  isObject,
  hasOwn
}