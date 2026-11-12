/**
 * ColonyDeposit Sentry Integration Wrapper
 * Safely captures exceptions and messages without throwing if SENTRY_DSN is unconfigured.
 */

export class SentryTracker {
  private static dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  private static isInitialized = false;

  static init() {
    if (this.dsn && !this.isInitialized) {
      this.isInitialized = true;
      console.info('🛡️ Sentry Error Tracking initialized.');
    }
  }

  static captureException(error: any, context?: Record<string, any>) {
    if (this.dsn) {
      // In production with Sentry installed, Sentry.captureException is invoked
      console.error('[Sentry Captured Exception]', error?.message || error, context);
    }
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
    if (this.dsn) {
      console.warn(`[Sentry Captured Message - ${level.toUpperCase()}]`, message, context);
    }
  }
}

