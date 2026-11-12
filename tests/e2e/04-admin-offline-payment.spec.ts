import { test, expect } from '@playwright/test';
import { injectAuthCookie } from './helpers/auth-cookie';

test.describe('Admin Offline Payment Recording Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await injectAuthCookie(context, 'ADMIN', 'admin_e2e_1', '9800000002');

    await page.route('/api/events*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });

    await page.route('/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'admin_e2e_1', name: 'Estate Manager', role: 'ADMIN', phone: '9800000002' },
        }),
      });
    });

    await page.route('/api/admin/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          metrics: {
            totalDuePaise: '250000000',
            totalCollectedPaise: '175000000',
            totalPendingPaise: '75000000',
            paidHousesCount: 35,
            unpaidHousesCount: 15,
            totalHousesCount: 50,
            collectionRatePercentage: 70,
          },
          recentPayments: [],
          chartData: [],
        }),
      });
    });

    await page.route('/api/admin/residents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          residents: [
            {
              id: 'res_offline_1',
              name: 'Vikram Mehta',
              phone: '9822334455',
              house: { id: 'house_101', block: 'C', houseNumber: '302', type: 'FLAT_3BHK' },
              deposit: {
                id: 'dep_c302',
                amountDuePaise: '6000000',
                amountPaidPaise: '0',
                remainingPaise: '6000000',
                status: 'PENDING',
              },
            },
          ],
          pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        }),
      });
    });

    await page.route('/api/admin/payments/record-offline', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          paymentId: 'pay_off_999',
          receiptNumber: 'REC-OFF-2026-C302-01',
          newBalance: '0',
          depositStatus: 'PAID',
        }),
      });
    });
  });

  test('should allow admin to record offline cash payment and generate receipt', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to Record Offline tab (desktop sidebar or mobile bottom nav)
    const offlineNav = page.getByRole('button', { name: /Record Cash \/ Cheque|Cash Entry/i }).locator('visible=true').first();
    await offlineNav.click();

    await expect(page.getByRole('heading', { name: 'Record Offline Payment' })).toBeVisible();

    // Select resident unit
    const residentSelect = page.locator('select').first();
    await residentSelect.selectOption('dep_c302');

    // Amount auto-populates ₹60,000
    const amountInput = page.locator('input[placeholder="e.g. 40000"]');
    await expect(amountInput).toHaveValue('60000');

    // Select Payment Method button: CASH
    await page.getByRole('button', { name: 'CASH', exact: true }).click();

    // Enter verification notes
    await page.locator('textarea').fill('Received full cash payment at estate office.');

    // Submit offline payment
    await page.getByRole('button', { name: /Confirm & Issue Official Receipt/i }).click();

    // Verify success banner and auto-generated receipt number
    await expect(page.getByText('Offline Payment Recorded!')).toBeVisible();
    await expect(page.getByText('REC-OFF-2026-C302-01')).toBeVisible();
  });
});
