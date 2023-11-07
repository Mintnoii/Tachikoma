---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Tachikomas'
  # text: My personalized dev kit
  tagline: '"塔奇克玛" 我的专属开发工具包'
  image:
    src: /favicon.ico
    alt: Tachikomas
  actions:
    - theme: brand
      text: 快速开始
      link: utils
    - theme: alt
      text: Github
      link: https://github.com/Mintnoii/Tachikoma
    - theme: alt
      text: Blog
      link: https://www.mintnoii.com

features:
  - icon: 🛠️
    title: Utils
    details: 常用的各类工具函数，模块化，只追求简单、实用
    link: utils

  - icon: 🪬
    title: Configs
    details: 项目常用的基础配置，包括 tsconfig 与各类 lint-config
    link: configs

  - icon: 🪄
    title: Notion-Kit
    details: 简化封装常用的 Notion API，方便查询数据库、检索页面和处理各种类型的 Notion Block
    link: notion

  - icon: 👾
    title: CLI
    details: 脚手架工具，目前只集成了模板项目创建，更多功能正在开发中...
    link: cli
---