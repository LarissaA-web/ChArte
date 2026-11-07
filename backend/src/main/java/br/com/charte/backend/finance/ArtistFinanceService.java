package br.com.charte.backend.finance;

import br.com.charte.backend.common.AuthenticatedUserService;
import br.com.charte.backend.common.SupabasePostgrestJdbcTemplate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ArtistFinanceService {
    private static final BigDecimal TAX_RATE = new BigDecimal("0.08");
    private static final BigDecimal ZERO = new BigDecimal("0.00");
    private static final DateTimeFormatter MONTH_LABEL = DateTimeFormatter.ofPattern("yyyy-MM");

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;

    public ArtistFinanceService(JdbcTemplate jdbcTemplate, AuthenticatedUserService authenticatedUserService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
    }

    public record MonthlyRevenue(String month, BigDecimal gross) {}
    public record FinanceSummary(
            BigDecimal grossRevenue,
            BigDecimal platformFees,
            BigDecimal artistNet,
            BigDecimal heldBalance,
            BigDecimal availableBalance,
            long approvedPayments,
            long readyArtSales,
            long commissions,
            long unclassifiedPayments,
            long approvedPaymentsMissingMovements,
            long movementsWithoutApprovedPayment,
            long financialFieldDiscrepancies,
            List<MonthlyRevenue> monthlyRevenue
    ) {}
    public record Movement(
            Long id,
            Long paymentId,
            String type,
            BigDecimal amount,
            String description,
            OffsetDateTime createdAt
    ) {}
    public record MovementPage(List<Movement> items, long total, int page, int size) {}

    private record Payment(
            Long id,
            Long portfolioId,
            BigDecimal gross,
            String status,
            String gatewayStatus,
            BigDecimal taxRate,
            BigDecimal fee,
            BigDecimal net
    ) {}

    private record MovementRow(Long id, Long paymentId, Long artistId, String type, BigDecimal amount,
                               String description, OffsetDateTime createdAt) {}

    @Transactional(readOnly = true)
    public FinanceSummary summary(String authId) {
        long artistId = requireArtistId(authId);
        List<Payment> payments = loadPayments(artistId);
        List<MovementRow> movements = loadMovements(artistId);
        Set<Long> commissionPaymentIds = loadCommissionPaymentIds(artistId);

        BigDecimal gross = ZERO;
        BigDecimal fees = ZERO;
        BigDecimal net = ZERO;
        BigDecimal held = ZERO;
        BigDecimal available = ZERO;
        long approvedCount = 0;
        long readyCount = 0;
        long commissionCount = 0;
        long unclassifiedCount = 0;
        long discrepancies = 0;
        long movementsWithoutApprovedPayment = 0;
        boolean grossComplete = true;
        boolean feesComplete = true;
        boolean netComplete = true;
        Set<Long> movementPaymentIds = new HashSet<>();
        Map<YearMonth, BigDecimal[]> monthly = new HashMap<>();
        Map<Long, Payment> approvedById = new HashMap<>();

        for (Payment payment : payments) {
            if (!isApproved(payment)) continue;
            approvedCount++;
            approvedById.put(payment.id(), payment);
            if (payment.portfolioId() != null && !commissionPaymentIds.contains(payment.id())) readyCount++;
            else if (payment.portfolioId() == null && commissionPaymentIds.contains(payment.id())) commissionCount++;
            else unclassifiedCount++;

            if (payment.gross() != null) gross = gross.add(payment.gross()); else grossComplete = false;
            if (payment.fee() != null) fees = fees.add(payment.fee()); else feesComplete = false;
            if (payment.net() != null) net = net.add(payment.net()); else netComplete = false;
            if (payment.gross() == null || payment.fee() == null || payment.net() == null
                    || payment.taxRate() == null
                    || payment.taxRate().compareTo(TAX_RATE) != 0
                    || payment.gross().subtract(payment.fee()).compareTo(payment.net()) != 0
                    || payment.gross().multiply(TAX_RATE).setScale(2, RoundingMode.HALF_UP).compareTo(payment.fee()) != 0) {
                discrepancies++;
            }
        }

        for (MovementRow movement : movements) {
            if ("credito_retido".equalsIgnoreCase(movement.type())) {
                held = held.add(orZero(movement.amount()));
                if (movement.paymentId() != null) {
                    movementPaymentIds.add(movement.paymentId());
                    Payment payment = approvedById.get(movement.paymentId());
                    if (payment == null) movementsWithoutApprovedPayment++;
                    if (payment != null && movement.createdAt() != null) {
                        YearMonth month = YearMonth.from(movement.createdAt());
                        if (payment.gross() != null) {
                            BigDecimal[] totals = monthly.computeIfAbsent(month, ignored -> new BigDecimal[]{ZERO});
                            totals[0] = totals[0].add(payment.gross());
                        }
                    }
                }
            } else if ("credito_liberado".equalsIgnoreCase(movement.type())) {
                available = available.add(orZero(movement.amount()));
                held = held.subtract(orZero(movement.amount()));
            } else if ("debito_retido".equalsIgnoreCase(movement.type())
                    || "estorno_retido".equalsIgnoreCase(movement.type())
                    || "credito_estornado".equalsIgnoreCase(movement.type())) {
                held = held.subtract(orZero(movement.amount()));
            } else if (isDebit(movement.type())) {
                available = available.subtract(orZero(movement.amount()));
            }
        }

        long missingMovements = approvedById.keySet().stream().filter(id -> !movementPaymentIds.contains(id)).count();
        boolean monthlyComplete = missingMovements == 0 && grossComplete;
        List<MonthlyRevenue> monthlyRevenue = monthlyComplete ? monthly.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> new MonthlyRevenue(entry.getKey().format(MONTH_LABEL), money(entry.getValue()[0])))
                .toList() : List.of();

        return new FinanceSummary(grossComplete ? money(gross) : null,
                feesComplete ? money(fees) : null, netComplete ? money(net) : null,
                money(held), money(available),
                approvedCount, readyCount, commissionCount, unclassifiedCount, missingMovements,
                movementsWithoutApprovedPayment, discrepancies, monthlyRevenue);
    }

    @Transactional(readOnly = true)
    public MovementPage movements(String authId, int page, int size) {
        long artistId = requireArtistId(authId);
        if (page < 0 || size < 1 || size > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Paginação inválida (size máximo: 100)");
        }
        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.movimentacoes_financeiras WHERE id_artista = ?",
                Long.class, artistId);
        List<Movement> items = jdbcTemplate.query(
                """
                SELECT id_movimentacao, id_pagamento, tipo_movimentacao, valor, descricao, data_criacao
                FROM public.movimentacoes_financeiras
                WHERE id_artista = ?
                ORDER BY data_criacao DESC, id_movimentacao DESC
                LIMIT ? OFFSET ?
                """,
                (rs, rowNum) -> new Movement(rs.getLong("id_movimentacao"),
                        nullableLong(rs, "id_pagamento"), rs.getString("tipo_movimentacao"),
                        rs.getBigDecimal("valor"), rs.getString("descricao"),
                        rs.getObject("data_criacao", OffsetDateTime.class)),
                artistId, size, (long) page * size);
        return new MovementPage(items, total == null ? 0 : total, page, size);
    }

    private long requireArtistId(String authId) {
        requireJdbcMode();
        long userId = authenticatedUserService.requireUserIdByAuthId(authId);
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT id_artista FROM public.artista WHERE id_usuario = ?",
                    Long.class, userId);
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conta autenticada não está vinculada a um artista");
        }
    }

    private List<Payment> loadPayments(long artistId) {
        return jdbcTemplate.query(
                """
                SELECT id_pagamento, id_portifolio, valor, status_pagamento, gateway_status,
                       taxa_percentual, taxa_plataforma, valor_artista
                FROM public.pagamentos WHERE id_artista = ? ORDER BY id_pagamento
                """,
                (rs, rowNum) -> new Payment(rs.getLong("id_pagamento"), nullableLong(rs, "id_portifolio"),
                        rs.getBigDecimal("valor"), rs.getString("status_pagamento"), rs.getString("gateway_status"),
                        rs.getBigDecimal("taxa_percentual"), rs.getBigDecimal("taxa_plataforma"), rs.getBigDecimal("valor_artista")),
                artistId);
    }

    private List<MovementRow> loadMovements(long artistId) {
        return jdbcTemplate.query(
                """
                SELECT id_movimentacao, id_pagamento, id_artista, tipo_movimentacao, valor, descricao, data_criacao
                FROM public.movimentacoes_financeiras WHERE id_artista = ?
                ORDER BY data_criacao, id_movimentacao
                """,
                (rs, rowNum) -> new MovementRow(rs.getLong("id_movimentacao"), nullableLong(rs, "id_pagamento"),
                        rs.getLong("id_artista"), rs.getString("tipo_movimentacao"), rs.getBigDecimal("valor"),
                        rs.getString("descricao"), rs.getObject("data_criacao", OffsetDateTime.class)),
                artistId);
    }

    private Set<Long> loadCommissionPaymentIds(long artistId) {
        return new HashSet<>(jdbcTemplate.query(
                "SELECT id_pagamento FROM public.comissao WHERE id_artista = ? AND id_pagamento IS NOT NULL",
                (rs, rowNum) -> rs.getLong("id_pagamento"), artistId));
    }

    private boolean isApproved(Payment payment) {
        String status = payment.status() == null ? "" : payment.status().trim();
        String gateway = payment.gatewayStatus() == null ? "" : payment.gatewayStatus().trim();
        if (!status.equalsIgnoreCase("Pago")) return false;
        return gateway.isBlank() || gateway.equalsIgnoreCase("APPROVED")
                || gateway.equalsIgnoreCase("PAID") || gateway.equalsIgnoreCase("SIMULATED_PAID");
    }

    private boolean isDebit(String type) {
        return type != null && (type.toLowerCase().startsWith("debito_") || type.equalsIgnoreCase("estorno_liberado"));
    }

    private void requireJdbcMode() {
        if (jdbcTemplate instanceof SupabasePostgrestJdbcTemplate supabaseJdbc && !supabaseJdbc.isJdbcConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Consultas financeiras exigem conexão JDBC direta para não confundir falha PostgREST com saldo vazio.");
        }
    }

    private static BigDecimal orZero(BigDecimal value) { return value == null ? ZERO : value; }
    private static BigDecimal money(BigDecimal value) { return value.setScale(2, RoundingMode.HALF_UP); }

    private static Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }
}
