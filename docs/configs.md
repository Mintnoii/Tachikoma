# Configs

## @tachikomas/tsconfig

Custom `tsconfig` setup that can be extended.

### Breakdown

All currently `cjs` format:

- `./base`

todo

- `./next` todo
- `./node`
- `./react`

```sh
pnpm install @tachikomas/tsconfig --dev
```

### Example

```json
{
  // ...
  "extends": "@tachikomas/tsconfig/base.json"
  // ...
}
```

## @tachikomas/prettier-config

Quick prettier config to share across

### Usage

```js
module.exports = {
  ...require('@tachikomas/prettier-config'),
}
```
