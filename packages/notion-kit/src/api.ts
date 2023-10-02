import { Client } from '@notionhq/client';
import { QueryDatabaseParameters, BlockObjectResponse, GetPageResponse } from '@notionhq/client/build/src/api-endpoints'

interface NotionKitOptions {
  token?: string;
}
/**
 * 初始化 Notion 客户端和封装的方法
 * @param options 初始化参数 { token?: string }
 * @returns 包含 Notion 客户端实例和封装方法的对象
 */
export default class NotionKit {
  notion: Client;
  constructor(options: NotionKitOptions) {
    this.notion = new Client({ auth: options.token });
    // todo 其他初始化逻辑
  }

  /**
   * 查询数据库
   * @param params 查询参数 (筛选和排序条件)
   * @returns 返回数据库中包含的页面和/或数据库的列表 (筛选和排序后的结果)
   * @see https://developers.notion.com/reference/post-database-query
   */
  queryDatabase = async (params: QueryDatabaseParameters) => {
    return this.notion.databases.query(params);
  }

  /**
   * 检索页面
   * @param page_id 页面 id
   * @returns 返回页面对象 PageObject
   * @description 返回页面属性，而不是页面内容。若要提取页面内容，请使用 retrieveBlockChildren
   * @see https://developers.notion.com/reference/retrieve-a-page
   */
  retrievePage = async (page_id: string) => {
    return this.notion.pages.retrieve({ page_id });
  }

  /**
   * 检索块的子项
   * @param block_id 块 id
   * @param optipons 选项 { start_cursor?: string, page_size?: number } 默认第一页 50 条
   * @returns 返回块的子项对象数组
   * @description 使用指定的 ID 返回块中包含的子块对象的分页数组 为了接收块的完整表示，可能需要递归检索子块的块子项
   * @see https://developers.notion.com/reference/retrieve-block-children
   */
  retrieveBlockChildren = async (block_id: string, optipons?: { start_cursor?: string, page_size?: number }) => {
    const { start_cursor, page_size = 50 } = optipons || {}
    const response = await this.notion.blocks.children.list({
      block_id,
      start_cursor,
      page_size,
    })
    return response
  }

  // todo 查询
  // async search() {
  //   const response = await this.notion.search({
  //   query: '',
  //   filter: {
  //     value: 'database',
  //     property: 'object',
  //   },
  //   sort: {
  //     direction: 'descending',
  //     timestamp: 'last_edited_time'
  //   },
  // })
  // return response.results
  // }

}
