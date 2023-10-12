/* eslint-disable @typescript-eslint/no-var-requires */
const { defineConfig } = require('eslint-define-config');
const path = require('path');
/// <reference types="@eslint-types/typescript-eslint" />

module.exports = defineConfig({
  // 指定此配置为根级配置，eslint 不会继续向上层寻找
  root: true,

  // 将浏览器 API、ES API 和 Node API 看做全局变量，不会被特定的规则(如 no-undef)限制。
  env: {
    browser: true,
    es2022: true,
    node: true,
  },

  // 设置自定义的全局变量，不会被特定的规则(如 no-undef)限制。
  globals: {
    // 假如我们希望 jquery 的全局变量不被限制，就按照如下方式声明。
    // $: 'readonly',
  },
	// 指定扩展的配置，配置支持递归扩展，支持规则的覆盖和聚合
	// 可以直接继承使用业界的最佳实践
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended"
		// "prettier", // 使用 prettier 它能禁用掉所有和 prettier 冲突的规则
	],
	// 自定义解析器（如何理解代码），替换默认的 Espree 解析器
	parser: "@typescript-eslint/parser",
	// 给自定义的解析器传入一些其他的配置参数（必须）
	parserOptions: {
    // 支持的 ecmaVersion 版本
		ecmaVersion: "latest",
    // 主要使用 esm，设置为 module
		sourceType: "module",
     // 通过 tsconfig 文件确定解析范围，这里需要绝对路径，否则子模块中 eslint 会出现异常
    project: path.resolve(__dirname, 'tsconfig.eslint.json'),
    // TypeScript 解析器也要负责 vue 文件的 <script>
    // extraFileExtensions: ['.vue'],
	},
	// 添加想要的 Linting 规则，增强 ESlint 功能
	plugins: [],

  // 控制已有规则的开启 / 关闭，也可以覆盖掉 extends 的配置，微调修改
  rules: {
		// 插件 eslint-plugin-import 相关的规则，根据实际需求酌情配置
		// 1. 用于推荐或强制使用默认导出（export default）而不是具名导出（export）
		'import/prefer-default-export': 'off',
		// 2. 检查导入语句中指定的模块路径，确保它们可以成功解析到一个真实的模块
		'import/no-unresolved': 'off',
		// 3. 用于禁止使用相对路径引入包，鼓励使用绝对路径来引入包
		'import/no-relative-packages': 'off',
		// 4. 检测项目中的导入语句是否引入了不属于项目依赖或 devDependencies 的模块
		//'import/no-extraneous-dependencies': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-use-before-define': [
      'error',
      {
        functions: false,
      },
    ],
    // 'operator-linebreak': ['error', 'after'],
    // 'class-methods-use-this': 'off',
  },
	// 该字段定义的数据可以在所有的插件中共享
	// 这样每条规则执行的时候都可以访问这里面定义的数据
	settings: {},
	// 对特殊文件应用特殊配置
  // 文件级别的重写，对特殊文件应用特殊配置
  overrides: [
    // 对于 vite 和 vitest 的配置文件，不对 console.log 进行错误提示
    // {
    //   files: [
    //     '**/vite.config.*',
    //     '**/vitest.config.*',
    //   ],
    //   rules: {
    //     'import/no-relative-packages': 'off',
    //     'no-console': 'off',
    //   },
    // },
  ],
});