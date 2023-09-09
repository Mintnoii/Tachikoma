// import * as is from './is'

// export { is }

const toString = Object.prototype.toString
export const isDate = (val: unknown): val is Date => toString.call(val) === '[object Date]'