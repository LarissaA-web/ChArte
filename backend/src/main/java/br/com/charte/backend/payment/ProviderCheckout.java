package br.com.charte.backend.payment;

import java.net.URI;

public record ProviderCheckout(String providerPaymentId, URI checkoutUrl, PaymentStatus status) {
}
