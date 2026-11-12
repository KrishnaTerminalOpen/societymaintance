import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';

const DEFAULT_ACCESS_SECRET = 'colony-e2e-deterministic-jwt-secret-32chars!';

test.describe('Authentication Flow (OTP & RBAC)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/auth/send-otp', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'OTP sent successfully',
          resendCooldownSeconds: 30,
          devOtp: '123456',
        }),
      });
    });

    await page.route('/api/auth/verify-otp', async (route) => {
      const postData = JSON.parse(route.request().postData() || '{}');
      if (postData.otp === '123456') {
        const key = new TextEncoder().encode(
          process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || DEFAULT_ACCESS_SECRET,
        );
        const token = await new SignJWT({
          sub: 'usr_admin_e2e',
          phone: postData.phone,
          role: 'ADMIN',
          name: 'Estate Manager',
          sessionId: 'sess_login_e2e',
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(key);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'set-cookie': `colony_access_token=${token}; Path=/; HttpOnly; SameSite=Lax`,
          },
          body: JSON.stringify({
            success: true,
            user: {
              id: 'usr_admin_e2e',
              phone: postData.phone,
              name: 'Estate Manager',
              role: 'ADMIN',
            },
            redirectUrl: '/admin',
          }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid or expired OTP. Please try again.', attemptsLeft: 2 }),
        });
      }
    });

    await page.route('/api/events*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });
  });

  test('should display login page, send OTP, handle invalid code, and authenticate into dashboard', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'ColonyDeposit' })).toBeVisible();
    await expect(page.getByText('Sign in with Mobile')).toBeVisible();

    // Fill 10-digit mobile number
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9800000002');

    // Submit phone form
    await page.getByRole('button', { name: /Continue with OTP/i }).click();

    // Verify Step 2 renders 6 OTP boxes
    await expect(page.getByText('Enter Verification Code')).toBeVisible();
    const otpBoxes = page.locator('input[maxlength="1"]');
    await expect(otpBoxes).toHaveCount(6);

    // Fill invalid OTP 000000
    for (let i = 0; i < 6; i++) {
      await otpBoxes.nth(i).fill('0');
    }
    await page.getByRole('button', { name: /Verify & Sign In/i }).click();
    await expect(page.getByText(/Invalid or expired OTP/i)).toBeVisible();

    // Fill valid OTP 123456
    const validDigits = ['1', '2', '3', '4', '5', '6'];
    for (let i = 0; i < 6; i++) {
      await otpBoxes.nth(i).fill(validDigits[i]);
    }
    await page.getByRole('button', { name: /Verify & Sign In/i }).click();

    // Expect redirect to /admin
    await page.waitForURL(/\/admin/);
  });
});
