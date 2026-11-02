/**
 * @file packages/core/src/telemetry.ts
 * @description Tachikoma 极轻量级 Fail-Silent 遥测发射器中间件。
 * 纯原生 TypeScript + radash.tryit 实现，零侵入，与 NetDive 控制平面无缝连线。
 *
 * 核心审美契约 (MIND.md 维度 3)：
 * 1. 函数式闭包优先：消灭 class 样板与面向对象内部多重状态；
 * 2. 依托 radash.tryit 彻底消灭原生 try/catch 胶水；
 * 3. Fail-Silent：探活超时（50ms）或网络失败时静默透传原函数，业务 100% 毫无察觉；
 * 4. 发生业务错误时 Fail-Fast 原样抛出真实异常，绝不吞掉错误。
 */

import { tryit } from "radash";

export interface TachikomaReporterConfig {
  /** NetDive Bridge 服务端地址，默认 http://127.0.0.1:4560 */
  readonly endpoint?: string;
  /** 探针超时时间（毫秒），默认 50ms 极速探活 */
  readonly probeTimeoutMs?: number;
  /** 当前流水线会话 ID */
  readonly sessionId?: string;
  /** 是否强制禁用 */
  readonly disabled?: boolean;
}

export interface TachikomaStepOptions {
  /** 节点中文展示标题 */
  readonly title?: string;
  /** 手势分类 (fetch / clean / classify / disk / tool) */
  readonly gesture?: "fetch" | "clean" | "classify" | "disk" | "tool";
  /** 业务元数据 (耗时、字数、提取标签等) */
  readonly metadata?: Record<string, unknown>;
}

export interface TachikomaReporter {
  readonly sessionId: string;
  readonly probe: () => Promise<boolean>;
  readonly step: <T>(
    stepName: string,
    executeFn: () => Promise<T> | T,
    options?: TachikomaStepOptions
  ) => Promise<T>;
}

/**
 * 极速探活：依托 radash.tryit 验证 NetDive Bridge 健康状态
 */
async function probeBridge(endpoint: string, timeoutMs: number): Promise<boolean> {
  const [err, res] = await tryit(async () => {
    return await fetch(`${endpoint}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
  })();

  return !err && Boolean(res?.ok);
}

/**
 * 静默异步发射遥测事件 (Fail-Silent，吞掉所有网络错误)
 */
async function emitSilently(endpoint: string, payload: Record<string, unknown>): Promise<void> {
  await tryit(async () => {
    await fetch(`${endpoint}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  })();
}

/**
 * 工厂函数：创建 Tachikoma 专用遥测发射器
 */
export function createTachikomaReporter(
  config: TachikomaReporterConfig = {}
): TachikomaReporter {
  const endpoint = (config.endpoint || process.env.NETDIVE_ENDPOINT || "http://127.0.0.1:4560").replace(/\/+$/, "");
  const probeTimeoutMs = config.probeTimeoutMs ?? 50;
  const sessionId = config.sessionId ?? `tachikoma-${Date.now().toString(36)}`;

  let isOnlineCache: boolean | null = config.disabled ? false : null;
  let parentNodeId: string | null = null;
  let stepSequence = 0;

  const probe = async (): Promise<boolean> => {
    if (isOnlineCache !== null) return isOnlineCache;
    isOnlineCache = await probeBridge(endpoint, probeTimeoutMs);
    return isOnlineCache;
  };

  const step = async <T>(
    stepName: string,
    executeFn: () => Promise<T> | T,
    options: TachikomaStepOptions = {}
  ): Promise<T> => {
    const isReady = await probe();
    if (!isReady) {
      // NetDive 未开启：直接透传执行业务函数，0 开销、0 报错
      return await executeFn();
    }

    const currentSequence = ++stepSequence;
    const nodeId = `${sessionId}-node-${currentSequence}`;
    const parentId = parentNodeId;
    const startTime = Date.now();

    // 发射步骤开始
    await emitSilently(endpoint, {
      type: "node_start",
      nodeId,
      parentId,
      stepSequence: currentSequence,
      name: stepName,
      title: options.title || stepName,
      gesture: options.gesture || "tool",
      timestamp: startTime,
      metadata: options.metadata,
    });

    // 依托 tryit 优雅执行业务
    const [execError, result] = await tryit(async () => await executeFn())();
    const durationMs = Date.now() - startTime;

    if (execError) {
      await emitSilently(endpoint, {
        type: "node_complete",
        nodeId,
        parentId,
        stepSequence: currentSequence,
        name: stepName,
        title: options.title || stepName,
        gesture: options.gesture || "tool",
        status: "failed",
        durationMs,
        errorMessage: execError.message,
        timestamp: Date.now(),
      });
      // 业务错误 Fail-Fast 原生抛出，绝不掩盖真实问题
      throw execError;
    }

    parentNodeId = nodeId;

    await emitSilently(endpoint, {
      type: "node_complete",
      nodeId,
      parentId,
      stepSequence: currentSequence,
      name: stepName,
      title: options.title || stepName,
      gesture: options.gesture || "tool",
      status: "success",
      durationMs,
      timestamp: Date.now(),
      metadata: {
        ...options.metadata,
        durationMs,
      },
    });

    return result as T;
  };

  return {
    sessionId,
    probe,
    step,
  };
}

/** 默认导出一个开箱即用的全局单例 */
export const tachikomaReporter = createTachikomaReporter();
