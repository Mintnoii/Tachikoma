import BaseConfig from './base'

export default {
  ...BaseConfig,
  plugins: [...(BaseConfig.plugins || ''), 'prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cx'],
}
