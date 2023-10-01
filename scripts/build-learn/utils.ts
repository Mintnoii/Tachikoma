import { consumers } from 'stream';
import { Project, Task } from './types'

export const fakeBuild = async (s: number): Promise<void> => new Promise((r) => setTimeout(r, s));
// 用于在异步代码中占位，或者在需要传递异步函数但实际上不需要执行异步操作的情况下使用
export const noop = (): Promise<void> => new Promise((r) => r());

// 获取任务名
const getTaskName = (project: Project, actionName: string) => `${project.name}:${actionName}`;


// 初始化任务列表
export const initTasks = (projects: Project[], actionName: string) => {
  // 任务名与任务的映射
  const tasks = new Map<string, Task>();
  projects.forEach((project) => {
    tasks.set(getTaskName(project, actionName), {
      name: getTaskName(project, actionName),
      suppliers: new Set(),
      consumers: new Set(),
      fn: project.actions.find((a) => a.name === actionName)?.fn ?? noop,
    })
  })
  return tasks
}

const getSuppliersTaskNames = (project: Project, actionName: string): Set<string> => new Set(
  project.dependencyProjects.map((dep) => getTaskName(dep, actionName))
);

/**
 * 补充项目的 suppliers 与 consumers
 * @param project 项目
 * @param actionName 任务名
 * @param tasks 任务名与任务的映射
 */
export const buildRelations = (project: Project, actionName: string, tasks: Map<string, Task>) => {
  // 当前项目的任务
  const task = tasks.get(getTaskName(project, actionName))!;
  // 所有的依赖任务
  const suppliersTaskNames = getSuppliersTaskNames(project, actionName);
  suppliersTaskNames.forEach((name) => {
    const supplierTask: Task = tasks.get(name)!;
    // 给当前任务的 suppliers 添加依赖任务
    task.suppliers.add(supplierTask);
    // 给依赖任务的 consumers 添加当前任务
    supplierTask.consumers.add(task!);
  });
}



export const initTaskQueue = (tasks: Map<string, Task>) => {
  const taskQueue: Task[] = [];

   for (const [, task] of tasks) {
    // 计算关键路径长度
    task.criticalPathLength = calculateCriticalPaths(task);
    taskQueue.push(task);
  }
  // 基于关键路径长度对任务进行降序排序，以便优先执行关键路径上的任务
  taskQueue.sort((a, b) => b.criticalPathLength! - a.criticalPathLength!);
  return taskQueue;
}

/**
 * 异步运行任务队列，控制并发任务数量
 * @param {Task[]} taskQueue - 待执行的任务队列
 * @param {number} limit - 最大并发任务数
 */
export const runTasks = async (taskQueue: Task[], limit: number) => {
  // 当前激活的任务数
  let currentActiveTasks = 0;
  //  在任务队列中查找下一个准备执行的任务，如果没有则返回 null
  function getNextTask(): Task | null {
    // 使用 filter 找到所有已准备好执行（依赖为空）的任务
    const readyTasks = taskQueue.filter((task) => task.suppliers.size === 0);
    // 如果没有准备好执行的任务，则返回 null
    if (readyTasks.length === 0) {
      return null;
    }
    // 从队列中移除并返回准备好执行的任务
    const taskToRun = readyTasks.shift()!;
    taskQueue.splice(taskQueue.indexOf(taskToRun), 1);
    return taskToRun;
  }

  /**
   * 运行单个任务，并处理任务完成后的清理工作，然后继续调度下一个任务
   * @param {Task} task - 要执行的任务
   * @returns {Promise<void>} - 表示任务完成的 Promise
   */
  async function _run(task: Task): Promise<void> {
    // 运行任务的异步函数
    await task.fn();
    console.log("Task success:", task.name);
    // 减少当前活动任务数
    currentActiveTasks--;
    // 从依赖该任务的其他任务的 suppliers 中移除当前任务
    for (const dependent of task.consumers) {
      dependent.suppliers.delete(task);
    }
    // 继续执行下一个任务
    start();
  }

  async function start() {
    let ctask: Task | null = null;
    const taskPromises: Promise<void>[] = [];
    // 循环执行任务直到达到最大并发数或没有可执行的任务
    while (currentActiveTasks < limit && (ctask = getNextTask())) {
      currentActiveTasks++;
      // 同时调用 _run 函数来执行任务
      taskPromises.push(_run(ctask));
    }
    // 等待所有任务完成
    await Promise.all(taskPromises);
  }
  // 启动任务调度
  start();
}

// 计算关键路径长度
const calculateCriticalPaths = (task: Task): number => {
  if(task.criticalPathLength !== undefined ){
    return task.criticalPathLength
  }
    // 如果没有 consumers, 说明我们是 "root"，即 app 此类不被依赖的 project
  if (task.consumers.size === 0) {
    task.criticalPathLength = 0;
    return task.criticalPathLength;
  }

    // 递归向上取最大值 每次 +1
  const depsLengths: number[] = [];
  task.consumers.forEach((consumer) =>  depsLengths.push(calculateCriticalPaths(consumer)))
  task.criticalPathLength = Math.max(...depsLengths) + 1
  return task.criticalPathLength
}