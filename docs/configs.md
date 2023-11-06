# Configs

## @tachikomas/tsconfig

Custom `tsconfig` setup that can be extended.

### Breakdown

- `./base`

todo

- `./next` todo
- `./node`
- `./react`

```sh
pnpm install @tachikomas/tsconfig --dev
```

### Example

比如在项目的 `tsconfig.base.json` 中继承使用 `@tachikomas/tsconfig`：

```json
// tsconfig.base.json
{
  "extends": "@tachikomas/tsconfig/base.json",
  "compilerOptions": {
    // other options
  },
}
```

如果对最终 tsconfig 实际应用的编译选项或者作用的文件产生疑惑，可以使用命令验证：

`npx tsc  -p tsconfig.comp.json --showConfig`

## @tachikomas/prettier-config

Quick prettier config to share across

### Usage

```js
module.exports = {
  ...require('@tachikomas/prettier-config'),
}
```


## 踩坑

在对 eslint-config 配置文件进行打包时，打包后的文件在项目中引入后一直报这个错误

```shell
ESLint configuration in .eslintrc.js » @tachikomas/eslint-config is invalid:
        - Unexpected top-level property "default".
```

后面发现是 esm 与 cjs 互操作的问题： https://zhuanlan.zhihu.com/p/610878001

解决方案 1，手动处理，参考：

- https://modyqyw.top/blogs/2023/01/migrate-to-rollup-from-tsup.html#cjs-%E5%AF%BC%E5%87%BA
- https://github.com/egoist/tsup/issues/572#issuecomment-1060599574

解决方案 2，使用 tsup 的 `--cjsIntero` 选项，参考：

- https://tsup.egoist.dev/#interop-with-commonjs
  但是，这里还有一个坑，只加一个 `--cjsIntero` 选项是不够的，还需要加上 `--splitting` 选项，参考：
- https://github.com/egoist/tsup/issues/572#issuecomment-1679341541
- https://github.com/evanw/esbuild/issues/3281
- https://github.com/egoist/tsup/issues/572#issuecomment-1680153238

所以最终打包命令用的是 `"build": "tsup src/*.ts --splitting --cjsInterop"`
