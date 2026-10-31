package br.com.charte.backend.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.net.URI;

import org.junit.jupiter.api.Test;

class MockPaymentProviderTest {
    private final MockPaymentProvider provider = new MockPaymentProvider(URI.create("http://localhost:8080/"));

    @Test
    void createsPendingCheckoutWithMockUrlAndNoRealCharge() {
        ProviderCheckout checkout = provider.createCheckout("payment-123", new BigDecimal("50.00"), PaymentMethod.PIX);

        assertThat(checkout.providerPaymentId()).startsWith("mock_");
        assertThat(checkout.checkoutUrl().toString()).startsWith("http://localhost:8080/checkout/mock_");
        assertThat(checkout.status()).isEqualTo(PaymentStatus.PENDING);
        assertThat(provider.getStatus(checkout.providerPaymentId())).isEqualTo(PaymentStatus.PENDING);
    }

    @Test
    void rejectsInvalidAmount() {
        assertThatThrownBy(() -> provider.createCheckout("payment-123", BigDecimal.ZERO, PaymentMethod.CARD))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void developmentStatusChangeIsScopedToKnownMockPayment() {
        ProviderCheckout checkout = provider.createCheckout("payment-123", BigDecimal.TEN, PaymentMethod.TRANSFER);

        provider.setDevelopmentStatus(checkout.providerPaymentId(), PaymentStatus.FAILED);

        assertThat(provider.getStatus(checkout.providerPaymentId())).isEqualTo(PaymentStatus.FAILED);
        assertThatThrownBy(() -> provider.setDevelopmentStatus("unknown", PaymentStatus.PAID))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
