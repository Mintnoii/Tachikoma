import { relative, resolve, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

export const __filename = fileURLToPath(normalizePath(import.meta.url))
export const __dirname = dirname(__filename)

export const require = createRequire(import.meta.url)
/** 抹平 Win 与 Linux 系统路径分隔符之间的差异 */
function normalizePath(path: string) {
  // 如果当前系统的路径分隔符是斜杠（/）则直接返回原始路径；
  if (sep === '/') {
    return path
  }
  // 否则，使用正则表达式将路径中的反斜杠替换为斜杠
  return path.replace(new RegExp(`\\${sep}`, 'g'), '/')
}

/**
 * 给予一个基础路径，获取到一个以此为基准计算绝对路径的方法
 * @param basePath 基础路径
 * @returns 返回一个函数，该函数接受多个路径参数 string[]，代表要连接到基础路径上的路径片段
 */
export function usePathAbs(basePath: string) {
  // 【推荐】使用剩余参数语法来代替 arguments 对象
  // 剩余参数语法是 ES6 引入的一项特性，它提供了提供了更清晰、类型安全的方式来处理函数的变长参数
  // 将基础路径 basePath 与后续的路径片段 ...paths 拼接成一个完整的绝对路径。并使用 normalizePath 处理路径分隔符
  return (...paths: string[]) => normalizePath(resolve(basePath, ...paths))
}

/**
 * 给予一个基础路径，获取到一个以此为基准计算相对路径的方法
 * @param basePath 基础路径
 * @returns 返回一个函数，该函数接受目标路径，和一个可选的布尔参数 ignoreLocalSignal决定是否在相对路径前加上 ./
 */
export function usePathRel(basePath: string) {
  return (path: string, ignoreLocalSignal: boolean = true) => {
    const result = normalizePath(relative(basePath, path))
    // 如果相对路径以 '..' 开头，说明它不在基础路径下，直接返回该相对路径
    if (result.slice(0, 2) === '..') {
      return result
    }
    return ignoreLocalSignal ? result : `./${result}`
  }
}

/**
 * 获取相对于当前脚本执行位置的相对路径
 * @param paths 要连接到基础路径上的路径片段
 */
export const relCwd = usePathRel(process.cwd())
/**
 * 获取相对于当前脚本执行位置的绝对路径
 * @param paths 要连接到基础路径上的路径片段
 */
export const absCwd = usePathAbs(process.cwd())
