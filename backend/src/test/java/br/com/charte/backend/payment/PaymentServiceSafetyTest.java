package br.com.charte.backend.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.charte.backend.testsupport.InMemoryCharteJdbcTemplate;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PaymentServiceSafetyTest {
    private InMemoryCharteJdbcTemplate jdbcTemplate;
    private PaymentService service;

    @BeforeEach
    void setup() {
        jdbcTemplate = new InMemoryCharteJdbcTemplate();
        jdbcTemplate.addUser(1L, "auth_u1", "cliente1", "Cliente Um", false);
        jdbcTemplate.addUser(2L, "auth_u2", "artista2", "Artista Dois", true);
        jdbcTemplate.addUser(3L, "auth_u3", "intruso3", "Intruso Tres", false);
        jdbcTemplate.addOrder(100L, 1L, 2L, new BigDecimal("150.00"), "Pendente", "Retrato Digital");

        PaymentProvider provider = new MockPaymentProvider("http://localhost:4200/checkout");
        service = new PaymentService(jdbcTemplate, provider, "segredo-dev");
    }

    @Test
    void deveReaproveitarCheckoutPendenteNoMesmoPedido() {
        PaymentService.PaymentView first = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );
        PaymentService.PaymentView second = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );

        assertEquals(first.paymentId(), second.paymentId());
        assertEquals("PENDING", second.status());
        assertNotNull(second.pixCode());
        assertEquals(1, jdbcTemplate.countPayments());
    }

    @Test
    void deveProcessarPagamentoSimuladoAprovadoEAtualizarPedido() {
        PaymentService.PaymentView checkout = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );

        PaymentService.PaymentView processed = service.processSimulatedPayment(
                checkout.paymentId(),
                new PaymentService.ProcessPaymentRequest("PIX", null, null, null, 1, checkout.pixCode(), "APPROVED"),
                "auth_u1"
        );

        assertEquals("APPROVED", processed.status());
        assertEquals("Pago", processed.dbStatus());
        assertEquals("Em andamento", processed.orderStatus());
        assertEquals(new BigDecimal("150.00"), processed.amount());
    }

    @Test
    void deveProcessarPagamentoSimuladoRecusadoEPermitirNovaTentativa() {
        PaymentService.PaymentView checkout = service.checkout(
                new PaymentService.CheckoutRequest(100L, "Cartao"),
                "auth_u1"
        );

        PaymentService.PaymentView declined = service.processSimulatedPayment(
                checkout.paymentId(),
                new PaymentService.ProcessPaymentRequest("Cartao", "CLIENTE RECUSADO", "0000", "ChArte Card", 1, null, null),
                "auth_u1"
        );

        assertEquals("DECLINED", declined.status());
        assertEquals("Cancelado", declined.dbStatus());
        assertEquals("Pendente", declined.orderStatus());

        PaymentService.PaymentView retryCheckout = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );
        assertEquals("PENDING", retryCheckout.status());
    }

    @Test
    void deveImpedirPagamentoDuplicadoDePedidoJaPago() {
        PaymentService.PaymentView checkout = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );
        service.processSimulatedPayment(
                checkout.paymentId(),
                new PaymentService.ProcessPaymentRequest("PIX", null, null, null, 1, checkout.pixCode(), "APPROVED"),
                "auth_u1"
        );

        ResponseStatusException duplicateCheckout = assertThrows(
                ResponseStatusException.class,
                () -> service.checkout(new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1")
        );
        assertEquals(409, duplicateCheckout.getStatusCode().value());

        ResponseStatusException duplicateProcess = assertThrows(
                ResponseStatusException.class,
                () -> service.processSimulatedPayment(
                        checkout.paymentId(),
                        new PaymentService.ProcessPaymentRequest("PIX", null, null, null, 1, null, "APPROVED"),
                        "auth_u1"
                )
        );
        assertEquals(409, duplicateProcess.getStatusCode().value());
    }

    @Test
    void deveRetornar404AoTentarPagarPedidoInexistente() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> service.checkout(new PaymentService.CheckoutRequest(99999L, "PIX"), "auth_u1")
        );
        assertEquals(404, ex.getStatusCode().value());
    }

    @Test
    void deveRetornar401QuandoUsuarioNaoAutenticado() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> service.checkout(new PaymentService.CheckoutRequest(100L, "PIX"), "")
        );
        assertEquals(401, ex.getStatusCode().value());
    }

    @Test
    void deveBloquearManipulacaoDePagamentoPorOutroUsuario() {
        PaymentService.PaymentView created = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );

        ResponseStatusException viewByIntruder = assertThrows(
                ResponseStatusException.class,
                () -> service.findByPaymentId(created.paymentId(), "auth_u3")
        );
        assertEquals(403, viewByIntruder.getStatusCode().value());

        ResponseStatusException processByIntruder = assertThrows(
                ResponseStatusException.class,
                () -> service.processSimulatedPayment(
                        created.paymentId(),
                        new PaymentService.ProcessPaymentRequest("PIX", null, null, null, 1, null, "APPROVED"),
                        "auth_u3"
                )
        );
        assertEquals(403, processByIntruder.getStatusCode().value());
    }

    @Test
    void deveListarHistoricoDoClienteEVendasDoArtista() {
        PaymentService.PaymentView created = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );
        service.processSimulatedPayment(
                created.paymentId(),
                new PaymentService.ProcessPaymentRequest("PIX", null, null, null, 1, created.pixCode(), "APPROVED"),
                "auth_u1"
        );

        List<PaymentService.PaymentView> customerHistory = service.listCustomerPayments("auth_u1");
        assertEquals(1, customerHistory.size());
        assertEquals("APPROVED", customerHistory.get(0).status());

        List<PaymentService.PaymentView> artistSales = service.listArtistSales("auth_u2");
        assertEquals(1, artistSales.size());
        assertEquals("Cliente Um", artistSales.get(0).clientName());
        assertTrue(artistSales.get(0).amount().compareTo(new BigDecimal("150.00")) == 0);
    }

    @Test
    void deveBloquearSimulacaoComTokenInvalidoEPermitirComTokenValido() {
        PaymentService.PaymentView created = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"),
                "auth_u1"
        );

        ResponseStatusException invalidTokenEx = assertThrows(
                ResponseStatusException.class,
                () -> service.simulate(created.paymentId(), "APPROVED", "token-errado", "auth_u1")
        );
        assertEquals(403, invalidTokenEx.getStatusCode().value());

        PaymentService.PaymentView approved = service.simulate(created.paymentId(), "APPROVED", "segredo-dev", "auth_u1");
        assertEquals("APPROVED", approved.status());
        assertEquals("Pago", approved.dbStatus());
    }
}
