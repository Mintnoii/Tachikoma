import { echo } from 'zx'
import Table from 'cli-table3'
import { RepoJSON } from '@/settings'
import { chalkText } from '@/utils'
export const listAllRepos = () => {
  const table = new Table({
    head: ['模板名称', '简介', '作者', '仓库', '分类'],
    style: {
      head: ['green'],
      // border: [],
    },
    colWidths: [null, 35, null, 30, null],
    wordWrap: true,
    wrapOnWordBoundary: false,
  })
  Object.entries(RepoJSON).forEach(([name, { repo, desc, author, type }]: any) => {
    table.push([chalkText(name, 'link'), desc, author, repo, type === 'default' ? '内置' : '自定义'])
  })
  echo(table.toString())
}
