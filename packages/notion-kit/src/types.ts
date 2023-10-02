import { PageObjectResponse, RichTextItemResponse, BlockObjectResponse, Heading1BlockObjectResponse, Heading2BlockObjectResponse, Heading3BlockObjectResponse, CalloutBlockObjectResponse, ToDoBlockObjectResponse, TextRichTextItemResponse, StatusPropertyItemObjectResponse, ChildPageBlockObjectResponse, ImageBlockObjectResponse, CodeBlockObjectResponse, BookmarkBlockObjectResponse, LinkPreviewBlockObjectResponse } from '@notionhq/client/build/src/api-endpoints'

// 从 BlockObjectResponse 中提取 type 属性值的映射类型
type IBlockObjectType = BlockObjectResponse['type'];

export type IBlockObject = BlockObjectResponse
export type IToDoBlockObject = ToDoBlockObjectResponse
export type ICalloutBlockObject = CalloutBlockObjectResponse
export type IChildPageBlockObject = ChildPageBlockObjectResponse
export type IImageBlockObject = ImageBlockObjectResponse
export type ICodeBlockObject = CodeBlockObjectResponse
export type IBookmarkBlockObject = BookmarkBlockObjectResponse
export type ILinkPreviewBlockObject = LinkPreviewBlockObjectResponse
export interface IRichTextItem extends TextRichTextItemResponse {
  // type: string
  content: string
  link: string
}

export interface IBasicBlock {
  id: string
  type: IBlockObjectType
  has_children: boolean
  rich_text: IRichTextItem[]
}

export interface IBlock extends IBasicBlock {
  children?: IBlock[]
  // IToDoBlockObject 块类型的 checked 属性
  checked?: boolean
  // todo 优化 ICalloutBlockObject 下的icon
  icon?: any
  // IChildPageBlockObject 下的 title
  title?: string
  image?: IImageBlockObject['image']
  // todo 优化
  // caption?:any
  language?: ICodeBlockObject['code']['language']
  url?: string
}
