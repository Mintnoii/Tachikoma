// 具体交互内容
import prompts, { confirm, select, isCancel, cancel } from '@clack/prompts'
// import { noteLog, warnLog } from "./print.js";
import { RepoJSON } from '@/settings'

import { IRepo } from '@/types'
type CancelSymbol = symbol

const withCancel = <T>(value: T | CancelSymbol): T => {
  if (isCancel(value)) {
    cancel('强制退出！👋 Bye~')
    process.exit(0)
  } else {
    return value
  }
}

// export const getTmplInfo = async () => {
//   return await prompts(
//     [
//       {
//         type: 'text',
//         name: 'name',
//         message: '请输入模板名称(必填)：',
//       },
//       {
//         type: 'text',
//         name: 'url',
//         message: '请输入模板 git 地址(必填)：',
//       },
//       {
//         type: 'text',
//         name: 'author',
//         message: '请输入模板作者：',
//       },
//       {
//         type: 'text',
//         name: 'desc',
//         message: '请输入模板描述：',
//       },
//     ],
//     {
//       onSubmit: (prompt, answer) => {
//         const { name } = prompt
//         if (!answer) {
//           if (['name', 'url'].includes(name)) {
//             // warnLog(`❌ 模板${name === 'name' ? "名称" : "地址"}为必填项！`);
//             process.exit(1)
//           }
//         }
//         if (name === 'url' && !/^(git@|https:).+\.git$/.test(answer)) {
//           // warnLog(`❌ 模板仓库的地址不合法，请检查后重新输入！`);
//           // noteLog("模板仓库地址必须以 git@ 或者是 https: 开头, 并且必须以 .git 结尾");
//           process.exit(1)
//         }
//         // 还可以加入一个验证模板名称是否已经存在的功能
//         return false
//       },
//       onCancel,
//     },
//   )
// }

// export const confirmCustomTmpl = async (tmplName: string) => {
//   return await prompts(
//     {
//       type: 'toggle',
//       name: 'isRemove',
//       message: `确定要删除自定义模板 ${tmplName} 吗？`,
//       initial: false,
//       active: '是',
//       inactive: '否',
//     },
//     { onCancel },
//   )
// }
export const isRemoveFolder = async () => {
  const value = await confirm({
    message: '请选择是否移除该文件夹?',
    active: '是',
    inactive: '否',
    initialValue: false,
  })
  return withCancel(value)
}

// 获取项目模板
export const selectRepoTmpl = async () => {
  const allRepo = { ...RepoJSON } as Record<string, IRepo>
  const value = await select({
    message: '请选择模板，进行项目初始化：',
    options: Object.keys(allRepo).map((key) => {
      return {
        label: key,
        value: allRepo[key].repo,
        hint: allRepo[key].desc,
      }
    }),
  })
  return withCancel(value)
}

export const projectPrompt = [
  {
    type: 'text',
    name: 'author',
    message: '请输入项目作者：',
  },
  {
    type: 'text',
    name: 'description',
    message: '请输入项目描述：',
  },
  {
    type: 'text',
    name: 'version',
    message: '请输入项目版本：',
    initial: '0.0.1',
  },
  {
    type: 'text',
    name: 'git',
    message: '请输入项目 git 地址：',
  },
]

// export const getProjectInfo = async () => {
//   return prompts(projectPrompt, { onCancel })
// }

// // 是否启动项目
// export const isStartProject = async () => {
//   return prompts(
//     {
//       type: 'toggle',
//       name: 'start',
//       message: `项目创建成功，是否现在启动？`,
//       active: '立即启动',
//       inactive: '稍后再说',
//       initial: false,
//     },
//     { onCancel },
//   )
// }
