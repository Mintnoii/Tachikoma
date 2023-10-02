# Notion-Kit

Notion Kit is a TypeScript library that simplifies interactions with the Notion API. It provides a convenient way to query databases, retrieve pages, and handle various types of Notion blocks.

### Installation

`npm install @tachikomas/notion-kit`

### Usage

**Initializing Notion Kit**

To get started, initialize the Notion Kit by providing your Notion token:

```typescript

import { NotionKit } from '@tachikomas/notion-kit';

const {notion} = new NotionKit({
  token: 'your-notion-token',
});
```

**Querying Databases**

To query a database, use the `queryDatabase` method:

```typescript
const database = await notion.queryDatabase({
  database_id: 'your-database-id',
  filter: {
    property: 'Status',
    status: {
      equals: 'Blog',
    }
  }
});
```

**Retrieving Pages**

To retrieve a page, use the `retrievePage ` method:

```typescript
const page = await notion.retrievePage ({
  page_id: 'your-page-id',
});
```

**Retrieve Block Children**

To retrieve a block's children, use the `retrieveBlockChildren` method:

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

### Formatting Content Blocks

Use the formatContent method to format different types of content blocks:
```typescript
const blockObject = {
  // specify
};

const formattedContent = formatContent(blockObject);
```
### Additional Types

The library also exports various types to help you work with Notion objects:

- `IBlock, IBlockObject, IBlockObjectResp`: Types related to Notion blocks.
- `IBlog, IDataItem, IProject`: Types for different data items.
- `IHeading, IHeadingBlock`: Types for headings.
- `IList, IListItem, IListBlock`: Types for lists.
- `IPageObject`: Type for Notion pages.
- `IRichTextItem, ITextRichText`: Types for rich text content.
- `IStatus, IStatusName`: Types for status properties.
- `ITag`: Type for Notion tags.

Feel free to explore these types and use them as needed in your application.

### License

This library is licensed under the `MIT` License. See the LICENSE file for details.