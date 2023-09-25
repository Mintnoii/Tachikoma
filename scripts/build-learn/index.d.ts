export interface Project {
  name: string;
  actions: { name: string; fn: () => Promise<void> }[];
  dependencyProjects: Project[];
}

export interface Task {
  // 任务名 `${projectName}:{actionName}`
  name: string;
  // 当前任务依赖的任务，即当前任务的下游任务，当该 dependenciesSet 被清空，说明当前任务可以被执行
  suppliers: Set<Task>;
  // 依赖当前任务的任务，即当前任务的上游任务，当前任务完成后，需要更新其上游任务的 dependenciesSet（从其内移除当前任务）
  consumers: Set<Task>;
  // 关联路径长度
  criticalPathLength?: number;
  // 具体任务执行函数
  fn: () => Promise<void>;
}