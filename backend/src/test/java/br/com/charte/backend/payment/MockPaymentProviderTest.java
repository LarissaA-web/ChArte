package br.com.charte.backend.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MockPaymentProviderTest {

    @Test
    void deveCriarCheckoutPendenteComDadosEsperadosECodigoPixSimulado() {
        MockPaymentProvider provider = new MockPaymentProvider("http://localhost:4200/checkout");

        PaymentProvider.CheckoutResult result = provider.createCheckout(
                10L,
                new BigDecimal("199.90"),
                PaymentMethod.PIX
        );

        assertTrue(result.paymentId().startsWith("pay_"));
        assertEquals(PaymentStatus.PENDING, result.status());
        assertNotNull(result.pixCode());
        assertTrue(result.pixCode().contains("CHARTE-SIM-10-"));
        assertTrue(result.checkoutUrl().contains("paymentId=" + result.paymentId()));
        assertTrue(result.checkoutUrl().contains("orderId=10"));
        assertTrue(result.checkoutUrl().contains("method=PIX"));
    }

    @Test
    void deveSimularPagamentoAprovadoERecusadoNoBackend() {
        MockPaymentProvider provider = new MockPaymentProvider("http://localhost:4200/checkout");
        PaymentProvider.CheckoutResult created = provider.createCheckout(15L, new BigDecimal("85.00"), PaymentMethod.CARTAO);

        PaymentProvider.SimulationResult approved = provider.evaluateSimulation(
                created.paymentId(),
                new PaymentProvider.SimulatedPaymentInput(
                        PaymentMethod.CARTAO,
                        "MARIA SILVA",
                        "4242",
                        "ChArte Card",
                        2,
                        null,
                        "APPROVED"
                )
        );
        assertEquals(PaymentStatus.APPROVED, approved.status());

        PaymentProvider.SimulationResult declinedByCard = provider.evaluateSimulation(
                created.paymentId(),
                new PaymentProvider.SimulatedPaymentInput(
                        PaymentMethod.CARTAO,
                        "JOAO TESTE",
                        "0000",
                        "ChArte Card",
                        1,
                        null,
                        null
                )
        );
        assertEquals(PaymentStatus.DECLINED, declinedByCard.status());
    }
}
