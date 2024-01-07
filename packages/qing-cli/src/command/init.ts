// import {
//   exit,
//   startProject,
//   checkAndClearDir,
//   writePackageJson,
// } from "./utils/help.js";
//   import {selectPrivateNpm} from './utils/selectPrivateNpm.js'
// import { getProjectInfo } from "./utils/prompts.js";
// import { errorText } from './utils/print.js'
// import {fetchTmpl} from './utils/tmpls.js';
import { selectRepoTmpl } from '@/libs'
import { checkAndClearDir, chalkLog } from '@/utils'

export const fetchTmpl = async (project_name: string) => {
  const repo = await selectRepoTmpl();
  console.log(repo, '===')
  // // 这里只会把默认分支 clone下来，其他远程分支并不在本地
  // await spinner(
  //   "下载项目模板...",
  //   () => $`git clone --depth 1 ${templateUrl} ${project_name}`
  // );
  // chalkLog(`🎉 模板下载完成`, 'success');
  // chalkLog(`🗂 ${process.cwd()}/${project_name}`, 'link');
}

// 初始化项目
export const init = async (project_name: string, options: any) => {
  console.log(project_name, options)
  const cleared = await checkAndClearDir(project_name, options.force)
  if (cleared) {
    // 创建交互
    try {
      await fetchTmpl(project_name);
      // // const privateNpmArr = await selectPrivateNpm();
      // const answers = await getProjectInfo();
      // // await writePackageJson(project_name, answers,privateNpmArr)
      // await writePackageJson(project_name, answers,[])
      // startProject(project_name);
      console.log('init')
    } catch (err) {
      // exit(errorText(`❌ 初始化失败 ${err}`));
    }
  } else {
    // 已有同名文件夹 后续也可在此处添加直接初始化的逻辑
    // exit(`👋 终止初始化项目 see u ~`);
  }
}

