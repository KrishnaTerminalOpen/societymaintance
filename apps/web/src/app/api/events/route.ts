import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma, PaymentStatus } from '@colony/database';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const channel = searchParams.get('channel') || (session.role === 'RESIDENT' ? 'resident' : 'admin');

  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Send connection established handshake
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ channel, user: session.name, timestamp: Date.now() })}\n\n`),
      );

      let lastCheckedAt = new Date();

      // 2. Poll & Heartbeat interval (every 5 seconds)
      const interval = setInterval(async () => {
        if (isClosed) {
          clearInterval(interval);
          return;
        }

        try {
          if (channel === 'admin') {
            // Check for new payments since last check
            const newPayments = await prisma.payment.findMany({
              where: {
                status: PaymentStatus.SUCCESS,
                updatedAt: { gt: lastCheckedAt },
              },
              take: 5,
              include: { user: { select: { name: true } } },
            });

            if (newPayments.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `event: PAYMENT_RECEIVED\ndata: ${JSON.stringify({
                    count: newPayments.length,
                    latest: newPayments[0],
                    timestamp: Date.now(),
                  })}\n\n`,
                ),
              );
            }

            // Check for new refund requests
            const newRefunds = await prisma.refund.findMany({
              where: {
                status: 'PENDING',
                createdAt: { gt: lastCheckedAt },
              },
              take: 3,
            });

            if (newRefunds.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `event: REFUND_REQUESTED\ndata: ${JSON.stringify({
                    count: newRefunds.length,
                    timestamp: Date.now(),
                  })}\n\n`,
                ),
              );
            }
          } else {
            // Resident channel: check for user's recent payments or receipts
            const userPayments = await prisma.payment.findMany({
              where: {
                userId: session.sub,
                updatedAt: { gt: lastCheckedAt },
              },
              include: { receipt: true },
            });

            if (userPayments.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `event: PAYMENT_UPDATED\ndata: ${JSON.stringify({
                    payment: userPayments[0],
                    timestamp: Date.now(),
                  })}\n\n`,
                ),
              );
            }
          }

          lastCheckedAt = new Date();

          // Keep-alive heartbeat comment to prevent browser timeout
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch (err) {
          // Keep stream open on intermittent errors
        }
      }, 5000);

      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
