import {fakeBuild, buildRelations, initTaskQueue, initTasks,runTasks} from './utils'
import {Project} from './index.d'
// Monorepo 中注册的所有项目
const projects: Project[] = [
  "@monorepo/a",
  "@monorepo/b",
  "@monorepo/c",
  "@monorepo/d",
  "@monorepo/x",
  "@monorepo/y",
  "@monorepo/z",
].map((name) => ({
  name,
  actions: [{ name: "build", fn: () => fakeBuild(Math.random() * 1000) }],
  dependencyProjects: [],
}));

// 设置各项目的依赖关系
const [A, B, C, D, X, Y, Z] = projects;
A.dependencyProjects = [B];
B.dependencyProjects = [D];
C.dependencyProjects = [D, X, Y];
X.dependencyProjects = [Y, Z];

const runAllProjects = (projects:Project[],actionName:string, limit:number) => {
  // 任务名与任务的映射
const buildTasks = initTasks(projects, actionName)
projects.forEach((project) => buildRelations(project, actionName, buildTasks));
const taskQueue = initTaskQueue(buildTasks);
runTasks(taskQueue, limit);
// console.log(projects,buildTasks,taskQueue);
}

runAllProjects(projects, 'build', 12)