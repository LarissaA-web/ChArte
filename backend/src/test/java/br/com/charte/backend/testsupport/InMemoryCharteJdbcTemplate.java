package br.com.charte.backend.testsupport;

import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

public class InMemoryCharteJdbcTemplate extends JdbcTemplate {

    public static class UserRow {
        public Long idUsuario;
        public String idAuth;
        public String nomeUsuario;
        public String nome;
        public String fotoPerfil;
        public String bio;

        public UserRow(Long idUsuario, String idAuth, String nomeUsuario, String nome) {
            this.idUsuario = idUsuario;
            this.idAuth = idAuth;
            this.nomeUsuario = nomeUsuario;
            this.nome = nome;
        }
    }

    public static class OrderRow {
        public Long idPedido;
        public Long idCliente;
        public Long idArtista;
        public BigDecimal valorTotal;
        public String statusPedido;
        public String statusComissao;
        public String titulo;

        public OrderRow(Long idPedido, Long idCliente, Long idArtista, BigDecimal valorTotal, String statusComissao, String titulo) {
            this.idPedido = idPedido;
            this.idCliente = idCliente;
            this.idArtista = idArtista;
            this.valorTotal = valorTotal;
            this.statusPedido = statusComissao;
            this.statusComissao = statusComissao;
            this.titulo = titulo;
        }
    }

    public static class PaymentRow {
        public Long idPagamento;
        public Long idPedido;
        public String metodo;
        public String statusPagamento;
        public LocalDate dataPagamento;
        public String gatewayPaymentId;
        public String checkoutUrl;
        public String gatewayStatus;
    }

    public static class FollowRow {
        public Long id;
        public Long idSeguidor;
        public Long idSeguindo;
    }

    private final List<UserRow> users = new ArrayList<>();
    private final Map<Long, String> artists = new HashMap<>();
    private final List<OrderRow> orders = new ArrayList<>();
    private final List<PaymentRow> payments = new ArrayList<>();
    private final List<FollowRow> follows = new ArrayList<>();
    private final AtomicLong paymentSeq = new AtomicLong(1);
    private final AtomicLong followSeq = new AtomicLong(1);

    public void addUser(Long id, String idAuth, String username, String fullName, boolean isArtist) {
        users.add(new UserRow(id, idAuth, username, fullName));
        if (isArtist) {
            artists.put(id, username);
        }
    }

    public void addOrder(Long idPedido, Long idCliente, Long idArtista, BigDecimal valorTotal, String status, String titulo) {
        orders.add(new OrderRow(idPedido, idCliente, idArtista, valorTotal, status, titulo));
    }

    public int countPayments() {
        return payments.size();
    }

    @Override
    public int update(String sql, Object... args) {
        String normalized = sql.replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);

        if (normalized.startsWith("INSERT INTO PUBLIC.PAGAMENTOS")) {
            PaymentRow row = new PaymentRow();
            row.idPagamento = paymentSeq.getAndIncrement();
            row.idPedido = ((Number) args[0]).longValue();
            if (normalized.contains("'PIX'")) {
                row.metodo = "Pix";
            } else if (normalized.contains("'CARTÃO DE CRÉDITO'")) {
                row.metodo = "Cartão de Crédito";
            } else {
                row.metodo = "Boleto";
            }
            row.statusPagamento = "Pendente";
            row.gatewayPaymentId = (String) args[1];
            row.checkoutUrl = (String) args[2];
            row.gatewayStatus = (String) args[3];
            payments.add(row);
            return 1;
        }

        if (normalized.startsWith("UPDATE PUBLIC.PAGAMENTOS SET METODO =")) {
            String paymentId = (String) args[0];
            String newMethod = normalized.contains("'PIX'") ? "Pix"
                    : normalized.contains("'CARTÃO DE CRÉDITO'") ? "Cartão de Crédito" : "Boleto";
            payments.stream()
                    .filter(p -> p.gatewayPaymentId.equals(paymentId))
                    .forEach(p -> p.metodo = newMethod);
            return 1;
        }

        if (normalized.startsWith("UPDATE PUBLIC.PAGAMENTOS SET GATEWAY_STATUS =")) {
            String gatewayStatus = (String) args[0];
            String paymentId = (String) args[1];
            payments.stream()
                    .filter(p -> p.gatewayPaymentId.equals(paymentId))
                    .forEach(p -> {
                        p.gatewayStatus = gatewayStatus;
                        if (normalized.contains("STATUS_PAGAMENTO = 'PAGO'")) {
                            p.statusPagamento = "Pago";
                            p.dataPagamento = LocalDate.now();
                        } else if (normalized.contains("STATUS_PAGAMENTO = 'REEMBOLSO'")) {
                            p.statusPagamento = "Reembolso";
                        } else if (normalized.contains("STATUS_PAGAMENTO = 'CANCELADO'")) {
                            p.statusPagamento = "Cancelado";
                        } else {
                            p.statusPagamento = "Pendente";
                        }
                    });
            return 1;
        }

        if (normalized.startsWith("UPDATE PUBLIC.PEDIDOS_PRINCIPAL SET")) {
            Long orderId = ((Number) args[0]).longValue();
            String nextStatus = normalized.contains("'EM ANDAMENTO'") ? "Em andamento" : "Cancelada";
            orders.stream()
                    .filter(o -> o.idPedido.equals(orderId))
                    .forEach(o -> {
                        o.statusComissao = nextStatus;
                        o.statusPedido = "Em andamento".equals(nextStatus) ? "Em Produção" : "Cancelado";
                    });
            return 1;
        }

        if (normalized.startsWith("INSERT INTO PUBLIC.SEGUIDORES")) {
            Long idSeguidor = ((Number) args[0]).longValue();
            Long idSeguindo = ((Number) args[1]).longValue();
            boolean exists = follows.stream()
                    .anyMatch(f -> f.idSeguidor.equals(idSeguidor) && f.idSeguindo.equals(idSeguindo));
            if (exists) {
                throw new DataIntegrityViolationException("Duplicate follow relationship");
            }
            FollowRow f = new FollowRow();
            f.id = followSeq.getAndIncrement();
            f.idSeguidor = idSeguidor;
            f.idSeguindo = idSeguindo;
            follows.add(f);
            return 1;
        }

        if (normalized.startsWith("DELETE FROM PUBLIC.SEGUIDORES")) {
            Long idSeguidor = ((Number) args[0]).longValue();
            Long idSeguindo = ((Number) args[1]).longValue();
            follows.removeIf(f -> f.idSeguidor.equals(idSeguidor) && f.idSeguindo.equals(idSeguindo));
            return 1;
        }

        throw new UnsupportedOperationException("Unsupported SQL update: " + sql);
    }

    @Override
    public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
        String normalized = sql.replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);

        if (normalized.contains("SELECT ID_USUARIO FROM PUBLIC.USUARIO WHERE CAST(ID_AUTH")) {
            String authId = (String) args[0];
            return users.stream()
                    .filter(u -> u.idAuth.equals(authId))
                    .findFirst()
                    .map(u -> requiredType.cast(u.idUsuario))
                    .orElseThrow(() -> new EmptyResultDataAccessException(1));
        }

        if (normalized.contains("FROM PUBLIC.PAGAMENTOS") && normalized.contains("SELECT COUNT(*)")) {
            Long orderId = ((Number) args[0]).longValue();
            String excludeId = args.length > 1 ? (String) args[1] : null;
            long count = payments.stream()
                    .filter(p -> p.idPedido.equals(orderId))
                    .filter(p -> excludeId == null || !p.gatewayPaymentId.equals(excludeId))
                    .filter(p -> "Pago".equalsIgnoreCase(p.statusPagamento)
                            || "APPROVED".equalsIgnoreCase(p.gatewayStatus)
                            || "PAID".equalsIgnoreCase(p.gatewayStatus))
                    .count();
            return requiredType.cast((int) count);
        }

        if (normalized.contains("SELECT COUNT(*) FROM PUBLIC.SEGUIDORES WHERE ID_SEGUINDO = ?")) {
            Long targetId = ((Number) args[0]).longValue();
            long count = follows.stream().filter(f -> f.idSeguindo.equals(targetId)).count();
            return requiredType.cast(count);
        }

        if (normalized.contains("SELECT COUNT(*) FROM PUBLIC.SEGUIDORES WHERE ID_SEGUIDOR = ? AND ID_SEGUINDO = ?")) {
            Long followerId = ((Number) args[0]).longValue();
            Long targetId = ((Number) args[1]).longValue();
            long count = follows.stream()
                    .filter(f -> f.idSeguidor.equals(followerId) && f.idSeguindo.equals(targetId))
                    .count();
            return requiredType.cast((int) count);
        }

        if (normalized.contains("SELECT COUNT(*) FROM PUBLIC.SEGUIDORES WHERE ID_SEGUIDOR = ?")) {
            Long followerId = ((Number) args[0]).longValue();
            long count = follows.stream().filter(f -> f.idSeguidor.equals(followerId)).count();
            return requiredType.cast(count);
        }

        throw new UnsupportedOperationException("Unsupported queryForObject(Class): " + sql);
    }

    @Override
    public <T> T queryForObject(String sql, RowMapper<T> rowMapper, Object... args) {
        List<T> results = query(sql, rowMapper, args);
        if (results.isEmpty()) {
            throw new EmptyResultDataAccessException(1);
        }
        return results.get(0);
    }

    @Override
    public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
        String normalized = sql.replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);
        try {
            if (normalized.contains("FROM PUBLIC.USUARIO") && normalized.contains("WHERE CAST(ID_AUTH AS VARCHAR) = ?")) {
                String authId = (String) args[0];
                List<T> out = new ArrayList<>();
                for (UserRow u : users) {
                    if (u.idAuth.equals(authId)) {
                        out.add(rowMapper.mapRow(mockResultSet(Map.of(
                                "id_usuario", u.idUsuario,
                                "nome_usuario", u.nomeUsuario,
                                "nome", u.nome,
                                "foto_perfil", u.fotoPerfil != null ? u.fotoPerfil : "",
                                "id_auth", u.idAuth
                        )), 0));
                    }
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.USUARIO") && normalized.contains("WHERE LOWER(NOME_USUARIO) = LOWER(?)")) {
                String username = (String) args[0];
                List<T> out = new ArrayList<>();
                for (UserRow u : users) {
                    if (u.nomeUsuario.equalsIgnoreCase(username)) {
                        out.add(rowMapper.mapRow(mockResultSet(Map.of(
                                "id_usuario", u.idUsuario,
                                "nome_usuario", u.nomeUsuario,
                                "nome", u.nome,
                                "foto_perfil", u.fotoPerfil != null ? u.fotoPerfil : "",
                                "id_auth", u.idAuth
                        )), 0));
                    }
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.PEDIDOS_PRINCIPAL PED") && normalized.contains("WHERE PED.ID_PEDIDO = ?")) {
                Long orderId = ((Number) args[0]).longValue();
                List<T> out = new ArrayList<>();
                for (OrderRow o : orders) {
                    if (o.idPedido.equals(orderId)) {
                        UserRow c = findUser(o.idCliente);
                        UserRow a = findUser(o.idArtista);
                        Map<String, Object> cols = new HashMap<>();
                        cols.put("id_pedido", o.idPedido);
                        cols.put("id_cliente", o.idCliente);
                        cols.put("id_artista", o.idArtista);
                        cols.put("id_usuario_artista", o.idArtista);
                        cols.put("valor_efetivo", o.valorTotal);
                        cols.put("status_pedido", o.statusPedido);
                        cols.put("status_comissao", o.statusComissao);
                        cols.put("titulo", o.titulo);
                        cols.put("nome_cliente", c != null ? c.nome : null);
                        cols.put("nome_artista", a != null ? a.nome : null);
                        out.add(rowMapper.mapRow(mockResultSet(cols), 0));
                    }
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.PAGAMENTOS P") && normalized.contains("WHERE P.GATEWAY_PAYMENT_ID = ?")) {
                String paymentId = (String) args[0];
                List<T> out = new ArrayList<>();
                for (PaymentRow p : payments) {
                    if (paymentId.equals(p.gatewayPaymentId)) {
                        OrderRow o = findOrder(p.idPedido);
                        out.add(rowMapper.mapRow(mockPaymentResultSet(p, o), 0));
                    }
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.PAGAMENTOS P") && normalized.contains("WHERE P.ID_PEDIDO = ?")) {
                Long orderId = ((Number) args[0]).longValue();
                boolean onlyPending = normalized.contains("IN ('PENDING', 'PROCESSING', 'SIMULATED_PENDING')");
                List<PaymentRow> matching = payments.stream()
                        .filter(p -> p.idPedido.equals(orderId))
                        .filter(p -> !onlyPending || ("Pendente".equalsIgnoreCase(p.statusPagamento)
                                && ("PENDING".equalsIgnoreCase(p.gatewayStatus) || "PROCESSING".equalsIgnoreCase(p.gatewayStatus))))
                        .sorted(Comparator.comparing((PaymentRow p) -> p.idPagamento).reversed())
                        .toList();
                List<T> out = new ArrayList<>();
                for (PaymentRow p : matching) {
                    OrderRow o = findOrder(p.idPedido);
                    out.add(rowMapper.mapRow(mockPaymentResultSet(p, o), 0));
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.PAGAMENTOS P") && normalized.contains("WHERE PED.ID_CLIENTE = ?")) {
                Long clientId = ((Number) args[0]).longValue();
                List<T> out = new ArrayList<>();
                for (PaymentRow p : payments) {
                    OrderRow o = findOrder(p.idPedido);
                    if (o != null && clientId.equals(o.idCliente)) {
                        out.add(rowMapper.mapRow(mockPaymentResultSet(p, o), 0));
                    }
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.PAGAMENTOS P") && normalized.contains("WHERE (A.ID_USUARIO = ? OR PED.ID_ARTISTA = ?)")) {
                Long artistId = ((Number) args[0]).longValue();
                List<T> out = new ArrayList<>();
                for (PaymentRow p : payments) {
                    OrderRow o = findOrder(p.idPedido);
                    if (o != null && artistId.equals(o.idArtista)) {
                        out.add(rowMapper.mapRow(mockPaymentResultSet(p, o), 0));
                    }
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.SEGUIDORES S") && normalized.contains("WHERE S.ID_SEGUINDO = ?")) {
                Long targetId = ((Number) args[0]).longValue();
                List<T> out = new ArrayList<>();
                for (FollowRow f : follows) {
                    if (f.idSeguindo.equals(targetId)) {
                        UserRow u = findUser(f.idSeguidor);
                        if (u != null) {
                            out.add(rowMapper.mapRow(mockFollowerResultSet(u), 0));
                        }
                    }
                }
                return out;
            }

            if (normalized.contains("FROM PUBLIC.SEGUIDORES S") && normalized.contains("WHERE S.ID_SEGUIDOR = ?")) {
                Long followerId = ((Number) args[0]).longValue();
                List<T> out = new ArrayList<>();
                for (FollowRow f : follows) {
                    if (f.idSeguidor.equals(followerId)) {
                        UserRow u = findUser(f.idSeguindo);
                        if (u != null) {
                            out.add(rowMapper.mapRow(mockFollowerResultSet(u), 0));
                        }
                    }
                }
                return out;
            }

            throw new UnsupportedOperationException("Unsupported query: " + sql);
        } catch (java.sql.SQLException ex) {
            throw new RuntimeException(ex);
        }
    }

    private UserRow findUser(Long id) {
        if (id == null) return null;
        return users.stream().filter(u -> u.idUsuario.equals(id)).findFirst().orElse(null);
    }

    private OrderRow findOrder(Long id) {
        if (id == null) return null;
        return orders.stream().filter(o -> o.idPedido.equals(id)).findFirst().orElse(null);
    }

    private ResultSet mockPaymentResultSet(PaymentRow p, OrderRow o) {
        UserRow c = o != null ? findUser(o.idCliente) : null;
        UserRow a = o != null ? findUser(o.idArtista) : null;
        Map<String, Object> cols = new HashMap<>();
        cols.put("gateway_payment_id", p.gatewayPaymentId);
        cols.put("id_pedido", p.idPedido);
        cols.put("metodo", p.metodo);
        cols.put("gateway_status", p.gatewayStatus);
        cols.put("status_pagamento", p.statusPagamento);
        cols.put("checkout_url", p.checkoutUrl);
        cols.put("pedido_valor", o != null ? o.valorTotal : BigDecimal.ZERO);
        cols.put("pedido_status", o != null ? o.statusComissao : "Pendente");
        cols.put("pedido_titulo", o != null ? o.titulo : "");
        cols.put("nome_cliente", c != null ? c.nome : null);
        cols.put("nome_artista", a != null ? a.nome : null);
        return mockResultSet(cols);
    }

    private ResultSet mockFollowerResultSet(UserRow u) {
        Map<String, Object> cols = new HashMap<>();
        cols.put("id_usuario", u.idUsuario);
        cols.put("nome_usuario", u.nomeUsuario);
        cols.put("nome", u.nome);
        cols.put("foto_perfil", u.fotoPerfil);
        cols.put("bio", u.bio);
        cols.put("is_artist", artists.containsKey(u.idUsuario));
        return mockResultSet(cols);
    }

    private ResultSet mockResultSet(Map<String, Object> values) {
        return (ResultSet) Proxy.newProxyInstance(
                ResultSet.class.getClassLoader(),
                new Class<?>[]{ResultSet.class},
                (proxy, method, args) -> {
                    String name = method.getName();
                    if (args != null && args.length == 1 && args[0] instanceof String col) {
                        Object val = values.get(col.toLowerCase(Locale.ROOT));
                        return switch (name) {
                            case "getString" -> val != null ? val.toString() : null;
                            case "getLong" -> val != null ? ((Number) val).longValue() : 0L;
                            case "getInt" -> val != null ? ((Number) val).intValue() : 0;
                            case "getBoolean" -> val != null && (Boolean) val;
                            case "getBigDecimal" -> (BigDecimal) val;
                            case "getDate" -> (Date) val;
                            case "getObject" -> val;
                            default -> val;
                        };
                    }
                    return null;
                }
        );
    }
}
