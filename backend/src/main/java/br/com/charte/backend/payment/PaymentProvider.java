package br.com.charte.backend.payment;

import java.math.BigDecimal;

/** Adapter boundary for a payment gateway. Implementations must not decide business ownership rules. */
public interface PaymentProvider {
    String name();

    ProviderCheckout createCheckout(String paymentReference, BigDecimal amount, PaymentMethod method);

    PaymentStatus getStatus(String providerPaymentId);
}
