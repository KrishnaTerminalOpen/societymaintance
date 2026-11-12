export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { SentryTracker, AppLogger } = await import('@colony/shared');
    SentryTracker.init();
    AppLogger.info('Next.js server runtime initialized', { context: 'Instrumentation' });
  }
}

