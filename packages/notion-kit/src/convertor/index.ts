// import * as R from 'remeda'
import { getDefaultBlock } from './common'
import {
  IBlockObject,
  IBlock,
  IToDoBlockObject,
  ICalloutBlockObject,
  IChildPageBlockObject,
  IImageBlockObject,
  ICodeBlockObject,
  IBookmarkBlockObject,
  ILinkPreviewBlockObject,
} from '../types'

export const convertBlock = (block: IBlockObject): IBlock => {
  const defaultBlock = getDefaultBlock(block)
  switch (block.type) {
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'column_list':
    case 'column':
    case 'paragraph':
    case 'quote':
    case 'toggle':
      // return getDefaultBlock(block)
      return defaultBlock
    case 'to_do':
      return {
        ...defaultBlock,
        checked: (block as IToDoBlockObject).to_do.checked,
      }
    case 'callout':
      return {
        ...defaultBlock,
        icon: (block as ICalloutBlockObject).callout.icon,
      }
    case 'child_page':
      return {
        ...defaultBlock,
        title: (block as IChildPageBlockObject).child_page.title,
      }
    case 'image':
      return {
        ...defaultBlock,
        image: (block as IImageBlockObject).image,
        // todo 优化
        // caption: (block as IImageBlockObject).image.caption
      }
    case 'code':
      return {
        ...defaultBlock,
        language: (block as ICodeBlockObject).code.language,
      }
    case 'bookmark':
      return {
        ...defaultBlock,
        // caption: (block as IBookmarkBlockObject).bookmark.caption,
        url: (block as IBookmarkBlockObject).bookmark.url,
      }
    case 'link_preview':
      return {
        ...defaultBlock,
        url: (block as ILinkPreviewBlockObject).link_preview.url,
      }
    default:
      return defaultBlock as IBlock
  }
}

// const formatTextRichText = (text_rich_text: ITextRichText[]) => {
//   return text_rich_text.map(item => (item.text.content)).join('')
// }

// export const formatDate = (timestamp: string): string => {
//   const date = new Date(timestamp)
//   const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`
//   return formattedDate
// }

// export const formatProject = (page: IPageObject): IProject => {
//   return {
//     id: page.id,
//     name: formatTextRichText(R.pathOr(page, ['properties', 'Name', 'title'], []) as ITextRichText[]),
//     cover: R.pathOr(page, ['cover', 'file', 'url'], '') as string,
//     icon: R.pathOr(page, ['icon', 'file', 'url'], '') as string,
//     github: R.pathOr(page, ['properties', 'github', 'url'], '') as string,
//     status: (page.properties.Status as IStatus).status?.name as IStatusName,
//     intro: formatTextRichText(R.pathOr(page, ['properties', 'intro', 'rich_text'], []) as ITextRichText[]),
//     last_edited_time: formatDate(page.last_edited_time),
//   }
// }
// export const formatPageInfo = (page: IPageObject): IBlog => {
//   const tags = R.pathOr(page, ['properties', 'Tags', 'multi_select'], []) as any[]
//   return {
//     id: page.id,
//     name: (R.pathOr(page, ['properties', 'Page', 'title'], []) as ITextRichText[])?.[0]?.text?.content || '',
//     cover: R.pathOr(page, ['cover', 'file', 'url'], '') as string,
//     last_edited_time: formatDate(page.last_edited_time),
//     tags
//   }
// }
