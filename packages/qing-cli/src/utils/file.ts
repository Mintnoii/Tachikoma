import { path, fs, $, echo, spinner } from 'zx'
import { chalkLog } from './print'
import { isRemoveFolder, isStartProject } from './prompts'

/**
 * 检查是否已有同名文件夹 并询问是否删除
 * @param name 文件夹名称
 * @param force 是否强制删除
 * @returns {Promise<boolean>} 是否已清空
 */
export const checkAndClearDir = async (name: string, force: boolean): Promise<boolean> => {
  const targetDir = path.resolve(process.cwd(), name || '.')
  // 判断当前路径下是否已经存在文件夹
  if (fs.pathExistsSync(targetDir)) {
    chalkLog(`🧐 当前路径下已存在 ${name} 文件夹`, 'warn')
    if (force) {
      await spinner('清理文件夹...', () => fs.remove(targetDir))
      chalkLog(`🗑 原有文件夹已被移除`, 'warn')
      return true
    } else {
      const { removeFolder } = await isRemoveFolder()
      if (removeFolder) {
        await spinner('清理文件夹...', () => fs.remove(targetDir))
        chalkLog(`🗑 原有文件夹已被移除`, 'warn')
        return true
      } else {
        return false
      }
    }
  }
  return true
}

// 脚手架 package.json 路径
// export const packageJSONPath = path.resolve(__dirname, "../../package.json");
// export const loadPackageJson = () => fs.readJSONSync(packageJSONPath);
