# Notion-Kit

Notion-Kit 是一个简化与 Notion API 交互的 TypeScript 库。它提供了一种方便的方式来查询数据库、检索页面，并处理各种类型的 Notion 区块。

## 安装

`npm install @tachikomas/notion-kit`

## 使用

**初始化 Notion Kit**

要开始使用，通过提供你的 Notion token 来初始化 Notion Kit

```typescript
import { NotionKit } from '@tachikomas/notion-kit'

const { notion } = new NotionKit({
  token: 'your-notion-token',
})
```

**查询数据库**

要查询数据库，请使用 `queryDatabase`  方法：

```typescript
const database = await notion.queryDatabase({
  database_id: 'your-database-id',
  filter: {
    property: 'Status',
    status: {
      equals: 'Blog',
    },
  },
})
```

**检索页面**

要检索页面，请使用 `retrievePage` 方法：

```typescript
const page = await notion.retrievePage({
  page_id: 'your-page-id',
})
```

**检索区块子项**

要检索区块的子项，请使用 `retrieveBlockChildren` 方法：

```typescript
const blocks = await listBlocks(page_id, start_cursor)
// or custom your own getAllBlocks
export const getAllBlocks = async (page_id: string, start_cursor?: string | null) => {
  const blocks = await listBlocks(page_id, start_cursor)
  const { results, has_more, next_cursor } = blocks
  const data = results as IBlockObjectResp[]
  if (has_more) {
    const more_blocks = await getAllBlocks(page_id, next_cursor)
    data.push(...more_blocks)
  }
  return data as IBlockObjectResp[]
}
```

## 格式化

使用 formatContent 方法来格式化不同类型的内容区块：

```typescript
const blockObject = {
  // specify
}

const formattedContent = formatContent(blockObject)
```
