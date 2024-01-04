#! /usr/bin/env node

import { Command  } from "commander";
// import { init } from "./init.js";
// import {creator} from "./creator.js";
import { QingCLI, loadPackageJson } from "./utils";
import pkg from '../package.json'
// import { listTemplate, addCustomTmpl, rmCustomTmpl } from "./utils/tmpls.js";
// import {loadPackageJson} from "./utils/load.js";
// 创建程序实例并设置版本号
const program = new Command()
program.version(pkg.version, "-v, --version", "查看当前版本")
// program.helpOption("-h, --help", "查看帮助")
program.helpOption(false)
program.addHelpCommand(false)
program.addHelpText("before", QingCLI());
program
  .name("qing")
  // .option("-h, --help", "显示命令帮助")
  .option('-e, --exclude <globPatterns...>', '排除某些文件进行扫描')
  .option(
    '--allow-dirty',
    '默认屏蔽以下目录（node_modules，.git等），可以设置允许'
  )

// program.configureOutput({
//   // writeOut: (str) => process.stdout.write(`[OUT] ${str}`),
//   // writeErr: (str) => process.stdout.write(`[ERR] ${str}`),
//   // 将错误高亮显示,使输出变得容易区分
//   outputError: (str, write) => write(errorText(str)),
// });



// program
//   .command("init <project_name>")
//   .alias("i")
//   .description("🚀 使用模板初始化项目")
//   .option("-f, --force", "覆盖项目同名文件夹，强制初始化")
//   .action((project_name, options) => init(project_name, options));

// program
//   .command("list")
//   .alias("ls")
//   .description("👀 查看当前所有模板")
//   .action(() => listTemplate());

// program
//   .command("add-tmpl")
//   .description("📥 添加自定义模板")
//   .action(() => addCustomTmpl());

// program
//   .command("rm-tmpl <template_name>")
//   .description("📤 删除自定义模板：模板名")
//   .option("-f, --force", "强制删除")
//   .action((template_name, options) => rmCustomTmpl(template_name, options));

// program
//   .command("create <template_name>")
//   .alias("c")
//   .description("🧩 创建一个新项目")
//   .option("-f, --force", "覆盖项目同名文件夹，强制初始化")
//   .action((name, options) => creator(name, options));

// program
//   .command('hello [name]')
//   .description('打招呼')
//   .action((name, options) => {
//     console.log('你好', name, options.exclude, options.allowDirty)
//   })
program
  .command('test [command]')
  // .alias('h')
  // .description('查看帮助')
  .action((name, options) => {
    console.log('tips:', name, options.exclude, options.allowDirty)
  })
// 必须放到最后一行用于 解析命令行参数
program.parse(process.argv);
