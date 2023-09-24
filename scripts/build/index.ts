interface Project {
  name: string;
  actions: { name: string; fn: () => Promise<void> }[];
  dependencyProjects: Project[];
}

const sleep = (s: number): Promise<void> =>
  new Promise((r) => setTimeout(r, s));

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
  actions: [{ name: "build", fn: () => sleep(Math.random() * 1000) }],
  dependencyProjects: [],
}));

const [A, B, C, D, X, Y, Z] = projects;

A.dependencyProjects = [B];
B.dependencyProjects = [D];
C.dependencyProjects = [D, X, Y];
X.dependencyProjects = [Y, Z];


interface Task {
  // 任务名 `${projectName}:{actionName}`
  name: string;
  // 当前任务依赖的任务，即当前任务的下游任务，当该 dependenciesSet 被清空，说明当前任务可以被执行
  dependencies: Set<Task>;
  // 依赖当前任务的任务，即当前任务的上游任务，当前任务完成后，需要更新其上游任务的 dependenciesSet（从其内移除当前任务）
  dependents: Set<Task>;
  // 具体任务执行函数
  fn: () => Promise<void>;
}

/**
 * 实现本方法，使得 build 行为按照正确的顺序执行，且保证执行效率
 * @param projects 需要执行任务的 project 集合
 * @param actionName 具体操作名称
 * @param limit 任务最大并行数
 */
function run(projects: Project[], actionName: string, limit: number) {
  // 任务名与任务的映射
  const tasks = new Map<string, Task>();

  // 初始化任务列表
  projects.forEach((project) =>
    tasks.set(getTaskName(project, actionName), {
      name: getTaskName(project, actionName),
      dependencies: new Set(),
      dependents: new Set(),
      fn: project.actions.find((a) => a.name === actionName)?.fn ?? noop,
    })
  );
  console.log(projects,'projects with tasks!');

  // 获取 project 对应 task 的下游任务名称
  function getDependencyTaskNames(project: Project): Set<string> {
    const dependencyTaskNames: Set<string> = new Set();
    // 遍历下游项目
    for (const dep of project.dependencyProjects) {
      // 搜集下游任务名
      dependencyTaskNames.add(getTaskName(dep, actionName));
    }

    return dependencyTaskNames;
  }
  debugger
  projects.forEach((project) => {
    // 1. 获取当前项目对应的任务
    const task = tasks.get(getTaskName(project, actionName))!;
    // 2. 获取当前任务对应的下游任务名
    const dependencyTaskNames = getDependencyTaskNames(project);
    // 3. 遍历下游任务名
    for (const dependencyName of dependencyTaskNames) {
      // 4. 取到下游任务（由任务列表 tasks 初始化而来）
      const dependency: Task = tasks.get(dependencyName)!;
      // 5. 补充当前任务的 dependencies
      task.dependencies.add(dependency);
      // 6. 补充下游任务的 dependents
      dependency.dependents.add(task);
    }
  });

   const taskQueue: Task[] = [];
  for (const [, task] of tasks) {
    taskQueue.push(task);
  }
  runTasks(taskQueue, limit);
}

// 获取任务名
const getTaskName = (project: Project, actionName: string) => `${project.name}:${actionName}`;
// 用于在异步代码中占位，或者在需要传递异步函数但实际上不需要执行异步操作的情况下使用
const noop = ():Promise<void> => new Promise((r) => r());


async function runTasks(taskQueue: Task[], limit: number) {
	// 跟踪当前激活的任务数
  let currentActiveTasks = 0;
	// 在任务队列中查找下一个准备执行的任务
  function getNextTask() {
    for (let i = 0; i < taskQueue.length; i++) {
      const task: Task = taskQueue[i];
			// 如果任务的依赖为空，表示任务准备好执行
      if (task.dependencies.size === 0) {
				// 从队列中移除并返回准备好执行的任务
        return taskQueue.splice(i, 1)[0];
      }
    }
    return null;
  }

	// 执行任务，处理任务完成后的清理工作，并继续调度下一个任务
  function _run(task: Task): Promise<void> {
    return task.fn().then(() => {
      console.log("任务成功执行", task.name);
      currentActiveTasks--;
      // 当前任务执行完成，从其上游任务的 dependencies 中移除当前任务
      task.dependents.forEach((dependent: Task) => {
        dependent.dependencies.delete(task);
      });
      // 继续调度执行下一个任务
      start();
    });
  }

	// 启动任务调度
  async function start() {
    let ctask: Task | null = null;
    const taskPromises: Promise<void>[] = [];
		// 循环执行任务直到达到最大并发数
    while (currentActiveTasks < limit && (ctask = getNextTask())) {
      currentActiveTasks++;
      const task: Task = ctask;
			// 同时调用 _run 函数来执行任务
      taskPromises.push(_run(task));
    }

    await Promise.all(taskPromises);
  }
	// 启动任务调度
  start();
}

run(projects, "build", 12);
