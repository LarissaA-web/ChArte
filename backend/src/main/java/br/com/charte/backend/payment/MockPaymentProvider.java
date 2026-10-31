package br.com.charte.backend.payment;

import java.math.BigDecimal;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Development-only adapter. It never contacts a financial institution or represents received money. */
public final class MockPaymentProvider implements PaymentProvider {
    private final Map<String, PaymentStatus> statuses = new ConcurrentHashMap<>();
    private final URI checkoutBaseUri;

    public MockPaymentProvider(URI checkoutBaseUri) {
        this.checkoutBaseUri = checkoutBaseUri;
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public ProviderCheckout createCheckout(String paymentReference, BigDecimal amount, PaymentMethod method) {
        if (paymentReference == null || paymentReference.isBlank()) {
            throw new IllegalArgumentException("paymentReference is required");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("amount must be positive");
        }
        String providerPaymentId = "mock_" + UUID.randomUUID();
        statuses.put(providerPaymentId, PaymentStatus.PENDING);
        URI checkoutUrl = checkoutBaseUri.resolve("checkout/" + providerPaymentId);
        return new ProviderCheckout(providerPaymentId, checkoutUrl, PaymentStatus.PENDING);
    }

    @Override
    public PaymentStatus getStatus(String providerPaymentId) {
        PaymentStatus status = statuses.get(providerPaymentId);
        if (status == null) {
            throw new IllegalArgumentException("Unknown mock payment");
        }
        return status;
    }

    /** Explicitly intended for a future development-only controller, never a customer endpoint. */
    public void setDevelopmentStatus(String providerPaymentId, PaymentStatus status) {
        if (!statuses.containsKey(providerPaymentId)) {
            throw new IllegalArgumentException("Unknown mock payment");
        }
        statuses.put(providerPaymentId, status);
    }
}
