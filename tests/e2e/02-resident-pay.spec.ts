import { test, expect } from '@playwright/test';
import { injectAuthCookie } from './helpers/auth-cookie';

test.describe('Resident Payment Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await injectAuthCookie(context, 'RESIDENT', 'usr_res_e2e', '9811122233');

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
            id: 'usr_res_e2e',
            name: 'Priya Sharma',
            phone: '9811122233',
            email: 'priya@example.com',
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
            id: 'dep_mock_1',
            amountDuePaise: '5000000',
            amountPaidPaise: '2000000',
            remainingBalancePaise: '3000000',
            status: 'PARTIAL',
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
          orderId: 'order_rzp_live_mock_123',
          amountPaise: 3000000,
          currency: 'INR',
          keyId: 'rzp_test_mock_key',
          paymentId: 'pay_rec_123',
        }),
      });
    });

    await page.route('/api/payments/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          paymentId: 'pay_rec_123',
          receiptNumber: 'REC-2026-B204-001',
          status: 'SUCCESS',
        }),
      });
    });
  });

  test('should render resident dashboard and complete online Razorpay checkout', async ({ page }) => {
    await page.goto('/resident');

    // Dashboard verification
    await expect(page.getByText('₹30,000').first()).toBeVisible();
    await expect(page.getByText('PARTIAL').first()).toBeVisible();

    // Click Pay Now with UPI
    await page.getByRole('button', { name: /Pay Now with UPI/i }).click();

    // Verify Pay Now form
    await expect(page.getByText('Security Deposit Payment')).toBeVisible();
    await expect(page.getByRole('button', { name: /Pay Full Balance/i })).toBeVisible();

    // Mock Razorpay global SDK on window before clicking Proceed
    await page.evaluate(() => {
      (window as any).Razorpay = function (options: any) {
        return {
          on: () => {},
          open: () => {
            options.handler({
              razorpay_order_id: 'order_rzp_live_mock_123',
              razorpay_payment_id: 'pay_rzp_mock_success_99',
              razorpay_signature: 'valid_mock_signature',
            });
          },
        };
      };
    });

    await page.getByRole('button', { name: /Proceed with ₹30,000/i }).click();

    // Verify Payment Completed screen & receipt button
    await expect(page.getByText('Payment Completed!')).toBeVisible();
    await expect(page.getByText('REC-2026-B204-001')).toBeVisible();
    await expect(page.getByRole('link', { name: /Download Receipt PDF/i })).toBeVisible();
  });
});
