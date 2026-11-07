package br.com.charte.backend.finance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.charte.backend.common.AuthenticatedUserService;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class ArtistFinanceServiceTest {
    private JdbcTemplate jdbc;
    private AuthenticatedUserService authenticatedUserService;
    private ArtistFinanceService service;
    private final List<Long> queriedArtistIds = new ArrayList<>();
    private boolean missingFinanceFields;

    @BeforeEach
    void setUp() throws Exception {
        jdbc = mock(JdbcTemplate.class);
        authenticatedUserService = mock(AuthenticatedUserService.class);
        service = new ArtistFinanceService(jdbc, authenticatedUserService);
        when(authenticatedUserService.requireUserIdByAuthId("jwt-artist-a")).thenReturn(11L);
        when(authenticatedUserService.requireUserIdByAuthId("jwt-artist-b")).thenReturn(22L);
        when(authenticatedUserService.requireUserIdByAuthId("jwt-artist-empty")).thenReturn(33L);
        when(jdbc.queryForObject(eq(containsArtistLookup()), eq(Long.class), eq(11L))).thenReturn(77L);
        when(jdbc.queryForObject(eq(containsArtistLookup()), eq(Long.class), eq(22L))).thenReturn(88L);
        when(jdbc.queryForObject(eq(containsArtistLookup()), eq(Long.class), eq(33L))).thenReturn(99L);
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            Object[] invocationArgs = invocation.getArguments();
            long artistId = ((Number) invocationArgs[2]).longValue();
            queriedArtistIds.add(artistId);
            List<Map<String, Object>> rows = rowsFor(sql, artistId);
            List<Object> mapped = new ArrayList<>();
            for (int i = 0; i < rows.size(); i++) mapped.add(mapper.mapRow(resultSet(rows.get(i)), i));
            return mapped;
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<long[]> mapper = invocation.getArgument(1);
            long artistId = ((Number) invocation.getArguments()[2]).longValue();
            long pending = artistId == 99L ? 0 : 2;
            long production = artistId == 99L ? 0 : 3;
            long completed = artistId == 99L ? 0 : 4;
            return mapper.mapRow(resultSet(Map.of("1", pending, "2", production, "3", completed)), 0);
        }).when(jdbc).queryForObject(anyString(), any(RowMapper.class), any(Object[].class));
    }

    @Test
    void summaryUsesJwtArtistAndExcludesPendingPayments() {
        ArtistFinanceService.FinanceSummary summary = service.summary("jwt-artist-a");

        assertEquals(1, summary.approvedPayments());
        assertEquals(new BigDecimal("100.00"), summary.grossRevenue());
        assertEquals(new BigDecimal("9.00"), summary.platformFees());
        assertEquals(new BigDecimal("91.00"), summary.artistNet());
        assertEquals(1, summary.approvedPaymentsMissingMovements());
        assertEquals(1, summary.financialFieldDiscrepancies());
        assertEquals(1, summary.unclassifiedPayments());
        assertEquals(2, summary.pendingOrders());
        assertEquals(3, summary.productionOrders());
        assertEquals(4, summary.completedOrders());
        assertEquals(List.of(77L, 77L), queriedArtistIds);
        verify(authenticatedUserService).requireUserIdByAuthId("jwt-artist-a");
    }

    @Test
    void nullPersistedFinanceValuesAreNotReplacedByCalculatedValues() {
        missingFinanceFields = true;
        ArtistFinanceService.FinanceSummary summary = service.summary("jwt-artist-a");
        assertEquals(new BigDecimal("100.00"), summary.grossRevenue());
        assertNull(summary.platformFees());
        assertNull(summary.artistNet());
    }

    @Test
    void eachJwtResolvesToItsOwnFinancialRows() {
        ArtistFinanceService.FinanceSummary summary = service.summary("jwt-artist-b");
        assertEquals(new BigDecimal("20.00"), summary.grossRevenue());
        assertEquals(List.of(88L, 88L), queriedArtistIds);
    }

    @Test
    void noPersistedPaymentsProduceActualZeroTotalsAndEmptyMonthlySeries() {
        ArtistFinanceService.FinanceSummary summary = service.summary("jwt-artist-empty");
        assertEquals(new BigDecimal("0.00"), summary.grossRevenue());
        assertEquals(new BigDecimal("0.00"), summary.platformFees());
        assertEquals(new BigDecimal("0.00"), summary.artistNet());
        assertEquals(new BigDecimal("0.00"), summary.heldBalance());
        assertEquals(new BigDecimal("0.00"), summary.availableBalance());
        assertEquals(0, summary.pendingOrders());
        assertEquals(0, summary.productionOrders());
        assertEquals(0, summary.completedOrders());
        assertEquals(List.of(), summary.monthlyRevenue());
    }

    private List<Map<String, Object>> rowsFor(String sql, long artistId) {
        if (sql.contains("FROM public.pagamentos")) {
            if (artistId == 99L) return List.of();
            Map<String, Object> approved = payment(1L, 100L, "Pago", "APPROVED", 0.08,
                    missingFinanceFields ? null : 9, missingFinanceFields ? null : 91);
            Map<String, Object> pending = payment(2L, 999L, "Pendente", "PENDING", null, null, null);
            if (artistId == 88L) return List.of(payment(3L, 20L, "Pago", "APPROVED", null, null, null));
            return List.of(approved, pending);
        }
        if (sql.contains("FROM public.movimentacoes_financeiras")) return List.of();
        if (sql.contains("FROM public.comissao")) return List.of();
        return List.of();
    }

    private Map<String, Object> payment(long id, long amount, String status, String gateway, Double rate, Integer fee, Integer net) {
        Map<String, Object> row = new HashMap<>();
        row.put("id_pagamento", id);
        row.put("id_portifolio", null);
        row.put("valor", new BigDecimal(amount));
        row.put("status_pagamento", status);
        row.put("gateway_status", gateway);
        row.put("taxa_percentual", rate == null ? null : BigDecimal.valueOf(rate));
        row.put("taxa_plataforma", fee == null ? null : BigDecimal.valueOf(fee));
        row.put("valor_artista", net == null ? null : BigDecimal.valueOf(net));
        return row;
    }

    private ResultSet resultSet(Map<String, Object> row) {
        boolean[] wasNull = {false};
        return (ResultSet) Proxy.newProxyInstance(ResultSet.class.getClassLoader(), new Class[]{ResultSet.class},
                (proxy, method, args) -> {
                    if (method.getName().equals("getLong")) {
                        Object key = args[0] instanceof Integer index ? String.valueOf(index) : args[0];
                        Object value = row.get(key);
                        wasNull[0] = value == null;
                        return value == null ? 0L : ((Number) value).longValue();
                    }
                    if (method.getName().equals("getBigDecimal")) return row.get(args[0]);
                    if (method.getName().equals("getString")) {
                        Object value = row.get(args[0]);
                        return value == null ? null : value.toString();
                    }
                    if (method.getName().equals("getObject")) {
                        Object value = row.get(args[0]);
                        if (value == null || ((Class<?>) args[1]).isInstance(value)) return value;
                        return null;
                    }
                    if (method.getName().equals("wasNull")) return wasNull[0];
                    if (method.getName().equals("toString")) return "FinanceTestResultSet";
                    throw new UnsupportedOperationException(method.getName());
                });
    }

    private String containsArtistLookup() { return "SELECT id_artista FROM public.artista WHERE id_usuario = ?"; }
}
