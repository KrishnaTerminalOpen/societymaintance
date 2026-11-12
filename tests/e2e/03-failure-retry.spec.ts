import { test, expect } from '@playwright/test';
import { injectAuthCookie } from './helpers/auth-cookie';

test.describe('Payment Failure & Retry Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await injectAuthCookie(context, 'RESIDENT', 'usr_res_fail_e2e', '9811122233');

    await page.route('https://checkout.razorpay.com/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.route('/api/events*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });

    await page.route('/api/resident/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: {
            id: 'usr_res_fail_e2e',
            name: 'Priya Sharma',
            phone: '9811122233',
            role: 'RESIDENT',
            status: 'ACTIVE',
            houses: [{ block: 'B', houseNumber: '204', type: 'FLAT_2BHK' }],
          },
        }),
      });
    });

    await page.route('/api/resident/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          house: { block: 'B', houseNumber: '204', type: 'FLAT_2BHK' },
          deposit: {
            id: 'dep_mock_fail_1',
            amountDuePaise: '5000000',
            amountPaidPaise: '0',
            remainingBalancePaise: '5000000',
            status: 'PENDING',
            dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          },
          recentPayments: [],
        }),
      });
    });

    await page.route('/api/resident/payments', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payments: [] }) });
    });
    await page.route('/api/resident/refunds', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ refunds: [] }) });
    });
    await page.route('/api/resident/notifications', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    });

    await page.route('/api/payments/create-order', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'order_rzp_failed_test_1',
          amountPaise: 5000000,
          currency: 'INR',
          keyId: 'rzp_test_mock_key',
        }),
      });
    });
  });

  test('should show friendly failure screen when payment fails and allow retrying', async ({ page }) => {
    await page.goto('/resident');

    await page.getByRole('button', { name: /Pay Now with UPI/i }).click();
    await expect(page.getByText('Security Deposit Payment')).toBeVisible();

    // Mock Razorpay SDK triggering payment.failed event
    await page.evaluate(() => {
      (window as any).Razorpay = function () {
        const listeners: Record<string, any> = {};
        return {
          on: (event: string, cb: any) => {
            listeners[event] = cb;
          },
          open: () => {
            if (listeners['payment.failed']) {
              listeners['payment.failed']({
                error: { description: 'UPI PIN entry timed out by issuing bank.' },
              });
            }
          },
        };
      };
    });

    await page.getByRole('button', { name: /Proceed with ₹50,000/i }).click();

    // Verify failure screen & specific error text
    await expect(page.getByRole('heading', { name: 'Payment Failed' })).toBeVisible();
    await expect(page.getByText('UPI PIN entry timed out by issuing bank.')).toBeVisible();

    // Retry payment returns to form
    const retryBtn = page.getByRole('button', { name: /Retry Payment/i });
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    await expect(page.getByText('Security Deposit Payment')).toBeVisible();
    await expect(page.getByRole('button', { name: /Proceed with ₹50,000/i })).toBeVisible();
  });
});
