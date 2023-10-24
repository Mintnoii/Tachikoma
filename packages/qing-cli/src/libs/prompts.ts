import { confirm, select, isCancel, cancel, group, text } from '@clack/prompts'
import { RepoJSON } from '@/settings'
import { IProjectInfo, IRepo } from '@/types'

type CancelSymbol = symbol

const withCancel = <T>(value: T | CancelSymbol): T => {
  if (isCancel(value)) {
    cancel('强制退出！👋 Bye~')
    // 用户通过 Ctrl+C 终止一个任务时，惯例是使用退出码 1
    // 退出码 0 通常表示成功完成，而退出码 1 可以用于表示一般性错误，包括用户中断任务这类情况
    process.exit(1)
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
export const selectTmplRepo = async () => {
  const allRepo = { ...RepoJSON } as Record<string, IRepo>
  const value = await select({
    message: '请选择模板仓库，进行项目初始化：',
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

export const gatherProjectInfo = async (): Promise<IProjectInfo> => {
  return group(
    {
      author: () => text({ message: '请输入项目作者', defaultValue: 'Mintnoii' }),
      description: () => text({ message: '请输入项目描述', defaultValue: '' }),
      version: () => text({ message: '请输入项目版本', defaultValue: '0.0.1' }),
      git: () => text({ message: '请输入项目 git 地址', defaultValue: '' }),
    },
    {
      onCancel: ({ results }) => {
        cancel('👋 Bye~')
        process.exit(0)
      },
    },
  )
}
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
