
// import * as R from 'remeda'
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { IRichTextItem, IBlock } from '../types'

/**
 * Notion 使用富文本允许用户自定义其内容, 但并非所有块类型都提供富文本
 * @param block
 * @returns RichText[]
 * @description 块对象中的富文本对象数组或空数组
 * @see https://developers.notion.com/reference/rich-text#the-annotation-object
 */
export const withRichText = (block: BlockObjectResponse) => {
  const rich_text_items = (block[block.type]['rich_text'] || [])
  const rich_text = rich_text_items.map(item => {
    const { type, text, annotations } = item
    return {
      type,
      annotations,
      content: text?.content || '',
      link: text?.link?.url || '',
    }
  }) as IRichTextItem[]
  return { rich_text }
}

/**
 * 获取块对象的基本信息
 * @param block
 * @returns 块对象的基本信息
 * @description 块对象的基本信息包括 id, type, has_children, rich_text
 * @see https://developers.notion.com/reference/block
 */
export const getDefaultBlock = (block: BlockObjectResponse): IBlock => {
  const { id, type, has_children } = block
  return { id, type, has_children, ...withRichText(block) }
}

