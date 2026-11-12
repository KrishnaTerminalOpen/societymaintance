import { test, expect } from '@playwright/test';
import { injectAuthCookie } from './helpers/auth-cookie';

test.describe('Refund Workflow (Resident Request & Admin Review)', () => {
  test('should allow resident to submit refund request and admin to approve gateway refund', async ({ page, context }) => {
    let refundApproved = false;

    await page.route('/api/events*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });

    // 1. Resident submits refund claim
    await injectAuthCookie(context, 'RESIDENT', 'usr_res_refund_1', '9812345678');

    await page.route('/api/resident/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: {
            id: 'usr_res_refund_1',
            name: 'Aarav Gupta',
            phone: '9812345678',
            role: 'RESIDENT',
            houses: [{ block: 'A', houseNumber: '101', type: 'FLAT_2BHK' }],
          },
        }),
      });
    });

    await page.route('/api/resident/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          house: { block: 'A', houseNumber: '101', type: 'FLAT_2BHK' },
          deposit: {
            id: 'dep_a101',
            amountDuePaise: '4000000',
            amountPaidPaise: '4000000',
            remainingBalancePaise: '0',
            status: 'PAID',
            dueDate: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route('/api/resident/payments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          payments: [
            {
              id: 'pay_orig_1',
              amountPaise: '4000000',
              status: 'SUCCESS',
              method: 'UPI',
              createdAt: new Date().toISOString(),
              receipt: { receiptNumber: 'REC-2026-A101-01' },
            },
          ],
        }),
      });
    });

    await page.route('/api/resident/notifications', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    });

    await page.route('/api/resident/refunds', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, refundId: 'ref_pending_1', status: 'PENDING' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            refunds: [
              {
                id: 'ref_pending_1',
                amountPaise: '4000000',
                reason: 'Moving out / Lease ended',
                status: 'PENDING',
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        });
      }
    });

    await page.goto('/resident');
    await page.getByRole('button', { name: /Refund Tracker|Refunds/i }).locator('visible=true').first().click();
    await expect(page.getByText('Deposit Refunds & Returns')).toBeVisible();
    await expect(page.getByText('UNDER COMMITTEE REVIEW')).toBeVisible();

    // 2. Admin approves refund claim
    await injectAuthCookie(context, 'ADMIN', 'admin_e2e_1', '9800000002');

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
            totalDuePaise: '200000000',
            totalCollectedPaise: '200000000',
            totalPendingPaise: '0',
            paidHousesCount: 50,
            unpaidHousesCount: 0,
            totalHousesCount: 50,
            collectionRatePercentage: 100,
          },
          recentPayments: [],
          chartData: [],
        }),
      });
    });

    await page.route('/api/admin/refunds*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'ref_pending_1',
              amountPaise: '4000000',
              reason: 'Moving out / Lease ended',
              status: refundApproved ? 'PROCESSED' : 'PENDING',
              gatewayRefundId: refundApproved ? 'rfnd_rzp_mock_gateway_99' : null,
              createdAt: new Date().toISOString(),
              unit: 'Block A-101',
              resident: { name: 'Aarav Gupta', phone: '9812345678' },
              payment: { id: 'pay_orig_1', amountPaise: '4000000' },
            },
          ],
          pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
        }),
      });
    });

    await page.route('/api/admin/refunds/ref_pending_1/review', async (route) => {
      refundApproved = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          refundId: 'ref_pending_1',
          status: 'PROCESSED',
          gatewayRefundId: 'rfnd_rzp_mock_gateway_99',
        }),
      });
    });

    await page.goto('/admin');
    await page.getByRole('button', { name: /Refunds & Reconciliation|Recon/i }).locator('visible=true').first().click();

    await expect(page.getByText('Aarav Gupta')).toBeVisible();
    await expect(page.getByText('₹40,000').first()).toBeVisible();

    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText('Approve Security Deposit Refund')).toBeVisible();

    await page.getByRole('button', { name: /Confirm Gateway Refund/i }).click();

    await expect(page.getByText('Approve Security Deposit Refund')).not.toBeVisible();
    await expect(page.getByText('PROCESSED')).toBeVisible();
  });
});
