# @tachikomas/eslint

Quick eslint config to share across

## Usage

```
pnpm add @tachikomas/eslint -D
```

```js
module.exports = {
  extends: [
    '@tachikomas/eslint-config/vue',
    // ...
  ],
  // 其他配置
}
```

可以通过 `npx eslint --print-config .eslintrc.js` 输出解析后的完整的ESLint配置
