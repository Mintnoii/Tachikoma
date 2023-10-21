import { fs } from 'zx'
import { IProjectInfo } from '@/types'
// 把采集到的用户数据解析替换到 package.json 文件中
/**
 *
 * @param project_name 项目名称
 * @param info 项目信息 通过 prompts 获取
 * @param dependencies 需要安装的依赖包
 */
export const writeInPackageJson = async (project_name: string, info: IProjectInfo, dependencies: any[]) => {
  const targetPath = `${process.cwd()}/${project_name}/package.json`
  const pkgJson = await fs.readJsonSync(targetPath)
  Object.assign(pkgJson, {
    name: project_name,
    ...info,
    dependencies: {
      ...pkgJson.dependencies,
      ...dependencies.reduce((acc, { name, version }) => {
        acc[name] = version
        return acc
      }, {}),
    },
  })
  // 将合并后的数据转换为JSON字符串，无替换函数，缩进为2个空格
  const jsonToWrite = JSON.stringify(pkgJson, null, 2)
  // 将新的JSON字符串写入到文件中
  await fs.writeFileSync(targetPath, jsonToWrite)
}
