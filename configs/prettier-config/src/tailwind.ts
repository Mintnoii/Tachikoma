import config from './base'

export default {
  ...config,
  plugins: [...(config.plugins || ''), 'prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cx'],
}
