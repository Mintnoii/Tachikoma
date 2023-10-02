import { PageObjectResponse, RichTextItemResponse, BlockObjectResponse, Heading1BlockObjectResponse, Heading2BlockObjectResponse, Heading3BlockObjectResponse,CalloutBlockObjectResponse, ToDoBlockObjectResponse, TextRichTextItemResponse, StatusPropertyItemObjectResponse, ChildPageBlockObjectResponse,ImageBlockObjectResponse,CodeBlockObjectResponse,BookmarkBlockObjectResponse,LinkPreviewBlockObjectResponse } from '@notionhq/client/build/src/api-endpoints'

// 从 BlockObjectResponse 中提取 type 属性值的映射类型
type AllBlockTypes = BlockObjectResponse['type'];

export type NKBlockResponse = BlockObjectResponse
export type NKToDoBlockResponse = ToDoBlockObjectResponse
export type NKCalloutBlockResponse = CalloutBlockObjectResponse
export type NKChildPageBlockResponse = ChildPageBlockObjectResponse
export type NKImageBlockResponse = ImageBlockObjectResponse
export type NKCodeBlockResponse = CodeBlockObjectResponse
export type NKBookmarkBlockResponse = BookmarkBlockObjectResponse
export type NKLinkPreviewBlockResponse = LinkPreviewBlockObjectResponse
export interface NBRichText extends TextRichTextItemResponse{
  // type: string
  content: string
  link: string
}

export interface NKBasicData {
  id: string
  type: AllBlockTypes
  has_children: boolean
  rich_text: NBRichText[]
}

export interface NKBlock extends NKBasicData{
  children?: NKBlock[]
  // NKToDoBlockResponse 块类型的 checked 属性
  checked?: boolean
  // todo 优化 NKCalloutBlockResponse 下的icon
  icon?: any
  // NKChildPageBlockResponse 下的 title
  title?:string
  image?:NKImageBlockResponse['image']
  // todo 优化
  // caption?:any
  language?:NKCodeBlockResponse['code']['language']
  url?:string
}


// ---------------------------------------------------





export interface IPageObject extends PageObjectResponse { }

export type IRichTextItem = RichTextItemResponse
export type ITextRichText = TextRichTextItemResponse


export interface IDataItem {
  id: string
  name: string
  cover: string
  last_edited_time: string
}

export interface IBlog extends IDataItem {
  tags?: any[]
}

export type IStatus = StatusPropertyItemObjectResponse
export type IStatusName = 'In Progress' | 'Done'
export interface IProject extends IDataItem {
  icon?: string
  status?: IStatusName
  intro?: string
  github?: string
}

export type IBlockObjectResp = BlockObjectResponse & {
  children: IBlockObjectResp[]
}


export type IHeading = 'heading_1' | 'heading_2' | 'heading_3'
export type IHeadingBlock = Heading1BlockObjectResponse | Heading2BlockObjectResponse | Heading3BlockObjectResponse

export type IList = 'bulleted_list' | 'numbered_list'
export type IListItem = 'bulleted_list_item' | 'numbered_list_item'
// export type IListBlock = BulletedListItemBlockObjectResponse | NumberedListItemBlockObjectResponse

export type IBlockType = BlockObjectResponse['type']

// export const KeyMap = {
//   'bulleted_list_item': BulletedListItemBlockObjectResponse,
// }

export interface IListBlock {
  type: IList
  has_children: boolean
  children: IBlockObject[]
  id?: string
}

export interface IBlockObject {
  id: string
  type: IBlockType
  has_children: boolean
  children: IBlockObject[],
  // data: IBlockObjectResp
}

export type IBlock = IBlockObject | IListBlock

export interface IContentBlock {
  id: string
  // todo add more types
  type: string
  href: string | null
  text?: string
  color?: string

}

export interface ITag {
  id: string
  name: string
  color: string
}
