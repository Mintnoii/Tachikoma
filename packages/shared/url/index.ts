/**
 * 获取 base URL
 * @param url string
 * @description 从 URL 中提取协议和主机名, 失败返回空字符串
 */
const getBaseURL = (url: string): string  =>{
  const { protocol, host } = new URL(url)
  // 检查解析后的 URL 是否有效
  if (!protocol || !host) {
    console.error('Invalid URL')
    return ''
  }
  return `${protocol}//${host}`
}

// 示例用法
// console.log(getBaseURL('https://www.example.com/path/to/resource')); // https://www.example.com
// console.log(getBaseURL('http://example.com')); // http://example.com

export {
  getBaseURL
}
