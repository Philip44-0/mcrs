import { ApiError, Reject } from '@mcrs/shared';

export interface ErrorInfo {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  /** True for errors nobody planned for (bugs). They are logged with their stack. */
  unexpected: boolean;
}

/** What the client gets for an error. Details of unexpected errors stay on the server. */
export function describeError(error: unknown): ErrorInfo {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      unexpected: false,
    };
  }
  if (error instanceof Reject) {
    const message = error.message === error.code ? 'The action was refused.' : error.message;
    return { status: 409, code: error.code, message, details: error.details, unexpected: false };
  }

  // errors of the JSON body parser and of Express itself
  const shape = (typeof error === 'object' && error !== null ? error : {}) as {
    type?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  switch (shape.type) {
    case 'entity.too.large':
      return {
        status: 413,
        code: 'request.tooLarge',
        message: 'The request body is too large.',
        unexpected: false,
      };
    case 'entity.parse.failed':
      return {
        status: 400,
        code: 'request.invalidJson',
        message: 'The request body is not valid JSON.',
        unexpected: false,
      };
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return {
        status: 415,
        code: 'request.unsupported',
        message: 'The request uses an unsupported encoding.',
        unexpected: false,
      };
    case 'request.aborted':
      return {
        status: 400,
        code: 'request.aborted',
        message: 'The request was cancelled.',
        unexpected: false,
      };
  }
  const status = typeof shape.status === 'number' ? shape.status : shape.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return {
      status,
      code: 'request.invalid',
      message: 'The request is not valid.',
      unexpected: false,
    };
  }

  return {
    status: 500,
    code: 'server.internalError',
    message: 'Something went wrong on the server.',
    unexpected: true,
  };
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/** The same shape for every error: { error: { code, message, details?, requestId? } }. */
export function errorBody(info: ErrorInfo, requestId?: string): ErrorBody {
  return {
    error: {
      code: info.code,
      message: info.message,
      ...(info.details !== undefined ? { details: info.details } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    },
  };
}
