export interface IRepo {
  repo: string
  desc: string
  author: string
  type: 'default' | 'custom'
}

export interface IProjectInfo {
  author: string
  version: string
  description: string
  git: string
}
