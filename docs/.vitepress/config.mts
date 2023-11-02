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
          { text: 'Utils', link: 'utils' },
          { text: 'Configs', link: 'configs' },
          { text: 'Notion-Kit', link: 'notion'},
          { text: 'CLI', link: 'cli' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Mintnoii/Tachikoma' }
    ],
    outline: 3,
    docFooter: {
      prev: false,
      next: false
    },
    lastUpdated: {
      text: '最近更新时间',
      formatOptions:
        { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }

    }
  }
})
