export type DouyinExtractionReason =
  | "ssr-no-item"
  | "bridge-empty"
  | "api-forbidden"
  | "dom-fallback-empty"
  /** 详情接口按上下文过滤图文作品（filter_reason=images_base） */
  | "images-filtered";

export interface DouyinExtractionErrorOptions {
  attempts?: string[];
  cause?: unknown;
}

export class DouyinExtractionError extends Error {
  readonly reason: DouyinExtractionReason;
  readonly attempts: string[];

  constructor(
    reason: DouyinExtractionReason,
    message: string,
    options?: DouyinExtractionErrorOptions
  ) {
    super(message, options ? { cause: options.cause } : undefined);
    this.name = "DouyinExtractionError";
    this.reason = reason;
    this.attempts = options?.attempts ?? [];
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
