package br.com.charte.backend.payment;

import br.com.charte.backend.common.MinimumAge;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PaymentService {
    private static final BigDecimal PLATFORM_FEE_RATE = new BigDecimal("0.08");
    private static final int MONEY_SCALE = 2;
    private static final ConcurrentHashMap<Long, ReentrantLock> CHECKOUT_LOCKS = new ConcurrentHashMap<>();

    private final JdbcTemplate jdbcTemplate;
    private final PaymentProvider paymentProvider;
    private final String confirmToken;

    public PaymentService(
            JdbcTemplate jdbcTemplate,
            PaymentProvider paymentProvider,
            @Value("${charte.payment.dev-confirm-token}") String confirmToken
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.paymentProvider = paymentProvider;
        this.confirmToken = confirmToken;
    }

    public record CheckoutRequest(Long orderId, String method) {}

    public record ProcessPaymentRequest(
            String method,
            String cardHolderName,
            String cardLast4,
            String cardBrand,
            Integer installments,
            String pixCode,
            String simulateOutcome
    ) {}

    public record PaymentView(
            String paymentId,
            Long orderId,
            String method,
            String status,
            String dbStatus,
            BigDecimal amount,
            String checkoutUrl,
            String pixCode,
            String simulationDetails,
            String paymentDate,
            String orderStatus,
            String orderTitle,
            String clientName,
            String artistName
    ) {
        public PaymentView(
                String paymentId,
                Long orderId,
                String method,
                String status,
                BigDecimal amount,
                String checkoutUrl
        ) {
            this(paymentId, orderId, method, status, mapDbStatus(status), amount, checkoutUrl, null, null, null, null, null, null, null);
        }

        private static String mapDbStatus(String rawStatus) {
            try {
                return PaymentStatus.fromInput(rawStatus).dbStatus();
            } catch (Exception e) {
                return "Pendente";
            }
        }
    }

    private record OrderRow(
            Long idPedido,
            Long idCliente,
            Long idArtista,
            Long idUsuarioArtista,
            BigDecimal valorTotal,
            String statusPedido,
            String statusComissao,
            String titulo,
            String nomeCliente,
            String nomeArtista
    ) {}

    private record PaymentAccountingRow(
            Long paymentId,
            Long clientId,
            Long artistId,
            BigDecimal amount,
            BigDecimal artistAmount
    ) {}

    @Transactional
    public PaymentView checkout(CheckoutRequest request, String authId) {
        if (request == null || request.orderId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "orderId é obrigatório");
        }
        Long userId = findUserIdByAuthId(authId);
        OrderRow order = findOrderForClientOrThrow(request.orderId(), userId);

        ReentrantLock processLock = CHECKOUT_LOCKS.computeIfAbsent(order.idPedido(), ignored -> new ReentrantLock());
        processLock.lock();
        try {
            // The DB lock makes idempotency reliable across Render instances and restarts.
            if (jdbcTemplate.getDataSource() != null) {
                jdbcTemplate.execute("SELECT pg_advisory_xact_lock(" + (7_300_000_000L + order.idPedido()) + ")");
            }
            return checkoutLocked(request, order);
        } finally {
            processLock.unlock();
            if (!processLock.hasQueuedThreads()) CHECKOUT_LOCKS.remove(order.idPedido(), processLock);
        }
    }

    private PaymentView checkoutLocked(CheckoutRequest request, OrderRow order) {

        if ("Cancelado".equalsIgnoreCase(order.statusPedido()) || "Cancelada".equalsIgnoreCase(order.statusComissao())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Não é possível iniciar pagamento para um pedido cancelado");
        }

        if (order.idCliente() == null || order.idArtista() == null || order.valorTotal() == null
                || order.valorTotal().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O pedido não possui cliente, artista ou valor válido para pagamento");
        }

        if (hasApprovedPayment(order.idPedido())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pedido já foi pago anteriormente");
        }

        PaymentMethod method;
        try {
            method = PaymentMethod.fromInput(request.method());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
        }

        PaymentView pending = findLatestPendingByOrder(order.idPedido());
        if (pending != null) {
            if (!pending.method().equalsIgnoreCase(method.dbValue()) && !pending.method().equalsIgnoreCase(method.name())) {
                updatePaymentMethod(pending.paymentId(), method);
                return enrichWithOrderDetails(findByPaymentIdInternal(pending.paymentId()), order);
            }
            return enrichWithOrderDetails(pending, order);
        }

        PaymentProvider.CheckoutResult created = paymentProvider.createCheckout(order.idPedido(), order.valorTotal(), method);
        insertPaymentRecord(order, method, created);

        return enrichWithOrderDetails(
                new PaymentView(
                        created.paymentId(),
                        order.idPedido(),
                        method.dbValue(),
                        created.status().canonicalName(),
                        created.status().dbStatus(),
                        order.valorTotal(),
                        created.checkoutUrl(),
                        created.pixCode(),
                        "Checkout iniciado. Aguardando confirmação do pagamento simulado.",
                        LocalDate.now().toString(),
                        order.statusComissao(),
                        order.titulo(),
                        order.nomeCliente(),
                        order.nomeArtista()
                ),
                order
        );
    }

    @Transactional
    public PaymentView processSimulatedPayment(String paymentId, ProcessPaymentRequest request, String authId) {
        Long userId = findUserIdByAuthId(authId);
        PaymentView current = findByPaymentIdInternal(paymentId);
        OrderRow order = findOrderForClientOrThrow(current.orderId(), userId);
        lockPaymentRow(paymentId);
        current = findByPaymentIdInternal(paymentId);

        PaymentStatus currentStatus = parseStatusSafe(current.status());
        if (currentStatus.isApproved()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pagamento já foi aprovado");
        }
        if (currentStatus == PaymentStatus.REFUNDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pagamento já foi reembolsado");
        }
        if (hasApprovedPayment(order.idPedido())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pedido já possui um pagamento aprovado");
        }

        PaymentMethod effectiveMethod = request != null && request.method() != null && !request.method().isBlank()
                ? PaymentMethod.fromInput(request.method())
                : PaymentMethod.fromInput(current.method());

        if (effectiveMethod == PaymentMethod.CARTAO && request != null) {
            String holder = request.cardHolderName() != null ? request.cardHolderName().trim() : "";
            String last4 = request.cardLast4() != null ? request.cardLast4().trim() : "";
            if (holder.length() < 3) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o nome do titular do cartão simulado");
            }
            if (!last4.matches("\\d{4}")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe os 4 últimos dígitos do cartão simulado");
            }
        }

        updatePaymentMethod(paymentId, effectiveMethod);
        updatePaymentStatusInDb(paymentId, PaymentStatus.PROCESSING);

        PaymentProvider.SimulatedPaymentInput simulationInput = new PaymentProvider.SimulatedPaymentInput(
                effectiveMethod,
                request != null ? request.cardHolderName() : null,
                request != null ? request.cardLast4() : null,
                request != null ? request.cardBrand() : null,
                request != null ? request.installments() : 1,
                request != null && request.pixCode() != null ? request.pixCode() : current.pixCode(),
                request != null ? request.simulateOutcome() : null
        );

        PaymentProvider.SimulationResult result = paymentProvider.evaluateSimulation(paymentId, simulationInput);
        PaymentStatus finalStatus = result.status();

        updatePaymentStatusInDb(paymentId, finalStatus);
        updateOrderStateAfterPayment(order, finalStatus);
        if (finalStatus.isApproved() && isReadyArtAcquisition(order)) {
            ensureArtistReleaseMovement(findPaymentAccountingRowForUpdate(paymentId));
        }

        OrderRow updatedOrder = findOrderByIdOrThrow(order.idPedido());
        PaymentView updatedPayment = findByPaymentIdInternal(paymentId);
        if (parseStatusSafe(updatedPayment.status()) != finalStatus) {
            throw new DataAccessResourceFailureException("O Supabase não confirmou o status final do pagamento.");
        }
        if (finalStatus.isApproved() && !"Entregue".equalsIgnoreCase(updatedOrder.statusPedido())
                && !"Finalizada".equalsIgnoreCase(updatedOrder.statusComissao())
                && !"Em andamento".equalsIgnoreCase(updatedOrder.statusComissao())) {
            throw new DataAccessResourceFailureException("O Supabase não confirmou a transição do pedido após o pagamento.");
        }
        return new PaymentView(
                updatedPayment.paymentId(),
                updatedPayment.orderId(),
                updatedPayment.method(),
                finalStatus.canonicalName(),
                finalStatus.dbStatus(),
                updatedPayment.amount(),
                updatedPayment.checkoutUrl(),
                updatedPayment.pixCode(),
                result.details(),
                updatedPayment.paymentDate(),
                updatedOrder.statusComissao(),
                updatedOrder.titulo(),
                updatedOrder.nomeCliente(),
                updatedOrder.nomeArtista()
        );
    }

    @Transactional
    public PaymentView cancelPayment(String paymentId, String authId) {
        Long userId = findUserIdByAuthId(authId);
        PaymentView current = findByPaymentIdInternal(paymentId);
        OrderRow order = findOrderForClientOrThrow(current.orderId(), userId);

        PaymentStatus currentStatus = parseStatusSafe(current.status());
        if (currentStatus.isApproved()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Pagamento aprovado não pode ser cancelado diretamente; solicite reembolso");
        }

        PaymentStatus updated = paymentProvider.simulateStatus(paymentId, PaymentStatus.CANCELLED);
        updatePaymentStatusInDb(paymentId, updated);

        OrderRow updatedOrder = findOrderByIdOrThrow(order.idPedido());
        return enrichWithOrderDetails(findByPaymentIdInternal(paymentId), updatedOrder);
    }

    @Transactional
    public PaymentView refundPayment(String paymentId, String authId) {
        Long userId = findUserIdByAuthId(authId);
        PaymentView current = findByPaymentIdInternal(paymentId);
        OrderRow order = findOrderForParticipantOrThrow(current.orderId(), userId);

        PaymentStatus currentStatus = parseStatusSafe(current.status());
        if (!currentStatus.isApproved()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Apenas pagamentos aprovados podem ser reembolsados");
        }

        PaymentStatus updated = paymentProvider.simulateStatus(paymentId, PaymentStatus.REFUNDED);
        updatePaymentStatusInDb(paymentId, updated);
        updateOrderStateAfterPayment(order, updated);
        if (updated.isApproved() && isReadyArtAcquisition(order)) {
            ensureArtistReleaseMovement(findPaymentAccountingRowForUpdate(paymentId));
        }

        OrderRow updatedOrder = findOrderByIdOrThrow(order.idPedido());
        return enrichWithOrderDetails(findByPaymentIdInternal(paymentId), updatedOrder);
    }

    public PaymentView findByPaymentId(String paymentId, String authId) {
        Long userId = findUserIdByAuthId(authId);
        PaymentView payment = findByPaymentIdInternal(paymentId);
        OrderRow order = findOrderForParticipantOrThrow(payment.orderId(), userId);
        return enrichWithOrderDetails(payment, order);
    }

    public PaymentView findLatestByOrderId(Long orderId, String authId) {
        Long userId = findUserIdByAuthId(authId);
        OrderRow order = findOrderForParticipantOrThrow(orderId, userId);
        try {
            PaymentView view = jdbcTemplate.queryForObject(
                    """
                    SELECT p.gateway_payment_id, p.id_pedido, p.valor, CAST(p.metodo AS VARCHAR) AS metodo,
                           p.gateway_status, CAST(p.status_pagamento AS VARCHAR) AS status_pagamento,
                           p.checkout_url
                    FROM public.pagamentos p
                    WHERE p.id_pedido = ? AND p.gateway_payment_id IS NOT NULL
                    ORDER BY p.id_pagamento DESC
                    LIMIT 1
                    """,
                    (rs, rowNum) -> mapRowToPaymentView(rs, order.valorTotal()),
                    orderId
            );
            return enrichWithOrderDetails(view, order);
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pagamento do pedido não encontrado");
        }
    }

    public List<PaymentView> listOrderPayments(Long orderId, String authId) {
        Long userId = findUserIdByAuthId(authId);
        OrderRow order = findOrderForParticipantOrThrow(orderId, userId);
        return jdbcTemplate.query(
                """
                SELECT p.gateway_payment_id, p.id_pedido, p.valor, CAST(p.metodo AS VARCHAR) AS metodo,
                       p.gateway_status, CAST(p.status_pagamento AS VARCHAR) AS status_pagamento,
                       p.checkout_url
                FROM public.pagamentos p
                WHERE p.id_pedido = ? AND p.gateway_payment_id IS NOT NULL
                ORDER BY p.id_pagamento DESC
                """,
                (rs, rowNum) -> enrichWithOrderDetails(mapRowToPaymentView(rs, order.valorTotal()), order),
                orderId
        );
    }

    public List<PaymentView> listCustomerPayments(String authId) {
        Long userId = findUserIdByAuthId(authId);
        return jdbcTemplate.query(
                """
                SELECT p.gateway_payment_id, p.id_pedido, p.valor, CAST(p.metodo AS VARCHAR) AS metodo,
                       p.gateway_status, CAST(p.status_pagamento AS VARCHAR) AS status_pagamento,
                       p.checkout_url,
                       COALESCE(ped.proposta_valor, ped.valor_total) AS pedido_valor,
                       COALESCE(CAST(ped.status_comissao AS VARCHAR), CAST(ped.status_pedido AS VARCHAR)) AS pedido_status,
                       ped.titulo AS pedido_titulo,
                       uc.nome AS nome_cliente,
                       COALESCE(a.nome_artistico, ua.nome) AS nome_artista
                FROM public.pagamentos p
                JOIN public.pedidos_principal ped ON ped.id_pedido = p.id_pedido
                LEFT JOIN public.usuario uc ON uc.id_usuario = ped.id_cliente
                LEFT JOIN public.artista a ON a.id_artista = ped.id_artista
                LEFT JOIN public.usuario ua ON ua.id_usuario = a.id_usuario
                WHERE ped.id_cliente = ? AND p.gateway_payment_id IS NOT NULL
                ORDER BY p.id_pagamento DESC
                """,
                (rs, rowNum) -> {
                    BigDecimal fallbackPrice = rs.getBigDecimal("pedido_valor");
                    PaymentView base = mapRowToPaymentView(rs, fallbackPrice);
                    return new PaymentView(
                            base.paymentId(),
                            base.orderId(),
                            base.method(),
                            base.status(),
                            base.dbStatus(),
                            base.amount(),
                            base.checkoutUrl(),
                            base.pixCode(),
                            base.simulationDetails(),
                            base.paymentDate(),
                            rs.getString("pedido_status"),
                            rs.getString("pedido_titulo"),
                            rs.getString("nome_cliente"),
                            rs.getString("nome_artista")
                    );
                },
                userId
        );
    }

    public List<PaymentView> listArtistSales(String authId) {
        Long userId = findUserIdByAuthId(authId);
        return jdbcTemplate.query(
                """
                SELECT p.gateway_payment_id, p.id_pedido, p.valor, CAST(p.metodo AS VARCHAR) AS metodo,
                       p.gateway_status, CAST(p.status_pagamento AS VARCHAR) AS status_pagamento,
                       p.checkout_url,
                       COALESCE(ped.proposta_valor, ped.valor_total) AS pedido_valor,
                       COALESCE(CAST(ped.status_comissao AS VARCHAR), CAST(ped.status_pedido AS VARCHAR)) AS pedido_status,
                       ped.titulo AS pedido_titulo,
                       uc.nome AS nome_cliente,
                       COALESCE(a.nome_artistico, ua.nome) AS nome_artista
                FROM public.pagamentos p
                JOIN public.pedidos_principal ped ON ped.id_pedido = p.id_pedido
                LEFT JOIN public.usuario uc ON uc.id_usuario = ped.id_cliente
                LEFT JOIN public.artista a ON a.id_artista = ped.id_artista
                LEFT JOIN public.usuario ua ON ua.id_usuario = a.id_usuario
                WHERE a.id_usuario = ? AND p.gateway_payment_id IS NOT NULL
                ORDER BY p.id_pagamento DESC
                """,
                (rs, rowNum) -> {
                    BigDecimal fallbackPrice = rs.getBigDecimal("pedido_valor");
                    PaymentView base = mapRowToPaymentView(rs, fallbackPrice);
                    return new PaymentView(
                            base.paymentId(),
                            base.orderId(),
                            base.method(),
                            base.status(),
                            base.dbStatus(),
                            base.amount(),
                            base.checkoutUrl(),
                            base.pixCode(),
                            base.simulationDetails(),
                            base.paymentDate(),
                            rs.getString("pedido_status"),
                            rs.getString("pedido_titulo"),
                            rs.getString("nome_cliente"),
                            rs.getString("nome_artista")
                    );
                },
                userId,
                userId
        );
    }

    @Transactional
    public PaymentView simulate(String paymentId, String rawStatus, String receivedToken, String authId) {
        if (confirmToken == null || confirmToken.isBlank() || !confirmToken.equals(receivedToken)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Token de confirmação inválido");
        }
        Long userId = findUserIdByAuthId(authId);
        PaymentView current = findByPaymentIdInternal(paymentId);
        OrderRow order = findOrderForClientOrThrow(current.orderId(), userId);
        lockPaymentRow(paymentId);
        current = findByPaymentIdInternal(paymentId);

        PaymentStatus status;
        try {
            status = PaymentStatus.fromInput(rawStatus);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
        }

        if (status.isApproved() && hasApprovedPaymentOtherThan(order.idPedido(), paymentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pedido já possui um pagamento aprovado");
        }

        PaymentStatus updated = paymentProvider.simulateStatus(paymentId, status);
        updatePaymentStatusInDb(paymentId, updated);
        updateOrderStateAfterPayment(order, updated);

        OrderRow updatedOrder = findOrderByIdOrThrow(order.idPedido());
        return enrichWithOrderDetails(findByPaymentIdInternal(paymentId), updatedOrder);
    }

    private void insertPaymentRecord(
            OrderRow order,
            PaymentMethod method,
            PaymentProvider.CheckoutResult created
    ) {
        String sql = switch (method) {
            case PIX -> """
                    INSERT INTO public.pagamentos (id_pedido, id_cliente, id_artista, valor, metodo, status_pagamento, gateway_payment_id, checkout_url, gateway_status)
                    VALUES (?, ?, ?, ?, 'Pix', 'Pendente', ?, ?, ?)
                    """;
            case CARTAO -> """
                    INSERT INTO public.pagamentos (id_pedido, id_cliente, id_artista, valor, metodo, status_pagamento, gateway_payment_id, checkout_url, gateway_status)
                    VALUES (?, ?, ?, ?, 'Cartão de Crédito', 'Pendente', ?, ?, ?)
                    """;
            case TRANSFERENCIA -> """
                    INSERT INTO public.pagamentos (id_pedido, id_cliente, id_artista, valor, metodo, status_pagamento, gateway_payment_id, checkout_url, gateway_status)
                    VALUES (?, ?, ?, ?, 'Boleto', 'Pendente', ?, ?, ?)
                    """;
        };
        int insertedRows = jdbcTemplate.update(
                sql,
                order.idPedido(),
                order.idCliente(),
                order.idArtista(),
                order.valorTotal(),
                created.paymentId(),
                created.checkoutUrl(),
                created.status().canonicalName()
        );
        if (insertedRows != 1) {
            throw new DataAccessResourceFailureException("O Supabase não confirmou a gravação do pagamento.");
        }
    }

    private void updatePaymentMethod(String paymentId, PaymentMethod method) {
        String sql = switch (method) {
            case PIX -> "UPDATE public.pagamentos SET metodo = 'Pix' WHERE gateway_payment_id = ?";
            case CARTAO -> "UPDATE public.pagamentos SET metodo = 'Cartão de Crédito' WHERE gateway_payment_id = ?";
            case TRANSFERENCIA -> "UPDATE public.pagamentos SET metodo = 'Boleto' WHERE gateway_payment_id = ?";
        };
        requireSingleUpdatedRow(jdbcTemplate.update(sql, paymentId), "atualização do método de pagamento");
    }

    private void updatePaymentStatusInDb(String paymentId, PaymentStatus status) {
        String gatewayStatus = status.canonicalName();
        if (status.isApproved()) {
            requireJdbcForFinancialCapture();
            PaymentAccountingRow accounting = findPaymentAccountingRowForUpdate(paymentId);
            BigDecimal platformFee = accounting.amount()
                    .multiply(PLATFORM_FEE_RATE)
                    .setScale(MONEY_SCALE, RoundingMode.HALF_UP);
            BigDecimal artistAmount = accounting.amount()
                    .subtract(platformFee)
                    .setScale(MONEY_SCALE, RoundingMode.HALF_UP);
            requireSingleUpdatedRow(jdbcTemplate.update(
                    """
                    UPDATE public.pagamentos
                    SET gateway_status = ?,
                        status_pagamento = 'Pago',
                        taxa_percentual = ?,
                        taxa_plataforma = ?,
                        valor_artista = ?
                    WHERE id_pagamento = ? AND gateway_payment_id = ?
                    """,
                    gatewayStatus,
                    PLATFORM_FEE_RATE,
                    platformFee,
                    artistAmount,
                    accounting.paymentId(),
                    paymentId
            ), "atualização do pagamento");
            ensureRetentionMovement(accounting, artistAmount);
        } else if (status == PaymentStatus.REFUNDED) {
            requireSingleUpdatedRow(jdbcTemplate.update(
                    """
                    UPDATE public.pagamentos
                    SET gateway_status = ?,
                        status_pagamento = 'Reembolso'
                    WHERE gateway_payment_id = ?
                    """,
                    gatewayStatus,
                    paymentId
            ), "atualização do pagamento");
        } else if (status.isDeclined() || status == PaymentStatus.CANCELLED) {
            requireSingleUpdatedRow(jdbcTemplate.update(
                    """
                    UPDATE public.pagamentos
                    SET gateway_status = ?,
                        status_pagamento = 'Cancelado'
                    WHERE gateway_payment_id = ?
                    """,
                    gatewayStatus,
                    paymentId
            ), "atualização do pagamento");
        } else {
            requireSingleUpdatedRow(jdbcTemplate.update(
                    """
                    UPDATE public.pagamentos
                    SET gateway_status = ?,
                        status_pagamento = 'Pendente'
                    WHERE gateway_payment_id = ?
                    """,
                    gatewayStatus,
                    paymentId
            ), "atualização do pagamento");
        }
    }

    private void requireJdbcForFinancialCapture() {
        if (jdbcTemplate instanceof br.com.charte.backend.common.SupabasePostgrestJdbcTemplate supabaseJdbc
                && !supabaseJdbc.isJdbcConfigured()) {
            throw new DataAccessResourceFailureException(
                    "A aprovação financeira exige JDBC transacional; PostgREST não pode registrar retenção com segurança."
            );
        }
    }

    private void lockPaymentRow(String paymentId) {
        findPaymentAccountingRowForUpdate(paymentId);
    }

    private PaymentAccountingRow findPaymentAccountingRowForUpdate(String paymentId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT id_pagamento, id_cliente, id_artista, valor, valor_artista
                    FROM public.pagamentos
                    WHERE gateway_payment_id = ?
                    FOR UPDATE
                    """,
                    (rs, rowNum) -> new PaymentAccountingRow(
                            rs.getLong("id_pagamento"),
                            rs.getLong("id_cliente"),
                            rs.getLong("id_artista"),
                            rs.getBigDecimal("valor"),
                            rs.getBigDecimal("valor_artista")
                    ),
                    paymentId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pagamento não encontrado");
        }
    }

    private void ensureRetentionMovement(PaymentAccountingRow payment, BigDecimal artistAmount) {
        Integer existing = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM public.movimentacoes_financeiras
                WHERE id_pagamento = ? AND tipo_movimentacao = 'credito_retido'
                """,
                Integer.class,
                payment.paymentId()
        );
        if (existing != null && existing > 0) {
            return;
        }
        if (artistAmount.signum() <= 0) {
            throw new DataAccessResourceFailureException("O valor retido do artista deve ser positivo.");
        }

        int inserted = jdbcTemplate.update(
                """
                INSERT INTO public.movimentacoes_financeiras
                    (id_pagamento, id_cliente, id_artista, tipo_movimentacao, valor, descricao)
                VALUES (?, ?, ?, 'credito_retido', ?, ?)
                """,
                payment.paymentId(),
                payment.clientId(),
                payment.artistId(),
                artistAmount,
                "Valor líquido do artista retido até a confirmação de entrega pelo cliente"
        );
        if (inserted != 1) {
            throw new DataAccessResourceFailureException("O Supabase não confirmou o registro do valor retido.");
        }
    }

    private void ensureArtistReleaseMovement(PaymentAccountingRow payment) {
        Integer existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.movimentacoes_financeiras WHERE id_pagamento = ? AND tipo_movimentacao = 'liberacao_artista'",
                Integer.class, payment.paymentId());
        if (existing != null && existing > 0) return;
        if (payment.artistAmount() == null || payment.artistAmount().signum() <= 0) {
            throw new DataAccessResourceFailureException("O valor líquido do artista não foi confirmado para liberação.");
        }
        requireSingleUpdatedRow(jdbcTemplate.update(
                """
                INSERT INTO public.movimentacoes_financeiras
                    (id_pagamento, id_cliente, id_artista, tipo_movimentacao, valor, descricao)
                VALUES (?, ?, ?, 'liberacao_artista', ?, ?)
                """,
                payment.paymentId(), payment.clientId(), payment.artistId(), payment.artistAmount(),
                "Valor líquido liberado após a compra de obra pronta"), "liberação da venda de obra pronta");
    }

    private boolean isReadyArtAcquisition(OrderRow order) {
        return order.titulo() != null && order.titulo().startsWith("Aquisição:");
    }

    private void requireSingleUpdatedRow(int updatedRows, String operation) {
        if (updatedRows != 1) {
            throw new DataAccessResourceFailureException("O Supabase não confirmou a " + operation + ".");
        }
    }

    private void updateOrderStateAfterPayment(OrderRow order, PaymentStatus paymentStatus) {
        boolean alreadyDelivered = "Entregue".equalsIgnoreCase(order.statusComissao())
                || "Finalizada".equalsIgnoreCase(order.statusComissao());
        if (paymentStatus.isApproved() && !alreadyDelivered) {
            boolean readyArtAcquisition = order.titulo() != null && order.titulo().startsWith("Aquisição:");
            String sql = readyArtAcquisition
                    ? "UPDATE public.pedidos_principal SET status_comissao = 'Finalizada', status_pedido = 'Entregue', concluida_em = COALESCE(concluida_em, CURRENT_TIMESTAMP) WHERE id_pedido = ?"
                    : "UPDATE public.pedidos_principal SET status_comissao = 'Em andamento', status_pedido = 'Em Produção' WHERE id_pedido = ?";
            requireSingleUpdatedRow(jdbcTemplate.update(sql, order.idPedido()), "atualização do pedido");
        } else if (paymentStatus == PaymentStatus.REFUNDED && !"Cancelada".equalsIgnoreCase(order.statusComissao())) {
            requireSingleUpdatedRow(jdbcTemplate.update(
                    "UPDATE public.pedidos_principal SET status_comissao = 'Cancelada', status_pedido = 'Cancelado' WHERE id_pedido = ?",
                    order.idPedido()
            ), "atualização do pedido");
        }
    }

    private boolean hasApprovedPayment(Long orderId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM public.pagamentos
                WHERE id_pedido = ?
                  AND (CAST(status_pagamento AS VARCHAR) = 'Pago'
                       OR UPPER(COALESCE(gateway_status, '')) IN ('APPROVED', 'PAID', 'SIMULATED_PAID'))
                """,
                Integer.class,
                orderId
        );
        return count != null && count > 0;
    }

    private boolean hasApprovedPaymentOtherThan(Long orderId, String paymentId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM public.pagamentos
                WHERE id_pedido = ?
                  AND gateway_payment_id <> ?
                  AND (CAST(status_pagamento AS VARCHAR) = 'Pago'
                       OR UPPER(COALESCE(gateway_status, '')) IN ('APPROVED', 'PAID', 'SIMULATED_PAID'))
                """,
                Integer.class,
                orderId,
                paymentId
        );
        return count != null && count > 0;
    }

    private PaymentView findLatestPendingByOrder(Long orderId) {
        try {
            OrderRow order = findOrderByIdOrThrow(orderId);
            return jdbcTemplate.queryForObject(
                    """
                    SELECT p.gateway_payment_id, p.id_pedido, p.valor, CAST(p.metodo AS VARCHAR) AS metodo,
                           p.gateway_status, CAST(p.status_pagamento AS VARCHAR) AS status_pagamento,
                           p.checkout_url
                    FROM public.pagamentos p
                    WHERE p.id_pedido = ?
                      AND UPPER(COALESCE(p.gateway_status, 'PENDING')) IN ('PENDING', 'PROCESSING', 'SIMULATED_PENDING')
                      AND CAST(p.status_pagamento AS VARCHAR) = 'Pendente'
                      AND p.gateway_payment_id IS NOT NULL
                    ORDER BY p.id_pagamento DESC
                    LIMIT 1
                    """,
                    (rs, rowNum) -> enrichWithOrderDetails(mapRowToPaymentView(rs, order.valorTotal()), order),
                    orderId
            );
        } catch (EmptyResultDataAccessException ex) {
            return null;
        }
    }

    private PaymentView findByPaymentIdInternal(String paymentId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT p.gateway_payment_id, p.id_pedido, p.valor, CAST(p.metodo AS VARCHAR) AS metodo,
                           p.gateway_status, CAST(p.status_pagamento AS VARCHAR) AS status_pagamento,
                           p.checkout_url,
                           COALESCE(ped.proposta_valor, ped.valor_total) AS pedido_valor
                    FROM public.pagamentos p
                    JOIN public.pedidos_principal ped ON ped.id_pedido = p.id_pedido
                    WHERE p.gateway_payment_id = ?
                    """,
                    (rs, rowNum) -> mapRowToPaymentView(rs, rs.getBigDecimal("pedido_valor")),
                    paymentId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pagamento não encontrado");
        }
    }

    private PaymentView mapRowToPaymentView(java.sql.ResultSet rs, BigDecimal fallbackAmount) throws java.sql.SQLException {
        String paymentId = rs.getString("gateway_payment_id");
        Long orderId = rs.getLong("id_pedido");
        String method = rs.getString("metodo");
        String gatewayStatus = rs.getString("gateway_status");
        String dbStatus = rs.getString("status_pagamento");
        String checkoutUrl = rs.getString("checkout_url");
        BigDecimal persistedAmount = rs.getBigDecimal("valor");
        BigDecimal effectiveAmount = persistedAmount != null
                ? persistedAmount
                : (fallbackAmount != null ? fallbackAmount : BigDecimal.ZERO);
        String paymentDate = LocalDate.now().toString();

        String normalizedStatus = normalizeGatewayStatus(gatewayStatus, dbStatus);
        String pixCode = generateDeterministicPixCode(paymentId, orderId, effectiveAmount);
        String details = defaultDetailsForStatus(normalizedStatus, method);

        return new PaymentView(
                paymentId,
                orderId,
                method,
                normalizedStatus,
                dbStatus != null ? dbStatus : "Pendente",
                effectiveAmount,
                checkoutUrl,
                pixCode,
                details,
                paymentDate,
                null,
                null,
                null,
                null
        );
    }

    private PaymentView enrichWithOrderDetails(PaymentView view, OrderRow order) {
        if (view == null || order == null) {
            return view;
        }
        return new PaymentView(
                view.paymentId(),
                view.orderId(),
                view.method(),
                view.status(),
                view.dbStatus(),
                view.amount(),
                view.checkoutUrl(),
                view.pixCode(),
                view.simulationDetails(),
                view.paymentDate(),
                order.statusComissao(),
                order.titulo(),
                order.nomeCliente(),
                order.nomeArtista()
        );
    }

    private String normalizeGatewayStatus(String gatewayStatus, String dbStatus) {
        if (gatewayStatus != null && !gatewayStatus.isBlank()) {
            String clean = gatewayStatus.replaceFirst("(?i)^simulated_", "");
            try {
                return PaymentStatus.fromInput(clean).canonicalName();
            } catch (IllegalArgumentException ignored) {
                return clean.toUpperCase(Locale.ROOT);
            }
        }
        if (dbStatus != null) {
            try {
                return PaymentStatus.fromInput(dbStatus).canonicalName();
            } catch (IllegalArgumentException ignored) {
                // fallback below
            }
        }
        return PaymentStatus.PENDING.canonicalName();
    }

    private PaymentStatus parseStatusSafe(String rawStatus) {
        try {
            return PaymentStatus.fromInput(rawStatus);
        } catch (Exception e) {
            return PaymentStatus.PENDING;
        }
    }

    private String generateDeterministicPixCode(String paymentId, Long orderId, BigDecimal amount) {
        String cleanId = paymentId != null ? paymentId.replace("pay_", "").replace("mock_", "").toUpperCase(Locale.ROOT) : "00000000";
        String shortHash = cleanId.length() >= 8 ? cleanId.substring(0, 8) : cleanId;
        return String.format(
                Locale.US,
                "00020126580014BR.GOV.BCB.PIX0136CHARTE-SIM-%d-%s5204000053039865406%.2f5802BR5913CHARTE ARTES6009SAO PAULO62070503***6304%s",
                orderId != null ? orderId : 0L,
                shortHash,
                amount != null ? amount : BigDecimal.ZERO,
                shortHash.length() >= 4 ? shortHash.substring(0, 4) : "ABCD"
        );
    }

    private String defaultDetailsForStatus(String status, String method) {
        return switch (status) {
            case "APPROVED", "PAID" -> "Pagamento simulado aprovado (" + method + ").";
            case "DECLINED", "FAILED" -> "Pagamento simulado recusado (" + method + ").";
            case "CANCELLED" -> "Pagamento simulado cancelado.";
            case "REFUNDED" -> "Valor reembolsado na simulação financeira.";
            case "PROCESSING" -> "Pagamento em processamento no simulador interno.";
            default -> "Aguardando confirmação da operação simulada.";
        };
    }

    private Long findUserIdByAuthId(String authId) {
        if (authId == null || authId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token sem subject");
        }
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT id_usuario FROM public.usuario WHERE CAST(id_auth AS VARCHAR) = ? AND status_conta = 'Ativo' AND data_nascimento <= ?",
                    Long.class,
                    authId,
                    MinimumAge.latestEligibleBirthDate()
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Usuário não vinculado");
        }
    }

    private OrderRow findOrderByIdOrThrow(Long orderId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT ped.id_pedido, ped.id_cliente, ped.id_artista, a.id_usuario AS id_usuario_artista,
                           COALESCE(ped.proposta_valor, ped.valor_total) AS valor_efetivo,
                           CAST(ped.status_pedido AS VARCHAR) AS status_pedido,
                           COALESCE(CAST(ped.status_comissao AS VARCHAR), CAST(ped.status_pedido AS VARCHAR)) AS status_comissao,
                           ped.titulo,
                           uc.nome AS nome_cliente,
                           COALESCE(a.nome_artistico, ua.nome) AS nome_artista
                    FROM public.pedidos_principal ped
                    LEFT JOIN public.usuario uc ON uc.id_usuario = ped.id_cliente
                    LEFT JOIN public.artista a ON a.id_artista = ped.id_artista
                    LEFT JOIN public.usuario ua ON ua.id_usuario = a.id_usuario
                    WHERE ped.id_pedido = ?
                    """,
                    (rs, rowNum) -> new OrderRow(
                            rs.getLong("id_pedido"),
                            rs.getLong("id_cliente"),
                            rs.getObject("id_artista") != null ? rs.getLong("id_artista") : null,
                            rs.getObject("id_usuario_artista") != null ? rs.getLong("id_usuario_artista") : null,
                            rs.getBigDecimal("valor_efetivo"),
                            rs.getString("status_pedido"),
                            rs.getString("status_comissao"),
                            rs.getString("titulo"),
                            rs.getString("nome_cliente"),
                            rs.getString("nome_artista")
                    ),
                    orderId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido não encontrado");
        }
    }

    private OrderRow findOrderForClientOrThrow(Long orderId, Long userId) {
        OrderRow row = findOrderByIdOrThrow(orderId);
        if (!row.idCliente().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Pedido não pertence ao usuário autenticado");
        }
        return row;
    }

    private OrderRow findOrderForParticipantOrThrow(Long orderId, Long userId) {
        OrderRow row = findOrderByIdOrThrow(orderId);
        boolean isClient = row.idCliente() != null && row.idCliente().equals(userId);
        boolean isArtist = row.idUsuarioArtista() != null && row.idUsuarioArtista().equals(userId);
        if (!isClient && !isArtist) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Usuário não possui permissão para visualizar este pedido");
        }
        return row;
    }
}
