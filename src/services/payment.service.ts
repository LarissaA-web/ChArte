import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Ajuste a baseUrl conforme o ambiente do backend. O servidor deve confirmar pagamentos. */
export const PAYMENT_API_BASE_URL = '/api/payments';

export interface CheckoutRequest {
  orderId: number;
  method: 'pix' | 'card' | 'transfer';
}

export interface CheckoutResponse {
  paymentId: string;
  checkoutUrl: string;
  status: 'pending' | 'paid' | 'failed';
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: 'pending' | 'paid' | 'failed';
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private http: HttpClient) {}

  criarCheckout(dados: CheckoutRequest): Observable<CheckoutResponse> {
    return this.http.post<CheckoutResponse>(`${PAYMENT_API_BASE_URL}/checkout`, dados);
  }

  consultarStatus(paymentId: string): Observable<PaymentStatusResponse> {
    return this.http.get<PaymentStatusResponse>(`${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}`);
  }
}
