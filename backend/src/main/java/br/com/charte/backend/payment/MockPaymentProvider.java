package br.com.charte.backend.payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

@Component
@ConditionalOnProperty(name = "charte.payment.provider", havingValue = "mock", matchIfMissing = true)
public class MockPaymentProvider implements PaymentProvider {
    private final Map<String, PaymentStatus> statuses = new ConcurrentHashMap<>();
    private final String checkoutBaseUrl;

    public MockPaymentProvider(@Value("${charte.payment.mock-checkout-base-url:http://localhost:4200/checkout}") String checkoutBaseUrl) {
        this.checkoutBaseUrl = checkoutBaseUrl;
    }

    @Override
    public CheckoutResult createCheckout(Long orderId, BigDecimal amount, PaymentMethod method) {
        String paymentId = "pay_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        statuses.put(paymentId, PaymentStatus.PENDING);

        String shortHash = paymentId.substring(4, 12).toUpperCase(Locale.ROOT);
        String pixCode = String.format(
                Locale.US,
                "00020126580014BR.GOV.BCB.PIX0136CHARTE-SIM-%d-%s5204000053039865406%.2f5802BR5913CHARTE ARTES6009SAO PAULO62070503***6304%s",
                orderId,
                shortHash,
                amount != null ? amount : BigDecimal.ZERO,
                shortHash.substring(0, 4)
        );

        String url = UriComponentsBuilder.fromUriString(checkoutBaseUrl)
                .queryParam("paymentId", paymentId)
                .queryParam("orderId", orderId)
                .queryParam("amount", amount)
                .queryParam("method", method.name())
                .toUriString();
        return new CheckoutResult(paymentId, url, PaymentStatus.PENDING, pixCode);
    }

    @Override
    public PaymentStatus simulateStatus(String paymentId, PaymentStatus targetStatus) {
        statuses.put(paymentId, targetStatus);
        return targetStatus;
    }

    @Override
    public SimulationResult evaluateSimulation(String paymentId, SimulatedPaymentInput input) {
        statuses.put(paymentId, PaymentStatus.PROCESSING);

        if (input == null) {
            statuses.put(paymentId, PaymentStatus.APPROVED);
            return new SimulationResult(
                    paymentId,
                    PaymentStatus.APPROVED,
                    "Pagamento simulado aprovado com sucesso.",
                    Instant.now()
            );
        }

        String requestedOutcome = input.simulateOutcome() != null
                ? input.simulateOutcome().trim().toUpperCase(Locale.ROOT)
                : "";

        if ("DECLINED".equals(requestedOutcome) || "FAILED".equals(requestedOutcome) || "RECUSADO".equals(requestedOutcome)) {
            statuses.put(paymentId, PaymentStatus.DECLINED);
            return new SimulationResult(
                    paymentId,
                    PaymentStatus.DECLINED,
                    "Transação recusada pela simulação financeira (cenário de recusa selecionado).",
                    Instant.now()
            );
        }

        PaymentMethod method = input.method() != null ? input.method() : PaymentMethod.PIX;

        if (method == PaymentMethod.CARTAO) {
            String last4 = input.cardLast4() != null ? input.cardLast4().trim() : "";
            String holder = input.cardHolderName() != null ? input.cardHolderName().trim().toUpperCase(Locale.ROOT) : "";

            if ("0000".equals(last4) || "9999".equals(last4)
                    || holder.contains("RECUSADO") || holder.contains("DECLINED") || holder.contains("SEM SALDO")) {
                statuses.put(paymentId, PaymentStatus.DECLINED);
                return new SimulationResult(
                        paymentId,
                        PaymentStatus.DECLINED,
                        "Cartão de crédito simulado recusado pela operadora (final " + (last4.isEmpty() ? "****" : last4) + ").",
                        Instant.now()
                );
            }

            int parcelas = (input.installments() != null && input.installments() > 0) ? input.installments() : 1;
            String bandeira = (input.cardBrand() != null && !input.cardBrand().isBlank()) ? input.cardBrand() : "ChArte Card";
            String sufixoCartao = last4.isEmpty() ? "4242" : last4;
            statuses.put(paymentId, PaymentStatus.APPROVED);
            return new SimulationResult(
                    paymentId,
                    PaymentStatus.APPROVED,
                    String.format("Pagamento via Cartão Simulado (%s final %s em %dx) aprovado.", bandeira, sufixoCartao, parcelas),
                    Instant.now()
            );
        }

        if (method == PaymentMethod.PIX) {
            String pixCode = input.pixCode() != null ? input.pixCode().trim().toUpperCase(Locale.ROOT) : "";
            if (pixCode.contains("INVALID") || pixCode.contains("EXPIRADO")) {
                statuses.put(paymentId, PaymentStatus.DECLINED);
                return new SimulationResult(
                        paymentId,
                        PaymentStatus.DECLINED,
                        "Código PIX simulado inválido ou expirado.",
                        Instant.now()
                );
            }
            statuses.put(paymentId, PaymentStatus.APPROVED);
            return new SimulationResult(
                    paymentId,
                    PaymentStatus.APPROVED,
                    "Pagamento via PIX Simulado confirmado instantaneamente.",
                    Instant.now()
            );
        }

        statuses.put(paymentId, PaymentStatus.APPROVED);
        return new SimulationResult(
                paymentId,
                PaymentStatus.APPROVED,
                "Transferência/Boleto simulado compensado com sucesso.",
                Instant.now()
        );
    }
}
