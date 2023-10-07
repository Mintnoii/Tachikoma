import { echo, chalk } from "zx";
import figlet from "figlet";

// export const figletLog = (msg:string) => figlet.textSync(msg,{font:'big'})

export const QingCLI = () => chalk.magenta.bold(
  figlet.textSync("Q I N G - C L I", { font: "big" })
);

// chalk.magenta.bold(
//     figlet.textSync("Q I N G - C L I", { font: "big" }) +
//       "\n" +
//       "🌿 Qing-Cli 前端项目 CLI 工具" + "\n"
//   );

const logColorMap = {
  success: 'green',
  error: 'red',
  warn: 'yellow',
  link: 'cyan',
  note: 'gray',
};

export const chalkText = (text: string, type?: keyof typeof logColorMap) => {
  if (type) {
    return chalk[logColorMap[type]](text);
  }
  return chalk.gray(text);
}

export const chalkLog = (text: string, type?: keyof typeof logColorMap) => echo(chalkText(text, type));
