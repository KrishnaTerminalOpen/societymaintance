export interface CreateGatewayOrderParams {
  amountPaise: bigint | number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface GatewayOrderResult {
  orderId: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface GatewayPaymentDetails {
  paymentId: string;
  orderId?: string;
  amountPaise: number;
  currency: string;
  status: 'captured' | 'failed' | 'authorized' | 'refunded' | 'created';
  method: string;
  bank?: string;
  wallet?: string;
  vpa?: string; // UPI Virtual Payment Address
  email?: string;
  contact?: string;
  errorCode?: string;
  errorDescription?: string;
  captured: boolean;
}

export interface GatewayRefundParams {
  paymentId: string;
  amountPaise: bigint | number;
  notes?: Record<string, string>;
}

export interface GatewayRefundResult {
  refundId: string;
  paymentId: string;
  amountPaise: number;
  status: string;
}

export interface IPaymentGateway {
  readonly name: string;
  createOrder(params: CreateGatewayOrderParams): Promise<GatewayOrderResult>;
  verifyPayment(params: VerifyPaymentParams): boolean;
  fetchPayment(paymentId: string): Promise<GatewayPaymentDetails>;
  refund(params: GatewayRefundParams): Promise<GatewayRefundResult>;
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
}
