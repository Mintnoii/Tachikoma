import type { Config } from 'prettier'

const BaseConfig: Config = {
  tabWidth: 2, // 每次缩进的空格数（默认2）
  useTabs: false, // 是否使用tab进行缩进（默认false）
  semi: false, // 声明结尾使用分号(默认true)
  singleQuote: true, // 是否单引号
  quoteProps: 'as-needed',
  trailingComma: 'none', // 多行使用拖尾逗号（默认none）
  endOfLine: 'auto', // 设置换行风格，避免不同操作系统造成的大量代码 diff
  bracketSpacing: true, // 对象字面量的大括号间使用空格（默认true）
  plugins: ['prettier-plugin-pkg'],
  printWidth: 100, // 一行的字符数，超过会换行（默认80）
  arrowParens: 'always', // 只有一个参数的箭头函数参数是否带圆括号（默认avoid)
  // stylelintIntegration: false, // 不使用 stylelint 的代码格式进行校验
  // tslintIntegration: false, // 不使用 tslint 的代码格式进行校验
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 200,
      },
    },
  ],
}

export default BaseConfig
