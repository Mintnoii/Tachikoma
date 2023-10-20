import { usePathAbs, absCwd, usePathRel } from '@/utils'
import defaultTmplJSON from './repo/default.json'

import path from 'node:path'
import { fs } from 'zx'
import { fileURLToPath } from 'node:url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// 默认模板配置文件路径
// export const defaultTmplJSONPath = path.resolve(__dirname, '../templates/default.json')
console.log(import.meta.url, 'import.meta.url')
// const absolutePath = path.resolve(path.dirname(__filename), './repo/default.json')

// console.log('__filename', __filename)
// console.log('__dirname', __dirname)
export const defaultTmplJSONPath = path.resolve(__dirname, './repo/default.json')
export const loadDefaultTemplates = () => fs.readJSONSync('./repo/default.json')
// console.log(defaultTmplJSONPath, 'defaultTmplJSONPath')
console.log(defaultTmplJSON, 'defaultTmplJSON')
// console.log(absolutePath, 'absolutePath')
console.log(loadDefaultTemplates(), ' loadDefaultTemplates()')

// // 自定义模板配置文件路径
// export const customTmplJSONPath = path.resolve(__dirname, '../templates/custom.json')

// // 脚手架 package.json 路径
// export const packageJSONPath = path.resolve(__dirname, '../../package.json')

// export const loadDefaultTemplates = () => fs.readJSONSync(defaultTmplJSONPath)

// export const loadCustomTemplates = () => fs.readJSONSync(customTmplJSONPath)
