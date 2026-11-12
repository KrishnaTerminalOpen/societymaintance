import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics to track latency across stages
const otpSendTrend = new Trend('otp_send_duration');
const otpVerifyTrend = new Trend('otp_verify_duration');
const residentDashboardTrend = new Trend('resident_dashboard_duration');
const orderCreationTrend = new Trend('order_creation_duration');
const paymentVerifyTrend = new Trend('payment_verify_duration');
const errorRate = new Rate('custom_error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 200 },   // Warm-up ramp
    { duration: '1m', target: 500 },    // Standard concurrency (500 users)
    { duration: '1m30s', target: 1000 },// Peak blast concurrency (1000 users right after reminder)
    { duration: '30s', target: 0 },     // Ramp-down
  ],
  thresholds: {
    // Global requirement: p95 latency under 500ms for normal APIs
    'http_req_duration': ['p(95)<500'],
    'resident_dashboard_duration': ['p(95)<150'], // High-performance Redis target < 150ms
    'otp_send_duration': ['p(95)<300'],
    'custom_error_rate': ['rate<0.01'],          // Less than 1% errors
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  const phone = `98765${String(10000 + (__VU % 1000)).slice(-5)}`;
  const testOtp = '123456';
  let accessToken = '';

  // 1. User Authentication: OTP Request & Verification
  group('01_Authentication', function () {
    const sendOtpPayload = JSON.stringify({ phone });
    const sendRes = http.post(`${BASE_URL}/api/auth/send-otp`, sendOtpPayload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'SendOTP' },
    });
    otpSendTrend.add(sendRes.timings.duration);
    const sendOk = check(sendRes, {
      'send_otp status 200': (r) => r.status === 200 || r.status === 429, // 429 if rate limited
    });
    if (!sendOk) errorRate.add(1);

    sleep(0.5);

    const verifyOtpPayload = JSON.stringify({ phone, otp: testOtp });
    const verifyRes = http.post(`${BASE_URL}/api/auth/verify-otp`, verifyOtpPayload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'VerifyOTP' },
    });
    otpVerifyTrend.add(verifyRes.timings.duration);
    const verifyOk = check(verifyRes, {
      'verify_otp status 200': (r) => r.status === 200,
    });
    if (!verifyOk) errorRate.add(1);

    if (verifyRes.status === 200) {
      try {
        const body = JSON.parse(verifyRes.body);
        accessToken = body.accessToken || '';
      } catch (e) {}
    }
  });

  sleep(1);

  // 2. Resident Dashboard: Heavy-Read Cached Query
  group('02_Resident_Dashboard', function () {
    const dashRes = http.get(`${BASE_URL}/api/resident/dashboard`, {
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      tags: { name: 'ResidentDashboard' },
    });
    residentDashboardTrend.add(dashRes.timings.duration);
    const dashOk = check(dashRes, {
      'dashboard status 200': (r) => r.status === 200,
      'dashboard p95 fast': (r) => r.timings.duration < 500,
    });
    if (!dashOk) errorRate.add(1);
  });

  sleep(1);

  // 3. Payment Flow: Create Order & Verification
  group('03_Payment_Checkout', function () {
    const idempotencyKey = `idemp_${__VU}_${__ITER}_${Date.now()}`;
    const orderPayload = JSON.stringify({
      amount: 100000, // Rs 1,000 in paise
      idempotencyKey,
    });

    const orderRes = http.post(`${BASE_URL}/api/payments/create-order`, orderPayload, {
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      tags: { name: 'CreateOrder' },
    });
    orderCreationTrend.add(orderRes.timings.duration);
    const orderOk = check(orderRes, {
      'create_order status 200 or 429': (r) => r.status === 200 || r.status === 429,
    });
    if (!orderOk) errorRate.add(1);

    sleep(1);

    // Verify Payment
    const verifyPayload = JSON.stringify({
      orderId: `order_sim_${__VU}_${__ITER}`,
      paymentId: `pay_sim_${__VU}_${__ITER}`,
      signature: 'test_signature_mock',
    });

    const verifyRes = http.post(`${BASE_URL}/api/payments/verify`, verifyPayload, {
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      tags: { name: 'VerifyPayment' },
    });
    paymentVerifyTrend.add(verifyRes.timings.duration);
    check(verifyRes, {
      'verify_payment received': (r) => r.status === 200 || r.status === 400 || r.status === 429,
    });
  });

  sleep(1);
}

