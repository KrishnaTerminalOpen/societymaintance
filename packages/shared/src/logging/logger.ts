export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface StructuredLogMeta {
  context?: string;
  traceId?: string;
  userId?: string;
  orderId?: string;
  paymentId?: string;
  ip?: string;
  error?: any;
  [key: string]: any;
}

export class AppLogger {
  private static isProduction = process.env.NODE_ENV === 'production';

  private static format(level: LogLevel, message: string, meta?: StructuredLogMeta): string {
    const timestamp = new Date().toISOString();
    const logObj = {
      timestamp,
      level,
      message,
      context: meta?.context || 'App',
      traceId: meta?.traceId,
      userId: meta?.userId,
      orderId: meta?.orderId,
      paymentId: meta?.paymentId,
      ip: meta?.ip,
      ...(meta?.error ? { error: meta.error.stack || meta.error.message || meta.error } : {}),
      meta,
    };

    if (this.isProduction) {
      return JSON.stringify(logObj);
    }

    // Dev friendly colored / readable format
    const metaStr = meta && Object.keys(meta).length > 0 ? ` | meta: ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] [${logObj.context}]: ${message}${metaStr}`;
  }

  static info(message: string, meta?: StructuredLogMeta) {
    console.info(this.format('INFO', message, meta));
  }

  static warn(message: string, meta?: StructuredLogMeta) {
    console.warn(this.format('WARN', message, meta));
  }

  static error(message: string, meta?: StructuredLogMeta) {
    console.error(this.format('ERROR', message, meta));
  }

  static debug(message: string, meta?: StructuredLogMeta) {
    if (!this.isProduction) {
      console.debug(this.format('DEBUG', message, meta));
    }
  }
}

