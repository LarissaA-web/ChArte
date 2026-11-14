package br.com.charte.backend.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import br.com.charte.backend.common.RequestCorrelationFilter;
import br.com.charte.backend.testsupport.InMemoryCharteJdbcTemplate;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
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
        assertEquals(1L, jdbcTemplate.latestPayment().idCliente);
        assertEquals(2L, jdbcTemplate.latestPayment().idArtista);
        assertEquals(new BigDecimal("150.00"), jdbcTemplate.latestPayment().valor);
        assertEquals(new BigDecimal("150.00"), first.amount());
    }

    @Test
    void registraEtapasDeCheckoutComCorrelacaoSemRegistrarIdentidadeOuParametros() {
        Logger logger = (Logger) LoggerFactory.getLogger(PaymentService.class);
        Level previousLevel = logger.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.setLevel(Level.INFO);
        logger.addAppender(appender);
        MDC.put(RequestCorrelationFilter.MDC_KEY, "checkout-test-id");

        try {
            service.checkout(new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1");

            String events = appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .reduce("", (all, event) -> all + "\n" + event);
            assertTrue(events.contains("request_id=checkout-test-id"));
            assertTrue(events.contains("stage=authenticated_user_lookup outcome=start"));
            assertTrue(events.contains("stage=order_lookup outcome=success"));
            assertTrue(events.contains("stage=approved_payment_check outcome=success"));
            assertTrue(events.contains("stage=latest_pending_payment_lookup outcome=no_rows"));
            assertTrue(events.contains("stage=payment_insert outcome=success"));
            assertTrue(events.contains("stage=completion outcome=created"));
            assertFalse(events.contains("auth_u1"));
            assertFalse(events.contains("Cliente Um"));
        } finally {
            MDC.remove(RequestCorrelationFilter.MDC_KEY);
            logger.detachAppender(appender);
            logger.setLevel(previousLevel);
            appender.stop();
        }
    }

    @Test
    void resolveUuidAuthParaIdUsuarioEAutorizaSomenteClienteDoPedido() {
        String authId = "f33df301-8ec7-44ab-b85c-e643251edb73";
        jdbcTemplate.addUser(8L, authId, "Morgana84", "Morgana", false);
        jdbcTemplate.addUser(9L, "auth_artist_9", "artista9", "Artista Nove", true);
        jdbcTemplate.addOrder(33L, 8L, 9L, new BigDecimal("150.00"), "Pendente", "Arte de teste local");

        PaymentService.PaymentView checkout = service.checkout(
                new PaymentService.CheckoutRequest(33L, "PIX"), authId);

        assertEquals(33L, checkout.orderId());
        assertEquals(8L, jdbcTemplate.latestPayment().idCliente);
        assertEquals(1, service.listCustomerPayments(authId).size());
    }

    @Test
    void bloqueiaNoBackendContaComMenosDeDezesseisAnos() {
        String authId = "auth_underage";
        jdbcTemplate.addUser(8L, authId, "menor", "Conta menor", false);
        jdbcTemplate.setBirthDate(8L, LocalDate.now().minusYears(15));
        jdbcTemplate.addUser(9L, "auth_artist_9", "artista9", "Artista Nove", true);
        jdbcTemplate.addOrder(33L, 8L, 9L, new BigDecimal("150.00"), "Pendente", "Pedido local");

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.checkout(new PaymentService.CheckoutRequest(33L, "PIX"), authId));

        assertEquals(403, error.getStatusCode().value());
        assertEquals(0, jdbcTemplate.countPayments());
    }

    @Test
    void naoDeveRetornarSucessoQuandoInsercaoDoPagamentoFalha() {
        jdbcTemplate.failPaymentInsert(true);

        assertThrows(
                org.springframework.dao.DataAccessResourceFailureException.class,
                () -> service.checkout(new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1")
        );
        assertEquals(0, jdbcTemplate.countPayments());
    }

    @Test
    void checkoutConcorrenteDoMesmoPedidoReaproveitaUmaUnicaLinha() throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> service.checkout(
                    new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1"));
            var second = executor.submit(() -> service.checkout(
                    new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1"));
            assertEquals(first.get().paymentId(), second.get().paymentId());
            assertEquals(1, jdbcTemplate.countPayments());
        }
    }

    @Test
    void coincidenciaEntreIdArtistaEIdUsuarioNaoAutorizaAcessoFinanceiro() {
        jdbcTemplate.addUser(4L, "auth_artist_owner", "artista-real", "Artista Real", true);
        jdbcTemplate.associateArtistUser(2L, 4L);
        service.checkout(new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1");

        ResponseStatusException orderPaymentsDenied = assertThrows(
                ResponseStatusException.class,
                () -> service.listOrderPayments(100L, "auth_u2")
        );
        assertEquals(403, orderPaymentsDenied.getStatusCode().value());
        assertTrue(service.listArtistSales("auth_u2").isEmpty());
        assertEquals(1, service.listArtistSales("auth_artist_owner").size());
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
        assertEquals(new BigDecimal("0.08"), jdbcTemplate.latestPayment().taxaPercentual);
        assertEquals(new BigDecimal("12.00"), jdbcTemplate.latestPayment().taxaPlataforma);
        assertEquals(new BigDecimal("138.00"), jdbcTemplate.latestPayment().valorArtista);
        assertEquals(1, jdbcTemplate.countRetentionMovements());
        assertEquals(1L, jdbcTemplate.latestRetentionMovement().idCliente);
        assertEquals(2L, jdbcTemplate.latestRetentionMovement().idArtista);
        assertEquals(new BigDecimal("138.00"), jdbcTemplate.latestRetentionMovement().valor);
    }

    @Test
    void aprovacaoRepetidaRegistraUmaUnicaMovimentacaoDeRetencao() {
        PaymentService.PaymentView checkout = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1");
        service.simulate(checkout.paymentId(), "APPROVED", "segredo-dev", "auth_u1");
        service.simulate(checkout.paymentId(), "APPROVED", "segredo-dev", "auth_u1");

        assertEquals(new BigDecimal("0.08"), jdbcTemplate.latestPayment().taxaPercentual);
        assertEquals(new BigDecimal("12.00"), jdbcTemplate.latestPayment().taxaPlataforma);
        assertEquals(new BigDecimal("138.00"), jdbcTemplate.latestPayment().valorArtista);
        assertEquals(1, jdbcTemplate.countRetentionMovements());
    }

    @Test
    void falhaAoRegistrarRetencaoEPropagada() {
        PaymentService.PaymentView checkout = service.checkout(
                new PaymentService.CheckoutRequest(100L, "PIX"), "auth_u1");
        jdbcTemplate.failMovementInsert(true);

        assertThrows(
                org.springframework.dao.DataAccessResourceFailureException.class,
                () -> service.processSimulatedPayment(
                        checkout.paymentId(),
                        new PaymentService.ProcessPaymentRequest("PIX", null, null, null, 1, null, "APPROVED"),
                        "auth_u1")
        );
        assertEquals(0, jdbcTemplate.countRetentionMovements());
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
