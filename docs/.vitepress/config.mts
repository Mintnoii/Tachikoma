import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Tachikomas",
  description: "A VitePress Site",
  // base: '/',
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    // nav: [
    //   { text: 'Home', link: '/' },
    //   { text: 'Examples', link: '/markdown-examples' }
    // ],

    sidebar: [
      {
        text: 'Kits',
        items: [
          { text: 'Utils', link: 'utils/index' },
          { text: 'CLI', link: 'cli/index' },
          { text: 'Notion-Kit', link: 'notion/index'}
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Mintnoii/Tachikoma' }
    ]
  }
})
