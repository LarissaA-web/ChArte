package br.com.charte.backend.payment;

import java.math.BigDecimal;
import java.time.Instant;

public interface PaymentProvider {

    record CheckoutResult(String paymentId, String checkoutUrl, PaymentStatus status, String pixCode) {
        public CheckoutResult(String paymentId, String checkoutUrl, PaymentStatus status) {
            this(paymentId, checkoutUrl, status, null);
        }
    }

    record SimulatedPaymentInput(
            PaymentMethod method,
            String cardHolderName,
            String cardLast4,
            String cardBrand,
            Integer installments,
            String pixCode,
            String simulateOutcome
    ) {}

    record SimulationResult(
            String paymentId,
            PaymentStatus status,
            String details,
            Instant processedAt
    ) {}

    CheckoutResult createCheckout(Long orderId, BigDecimal amount, PaymentMethod method);

    PaymentStatus simulateStatus(String paymentId, PaymentStatus targetStatus);

    default SimulationResult evaluateSimulation(String paymentId, SimulatedPaymentInput input) {
        PaymentStatus outcome = simulateStatus(paymentId, PaymentStatus.APPROVED);
        return new SimulationResult(paymentId, outcome, "Simulação processada internamente", Instant.now());
    }
}
