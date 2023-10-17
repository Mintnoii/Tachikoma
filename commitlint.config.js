/** @type {import('cz-git').UserConfig} */
module.exports = {
  rules: {
    // @see: https://commitlint.js.org/#/reference-rules
    'type-empty': [2, 'never'],
  },
  prompt: {
    alias: { fd: 'docs: fix typos' },
    messages: {
      type: '请选择一种提交类型:',
      // scope: 'Denote the SCOPE of this change (optional):',
      // customScope: 'Denote the SCOPE of this change:',
      subject: '请简要描述提交 message (必填):\n',
      // body: 'Provide a LONGER description of the change (optional). Use "|" to break new line:\n',
      // breaking: 'List any BREAKING CHANGES (optional). Use "|" to break new line:\n',
      // footerPrefixesSelect: 'Select the ISSUES type of changeList by this change (optional):',
      // customFooterPrefix: 'Input ISSUES prefix:',
      // footer: 'List any ISSUES by this change. E.g.: #31, #34:\n',
      // generatingByAI: 'Generating your AI commit subject...',
      // generatedSelectByAI: 'Select suitable subject by AI generated:',
      confirmCommit: '确认使用以上信息提交？',
    },
    types: [
      { value: 'wip', name: 'wip:        工作进度更新', emoji: ':construction:' },
      { value: 'feat', name: 'feat:     新增功能特性', emoji: ':sparkles:' },
      { value: 'fix', name: 'fix:      修复缺陷', emoji: ':bug:' },
      { value: 'docs', name: 'docs:     文档变更', emoji: ':memo:' },
      { value: 'style', name: 'style:   只是样式更新', emoji: ':lipstick:' },
      {
        value: 'refactor',
        name: 'refactor: 代码重构（不包括 bug 修复、功能新增）',
        emoji: ':recycle:',
      },
      { value: 'perf', name: 'perf:    性能优化', emoji: ':zap:' },
      {
        value: 'build',
        name: 'build:    修改打包 / 构建流程、变更外部依赖',
        emoji: ':package:',
      },
      { value: 'ci', name: 'ci:       修改 CI 配置、脚本', emoji: ':ferris_wheel:' },
      { value: 'chore', name: 'chore:    其他修改', emoji: ':hammer:' },
      { value: 'revert', name: 'revert:  回滚 commit', emoji: ':rewind:' },
      // {
      //   value: 'test',
      //   name: 'test:     Adding missing tests or correcting existing tests',
      //   emoji: ':white_check_mark:',
      // },
    ],
    useEmoji: true,
    emojiAlign: 'center',
    useAI: false,
    aiNumber: 1,
    skipQuestions: ['scope', 'body', 'breaking', 'footerPrefix', 'footer'],
  },
}
