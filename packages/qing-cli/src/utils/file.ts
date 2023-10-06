import { path, fs } from "zx";
// 脚手架 package.json 路径
export const packageJSONPath = path.resolve(__dirname, "../../package.json");
export const loadPackageJson = () => fs.readJSONSync(packageJSONPath);
