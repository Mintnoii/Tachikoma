# Design: Tachikoma 全仓代码审美与第一性架构重构

## 核心设计理念
贯彻《全机 AI Agent 最高系统行为门禁》第一条（起手编码审美门禁）：
1. **消灭命令式流程样板**：
   - 抽象统一的无头浏览器生命周期函数 `withBrowserContext<T>` / `withPage<T>`，彻底消灭 `let browser = null; try ... finally ...` 阶梯模板；
   - 统一由作用域自动回收资源，无论正常返回还是抛错均 100% 确保资源关闭；
2. **消灭原生 try/catch 与 catch(() => null) 掩耳盗铃**：
   - 业务逻辑层统一使用 `radash.tryit`；
   - JSON 容错解析统一提纯为安全的 `safeJsonParse<T>`，内部直接结合 `jsonrepair`，消灭裸写 `try { JSON.parse } catch {}`；
3. **消灭命令式 for 循环游标**：
   - 集合变换统一使用 `radash` 函数式管道（`sift`, `unique`, `first`, `flat`, `map`）；
   - 键值与对象提取使用声明式查找，替代 `for (const k of Object.keys(obj))`；
4. **消灭下游无脑防御八股**：
   - 信任 TypeBox 契约，消灭散落的 `Array.isArray` 与嵌套三元；
   - 使用统一的平实切片与标准 URL 解析，消除易碎复杂正则。
