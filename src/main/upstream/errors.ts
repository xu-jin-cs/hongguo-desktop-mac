/** upstream 错误分类：server 层据此映射 502/504。 */
export type UpstreamErrorKind = 'timeout' | 'http' | 'network' | 'validate' | 'notfound';

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status?: number;

  constructor(kind: UpstreamErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'UpstreamError';
    this.kind = kind;
    this.status = status;
  }
}

/** server 层统一调用：UpstreamError → 响应 code。 */
export function upstreamErrorToCode(err: UpstreamError): 502 | 504 | 404 {
  if (err.kind === 'timeout') return 504;
  if (err.kind === 'notfound') return 404;
  return 502;
}
