---
outline: deep
---

# Utils

工具函数包，包含了常用的文件处理、Promise 处理、字符串处理等工具方法。

## Promise

### handleErrorPromise <Badge type="warning" text="👍" />
- 参数：promise：要处理的 Promise 对象。errorExt（可选）：附加到错误对象的额外信息。
- 功能：处理 Promise 的结果和错误，返回一个包含结果或错误的数组。

## FS

### downloadBlob
- 参数：接收文件名和文件内容（res）。
- 功能：创建一个 Blob 对象，生成 Blob URL，创建一个虚拟的 `<a>` 元素，设置其属性（href、download），模拟点击实现文件下载，最后释放 Blob URL。

### convertFileToBlob
- 参数：接收一个文件对象（file）。
- 功能：使用 FileReader 将文件转换为 Blob 对象，并返回 Promise。如果转换成功，Promise 将解析为 Blob，否则将被拒绝。
- 注意：convertFileToBlob 主要是将文件对象转换为 Blob 对象的异步操作，适用于需要 Blob 形式的文件内容的场景。

### download
- 参数：接收一个对象，包含要下载的文件的 URL 和下载到本地的文件名。
- 功能：使用 Fetch API 获取文件，检查响应状态，如果成功，则获取响应的 Blob，并通过 downloadBlob 方法进行下载。
- 注意：download 方法是一个异步函数，用于通过网络获取文件并进行下载。它是对 downloadBlob 方法的进一步封装，处理了网络请求的逻辑。
