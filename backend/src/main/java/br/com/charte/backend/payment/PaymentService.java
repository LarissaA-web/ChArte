package br.com.charte.backend.payment;

import java.math.BigDecimal;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
@Profile("dev & !prod")
public class PaymentService {
    private final JdbcTemplate jdbc;
    private final PaymentProvider provider;
    private final String devToken;
    private final boolean simulationEnabled;

    public PaymentService(JdbcTemplate jdbc, PaymentProvider provider,
                          @Value("${charte.payment.dev.simulation-token:}") String devToken,
                          @Value("${charte.payment.dev.simulation-enabled:false}") boolean simulationEnabled) {
        this.jdbc = jdbc; this.provider = provider; this.devToken = devToken; this.simulationEnabled = simulationEnabled;
    }

    @Transactional
    public PaymentApi.CheckoutResponse checkout(PaymentApi.CheckoutRequest request, String authId) {
        requireSchema();
        Long customerId = customerId(authId);
        Order order;
        try {
            order = jdbc.queryForObject("select id_cliente, valor_total, status_pedido from public.pedidos_principal where id_pedido = ? for update",
                    (rs, row) -> new Order(rs.getLong("id_cliente"), rs.getBigDecimal("valor_total"), rs.getString("status_pedido")), request.orderId());
        } catch (EmptyResultDataAccessException ex) { throw new ResponseStatusException(HttpStatus.NOT_FOUND); }
        if (order.customerId() != customerId) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (!"Pendente".equals(order.status())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Pedido não está disponível para pagamento");
        if (order.amount() == null || order.amount().signum() <= 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Pedido sem valor válido");

        var found = jdbc.query("select gateway_payment_id, checkout_url, status_pagamento from public.pagamentos where id_pedido = ? order by id_pagamento desc limit 1 for update",
                (rs, row) -> new Payment(rs.getString(1), rs.getString(2), rs.getString(3)), request.orderId());
        if (!found.isEmpty()) {
            Payment p = found.getFirst();
            return new PaymentApi.CheckoutResponse(p.id(), p.url(), apiStatus(p.status()));
        }

        var checkout = provider.createCheckout("order_" + request.orderId(), order.amount(), request.method());
        String id = checkout.providerPaymentId();
        String method = switch (request.method()) {
            case PIX -> "Pix";
            case CARD -> "Cartão de Crédito";
            case TRANSFER -> "Transferência bancária";
        };
        jdbc.update("insert into public.pagamentos (id_pedido, metodo, status_pagamento, gateway_payment_id, checkout_url, gateway_status) values (?, ?, 'Pendente', ?, ?, 'simulated_pending')",
                request.orderId(), method, id, checkout.checkoutUrl().toString());
        return new PaymentApi.CheckoutResponse(id, checkout.checkoutUrl().toString(), "pending");
    }

    @Transactional(readOnly = true)
    public PaymentApi.StatusResponse status(String id, String authId) {
        requireSchema();
        Payment p = payment(id);
        if (!ownsOrder(p.orderId(), authId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return new PaymentApi.StatusResponse(id, apiStatus(p.status()));
    }

    @Transactional
    public PaymentApi.StatusResponse simulate(String id, PaymentStatus status, String token, String authId) {
        if (!simulationEnabled || devToken.isBlank() || token == null || !java.security.MessageDigest.isEqual(devToken.getBytes(java.nio.charset.StandardCharsets.UTF_8), token.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        // Never write `Pago` for a mock: catalog visibility or an apparently absent trigger
        // cannot prove that the update is financially harmless.
        if (status == PaymentStatus.PAID) {
            boolean triggerFound;
            try { triggerFound = financialTriggerPresent(); }
            catch (RuntimeException ex) { triggerFound = true; }
            String detail = triggerFound
                    ? "Trigger fn_criar_comissao detectado ou catálogo indisponível."
                    : "Ausência no catálogo não comprova ausência de efeitos financeiros.";
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Simulação paid desabilitada nesta etapa. " + detail);
        }
        Payment p = payment(id);
        if (!ownsOrder(p.orderId(), authId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        String dbStatus = switch (status) { case PENDING -> "Pendente"; case PAID -> "Pago"; case FAILED -> "Cancelado"; };
        jdbc.update("update public.pagamentos set status_pagamento = ?, gateway_status = ? where gateway_payment_id = ?",
                dbStatus, "simulated_" + status.name().toLowerCase(Locale.ROOT), id);
        if (provider instanceof MockPaymentProvider mock) mock.setDevelopmentStatus(id, status);
        return new PaymentApi.StatusResponse(id, apiStatus(dbStatus));
    }

    private Payment payment(String id) {
        try { return jdbc.queryForObject("select id_pedido, status_pagamento from public.pagamentos where gateway_payment_id = ?",
                (rs, row) -> new Payment(id, null, rs.getString("status_pagamento"), rs.getLong("id_pedido")), id); }
        catch (EmptyResultDataAccessException ex) { throw new ResponseStatusException(HttpStatus.NOT_FOUND); }
    }
    private Long customerId(String authId) {
        try { return jdbc.queryForObject("select id_usuario from public.usuario where id_auth = ?::uuid", Long.class, authId); }
        catch (EmptyResultDataAccessException ex) { throw new ResponseStatusException(HttpStatus.FORBIDDEN); }
    }
    private boolean ownsOrder(long orderId, String authId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from public.pedidos_principal p join public.usuario u on u.id_usuario=p.id_cliente where p.id_pedido=? and u.id_auth=?::uuid)", Boolean.class, orderId, authId));
    }
    private String apiStatus(String status) {
        return switch (status) { case "Pago" -> "paid"; case "Cancelado", "Reembolso", "Falhou" -> "failed"; default -> "pending"; };
    }
    private void requireSchema() {
        Boolean ok = jdbc.queryForObject("select count(*) = 7 from information_schema.columns where table_schema='public' and table_name='pagamentos' and column_name in ('id_pagamento','id_pedido','metodo','status_pagamento','gateway_payment_id','checkout_url','gateway_status')", Boolean.class);
        if (!Boolean.TRUE.equals(ok)) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Esquema da tabela pagamentos incompatível");
    }
    private boolean financialTriggerPresent() {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists (select 1 from pg_trigger t join pg_proc f on f.oid=t.tgfoid where not t.tgisinternal and f.proname='fn_criar_comissao')", Boolean.class));
    }
    private record Order(long customerId, BigDecimal amount, String status) {}
    private record Payment(String id, String url, String status, long orderId) {
        Payment(String id, String url, String status) { this(id, url, status, -1); }
    }
}
