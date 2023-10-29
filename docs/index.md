---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Tachikomas'
  # text: 'My personalized dev kit'
  tagline: My personalized dev kit
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

features:
  - icon: 🛠️
    title: Utils
    details: 常用的各类工具函数，只追求简单、实用
    link: utils
  
  - icon: 🪬
    title: Configs
    details: 项目常用的基础配置，包括 tsconfig 与各类 lint-config，个性化但都可以被覆盖，扩展或忽略
    link: configs

  - icon: 🪄
    title: Notion-Kit
    details: 常用与 Notion API 的交互，方便地查询数据库、检索页面和处理各种类型的 Notion Block
    link: notion
  
  - icon: 👾
    title: CLI
    details: 脚手架工具，能力开发中...
    link: cli
---