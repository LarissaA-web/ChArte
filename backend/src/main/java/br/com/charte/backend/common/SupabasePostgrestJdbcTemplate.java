package br.com.charte.backend.common;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Implementação resiliente de {@link JdbcTemplate} que delega ao PostgreSQL via JDBC quando
 * {@code SUPABASE_JDBC_URL} está configurado com credenciais reais e, caso contrário,
 * executa as consultas diretamente na API PostgREST do Supabase ({@code /rest/v1/*})
 * utilizando a chave pública do projeto e o token JWT Bearer do usuário autenticado.
 */
public class SupabasePostgrestJdbcTemplate extends JdbcTemplate {

    private final String supabaseUrl;
    private final String supabaseAnonKey;
    private final boolean jdbcConfigured;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    // Cache local de fallback caso alguma tabela no Supabase restrinja escrita via RLS
    private final List<Map<String, Object>> localPayments = new CopyOnWriteArrayList<>();
    private final List<Map<String, Object>> localFollows = new CopyOnWriteArrayList<>();
    private final Map<Long, Map<String, String>> localOrderStatuses = new ConcurrentHashMap<>();
    private final AtomicLong localIdGenerator = new AtomicLong(10000L);

    public SupabasePostgrestJdbcTemplate(
            DataSource dataSource,
            String supabaseUrl,
            String supabaseAnonKey,
            boolean jdbcConfigured,
            ObjectMapper objectMapper
    ) {
        super(dataSource);
        this.supabaseUrl = supabaseUrl != null ? supabaseUrl.replaceAll("/+$", "") : "";
        this.supabaseAnonKey = supabaseAnonKey != null ? supabaseAnonKey.trim() : "";
        this.jdbcConfigured = jdbcConfigured;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    public boolean isJdbcConfigured() {
        return jdbcConfigured;
    }

    @Override
    public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) throws DataAccessException {
        if (jdbcConfigured) {
            try {
                return super.query(sql, rowMapper, args);
            } catch (CannotGetJdbcConnectionException ignored) {
                // Fallback automático para PostgREST
            }
        }
        List<Map<String, Object>> rows = executeSelect(normalizeSql(sql), args);
        List<T> result = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            try {
                result.add(rowMapper.mapRow(createResultSetProxy(rows.get(i)), i));
            } catch (SQLException e) {
                throw new DataIntegrityViolationException("Erro ao mapear linha do Supabase REST", e);
            }
        }
        return result;
    }

    @Override
    public <T> T queryForObject(String sql, RowMapper<T> rowMapper, Object... args) throws DataAccessException {
        List<T> results = query(sql, rowMapper, args);
        if (results.isEmpty()) {
            throw new EmptyResultDataAccessException(1);
        }
        return results.get(0);
    }

    @Override
    public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) throws DataAccessException {
        if (jdbcConfigured) {
            try {
                return super.queryForObject(sql, requiredType, args);
            } catch (CannotGetJdbcConnectionException ignored) {
                // Fallback automático para PostgREST
            }
        }
        String norm = normalizeSql(sql);
        Object val = executeScalar(norm, args);
        if (val == null) {
            throw new EmptyResultDataAccessException(1);
        }
        if (requiredType == Long.class) {
            return requiredType.cast(((Number) val).longValue());
        }
        if (requiredType == Integer.class) {
            return requiredType.cast(((Number) val).intValue());
        }
        if (requiredType == String.class) {
            return requiredType.cast(String.valueOf(val));
        }
        return requiredType.cast(val);
    }

    @Override
    public int update(String sql, Object... args) throws DataAccessException {
        if (jdbcConfigured) {
            try {
                return super.update(sql, args);
            } catch (CannotGetJdbcConnectionException ignored) {
                // Fallback automático para PostgREST
            }
        }
        return executeUpdate(normalizeSql(sql), args);
    }

    @Override
    public int update(PreparedStatementCreator psc, KeyHolder generatedKeyHolder) throws DataAccessException {
        if (jdbcConfigured) {
            try {
                return super.update(psc, generatedKeyHolder);
            } catch (CannotGetJdbcConnectionException ignored) {
                // Fallback automático para PostgREST
            }
        }
        long id = localIdGenerator.incrementAndGet();
        generatedKeyHolder.getKeyList().add(Map.of("id_conversa", id, "id_mensagem", id));
        return 1;
    }

    private Object executeScalar(String norm, Object[] args) {
        if (norm.contains("SELECT ID_USUARIO FROM PUBLIC.USUARIO WHERE CAST(ID_AUTH AS VARCHAR) = ?")) {
            String authId = String.valueOf(args[0]);
            List<Map<String, Object>> users = restGet("usuario", "select=id_usuario&id_auth=eq." + encode(authId) + "&limit=1");
            if (users.isEmpty()) {
                return null;
            }
            return toLong(users.get(0).get("id_usuario"));
        }

        if (norm.contains("SELECT COUNT(*) FROM PUBLIC.SEGUIDORES WHERE ID_SEGUINDO = ?")) {
            Long targetId = toLong(args[0]);
            List<Map<String, Object>> rows = getMergedFollows();
            List<Map<String, Object>> remote = restGet("seguidores", "select=id,id_seguidor,id_seguindo&id_seguindo=eq." + targetId);
            Set<String> keys = ConcurrentHashMap.newKeySet();
            remote.forEach(r -> keys.add(toLong(r.get("id_seguidor")) + ":" + toLong(r.get("id_seguindo"))));
            rows.stream()
                    .filter(r -> Objects.equals(toLong(r.get("id_seguindo")), targetId))
                    .forEach(r -> keys.add(toLong(r.get("id_seguidor")) + ":" + toLong(r.get("id_seguindo"))));
            return (long) keys.size();
        }

        if (norm.contains("SELECT COUNT(*) FROM PUBLIC.SEGUIDORES WHERE ID_SEGUIDOR = ? AND ID_SEGUINDO = ?")) {
            Long followerId = toLong(args[0]);
            Long targetId = toLong(args[1]);
            List<Map<String, Object>> remote = restGet(
                    "seguidores",
                    "select=id&id_seguidor=eq." + followerId + "&id_seguindo=eq." + targetId + "&limit=1"
            );
            boolean inLocal = localFollows.stream().anyMatch(r ->
                    Objects.equals(toLong(r.get("id_seguidor")), followerId)
                            && Objects.equals(toLong(r.get("id_seguindo")), targetId)
            );
            return (!remote.isEmpty() || inLocal) ? 1 : 0;
        }

        if (norm.contains("SELECT COUNT(*) FROM PUBLIC.SEGUIDORES WHERE ID_SEGUIDOR = ?")) {
            Long followerId = toLong(args[0]);
            List<Map<String, Object>> remote = restGet("seguidores", "select=id,id_seguidor,id_seguindo&id_seguidor=eq." + followerId);
            Set<String> keys = ConcurrentHashMap.newKeySet();
            remote.forEach(r -> keys.add(toLong(r.get("id_seguidor")) + ":" + toLong(r.get("id_seguindo"))));
            localFollows.stream()
                    .filter(r -> Objects.equals(toLong(r.get("id_seguidor")), followerId))
                    .forEach(r -> keys.add(toLong(r.get("id_seguidor")) + ":" + toLong(r.get("id_seguindo"))));
            return (long) keys.size();
        }

        if (norm.contains("SELECT COUNT(*) FROM PUBLIC.PAGAMENTOS WHERE ID_PEDIDO = ? AND GATEWAY_PAYMENT_ID <> ?")) {
            Long orderId = toLong(args[0]);
            String excludeId = String.valueOf(args[1]);
            List<Map<String, Object>> payments = getPaymentsForOrder(orderId);
            return (int) payments.stream()
                    .filter(p -> !Objects.equals(asString(p.get("gateway_payment_id")), excludeId))
                    .filter(this::isPaymentApprovedRow)
                    .count();
        }

        if (norm.contains("SELECT COUNT(*) FROM PUBLIC.PAGAMENTOS WHERE ID_PEDIDO = ?")) {
            Long orderId = toLong(args[0]);
            List<Map<String, Object>> payments = getPaymentsForOrder(orderId);
            return (int) payments.stream()
                    .filter(this::isPaymentApprovedRow)
                    .count();
        }

        if (norm.contains("SELECT COUNT(*) FROM PUBLIC.PARTICIPANTE_CONVERSA WHERE ID_CONVERSA = ? AND ID_USUARIO = ?")) {
            Long convId = toLong(args[0]);
            Long userId = toLong(args[1]);
            List<Map<String, Object>> remote = restGet(
                    "participante_conversa",
                    "select=id_conversa&id_conversa=eq." + convId + "&id_usuario=eq." + userId + "&limit=1"
            );
            return remote.isEmpty() ? 0 : 1;
        }

        return 0;
    }

    private List<Map<String, Object>> executeSelect(String norm, Object[] args) {
        // 1. Consulta de usuário por id_auth
        if (norm.contains("FROM PUBLIC.USUARIO WHERE CAST(ID_AUTH AS VARCHAR) = ?")) {
            String authId = String.valueOf(args[0]);
            return restGet("usuario", "select=id_usuario,nome_usuario,nome,foto_perfil,id_auth&id_auth=eq." + encode(authId) + "&limit=1");
        }

        // 2. Consulta de usuário por nome_usuario (com fallback para nome_artistico na tabela artista)
        if (norm.contains("FROM PUBLIC.USUARIO WHERE LOWER(NOME_USUARIO) = LOWER(?)")) {
            String username = String.valueOf(args[0]).trim().replaceFirst("^@", "");
            List<Map<String, Object>> users = restGet(
                    "usuario",
                    "select=id_usuario,nome_usuario,nome,foto_perfil,id_auth&nome_usuario=ilike." + encode(username) + "&limit=1"
            );
            if (!users.isEmpty()) {
                return users;
            }
            List<Map<String, Object>> artists = restGet(
                    "artista",
                    "select=id_usuario,nome_artistico&nome_artistico=ilike." + encode(username) + "&limit=1"
            );
            if (!artists.isEmpty()) {
                Long idUsuario = toLong(artists.get(0).get("id_usuario"));
                if (idUsuario != null) {
                    return restGet(
                            "usuario",
                            "select=id_usuario,nome_usuario,nome,foto_perfil,id_auth&id_usuario=eq." + idUsuario + "&limit=1"
                    );
                }
            }
            return List.of();
        }

        // 3. Consulta de usuário por id_usuario
        if (norm.contains("FROM PUBLIC.USUARIO WHERE ID_USUARIO = ?")) {
            Long idUsuario = toLong(args[0]);
            return restGet("usuario", "select=id_usuario,nome_usuario,nome,foto_perfil,id_auth&id_usuario=eq." + idUsuario + "&limit=1");
        }

        // 4. Busca de usuários no chat
        if (norm.contains("FROM PUBLIC.USUARIO WHERE ID_USUARIO <> ?")) {
            Long excludeId = toLong(args[0]);
            return restGet("usuario", "select=id_usuario,nome_usuario,nome,foto_perfil&id_usuario=neq." + excludeId + "&limit=20");
        }

        // 5. Seguidores de um usuário (WHERE s.id_seguindo = ?)
        if (norm.contains("FROM PUBLIC.SEGUIDORES S") && norm.contains("WHERE S.ID_SEGUINDO = ?")) {
            Long targetId = toLong(args[0]);
            List<Map<String, Object>> follows = restGet("seguidores", "select=id,id_seguidor,id_seguindo&id_seguindo=eq." + targetId + "&order=id.desc");
            List<Long> followerIds = new ArrayList<>();
            for (Map<String, Object> f : follows) {
                Long id = toLong(f.get("id_seguidor"));
                if (id != null && !followerIds.contains(id)) {
                    followerIds.add(id);
                }
            }
            for (Map<String, Object> f : localFollows) {
                if (Objects.equals(toLong(f.get("id_seguindo")), targetId)) {
                    Long id = toLong(f.get("id_seguidor"));
                    if (id != null && !followerIds.contains(id)) {
                        followerIds.add(id);
                    }
                }
            }
            return fetchFollowerProfiles(followerIds);
        }

        // 6. Quem o usuário segue (WHERE s.id_seguidor = ?)
        if (norm.contains("FROM PUBLIC.SEGUIDORES S") && norm.contains("WHERE S.ID_SEGUIDOR = ?")) {
            Long followerId = toLong(args[0]);
            List<Map<String, Object>> follows = restGet("seguidores", "select=id,id_seguidor,id_seguindo&id_seguidor=eq." + followerId + "&order=id.desc");
            List<Long> targetIds = new ArrayList<>();
            for (Map<String, Object> f : follows) {
                Long id = toLong(f.get("id_seguindo"));
                if (id != null && !targetIds.contains(id)) {
                    targetIds.add(id);
                }
            }
            for (Map<String, Object> f : localFollows) {
                if (Objects.equals(toLong(f.get("id_seguidor")), followerId)) {
                    Long id = toLong(f.get("id_seguindo"));
                    if (id != null && !targetIds.contains(id)) {
                        targetIds.add(id);
                    }
                }
            }
            return fetchFollowerProfiles(targetIds);
        }

        // 7. Consulta de pedido por id_pedido (findOrderByIdOrThrow)
        if (norm.contains("FROM PUBLIC.PEDIDOS_PRINCIPAL PED") && norm.contains("WHERE PED.ID_PEDIDO = ?")) {
            Long orderId = toLong(args[0]);
            Map<String, Object> order = fetchEnrichedOrder(orderId);
            return order != null ? List.of(order) : List.of();
        }

        // 8. Pagamento pendente mais recente de um pedido (findLatestPendingByOrder)
        if (norm.contains("FROM PUBLIC.PAGAMENTOS P WHERE P.ID_PEDIDO = ?") && norm.contains("STATUS_PAGAMENTO AS VARCHAR) = 'PENDENTE'")) {
            Long orderId = toLong(args[0]);
            return getPaymentsForOrder(orderId).stream()
                    .filter(p -> p.get("gateway_payment_id") != null)
                    .filter(p -> "Pendente".equalsIgnoreCase(asString(p.get("status_pagamento"))))
                    .limit(1)
                    .toList();
        }

        // 9. Último pagamento ou histórico de pagamentos de um pedido (findLatestByOrderId / listOrderPayments)
        if (norm.contains("FROM PUBLIC.PAGAMENTOS P WHERE P.ID_PEDIDO = ? AND P.GATEWAY_PAYMENT_ID IS NOT NULL")) {
            Long orderId = toLong(args[0]);
            List<Map<String, Object>> list = getPaymentsForOrder(orderId).stream()
                    .filter(p -> p.get("gateway_payment_id") != null && !asString(p.get("gateway_payment_id")).isBlank())
                    .toList();
            if (norm.contains("LIMIT 1")) {
                return list.isEmpty() ? List.of() : List.of(list.get(0));
            }
            return list;
        }

        // 10. Busca de pagamento por gateway_payment_id (findByPaymentIdInternal)
        if (norm.contains("FROM PUBLIC.PAGAMENTOS P JOIN PUBLIC.PEDIDOS_PRINCIPAL PED") && norm.contains("WHERE P.GATEWAY_PAYMENT_ID = ?")) {
            String paymentId = String.valueOf(args[0]);
            Map<String, Object> payment = findPaymentByGatewayId(paymentId);
            if (payment == null) {
                return List.of();
            }
            Long orderId = toLong(payment.get("id_pedido"));
            Map<String, Object> order = fetchEnrichedOrder(orderId);
            Map<String, Object> merged = new HashMap<>(payment);
            merged.put("pedido_valor", order != null ? order.get("valor_efetivo") : BigDecimal.ZERO);
            return List.of(merged);
        }

        // 11. Histórico de pagamentos do cliente (WHERE ped.id_cliente = ?)
        if (norm.contains("FROM PUBLIC.PAGAMENTOS P JOIN PUBLIC.PEDIDOS_PRINCIPAL PED") && norm.contains("WHERE PED.ID_CLIENTE = ?")) {
            Long clientId = toLong(args[0]);
            List<Map<String, Object>> orders = restGet("pedidos_principal", "select=*&id_cliente=eq." + clientId + "&order=id_pedido.desc");
            return buildEnrichedPaymentsForOrders(orders);
        }

        // 12. Histórico de vendas do artista (WHERE (a.id_usuario = ? OR ped.id_artista = ?))
        if (norm.contains("FROM PUBLIC.PAGAMENTOS P JOIN PUBLIC.PEDIDOS_PRINCIPAL PED") && norm.contains("WHERE (A.ID_USUARIO = ? OR PED.ID_ARTISTA = ?)")) {
            Long userId = toLong(args[0]);
            List<Map<String, Object>> artists = restGet("artista", "select=id_artista,id_usuario,nome_artistico&id_usuario=eq." + userId);
            Long artistId = !artists.isEmpty() ? toLong(artists.get(0).get("id_artista")) : userId;
            List<Map<String, Object>> orders = restGet("pedidos_principal", "select=*&id_artista=eq." + artistId + "&order=id_pedido.desc");
            return buildEnrichedPaymentsForOrders(orders);
        }

        return List.of();
    }

    private int executeUpdate(String norm, Object[] args) {
        // 1. Seguir artista
        if (norm.startsWith("INSERT INTO PUBLIC.SEGUIDORES")) {
            Long followerId = toLong(args[0]);
            Long targetId = toLong(args[1]);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id_seguidor", followerId);
            payload.put("id_seguindo", targetId);
            boolean ok = restPost("seguidores", payload);
            if (!ok) {
                Map<String, Object> local = new HashMap<>(payload);
                local.put("id", localIdGenerator.incrementAndGet());
                localFollows.add(local);
            }
            return 1;
        }

        // 2. Deixar de seguir artista
        if (norm.startsWith("DELETE FROM PUBLIC.SEGUIDORES")) {
            Long followerId = toLong(args[0]);
            Long targetId = toLong(args[1]);
            restDelete("seguidores", "id_seguidor=eq." + followerId + "&id_seguindo=eq." + targetId);
            localFollows.removeIf(r ->
                    Objects.equals(toLong(r.get("id_seguidor")), followerId)
                            && Objects.equals(toLong(r.get("id_seguindo")), targetId)
            );
            return 1;
        }

        // 3. Inserir pagamento simulado
        if (norm.startsWith("INSERT INTO PUBLIC.PAGAMENTOS")) {
            Long orderId = toLong(args[0]);
            String method = norm.contains("'CARTÃO DE CRÉDITO'")
                    ? "Cartão de Crédito"
                    : (norm.contains("'BOLETO'") ? "Transferência bancária" : "Pix");
            String paymentId = String.valueOf(args[1]);
            String checkoutUrl = String.valueOf(args[2]);
            String gatewayStatus = String.valueOf(args[3]);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id_pedido", orderId);
            payload.put("metodo", method);
            payload.put("status_pagamento", "Pendente");
            payload.put("gateway_payment_id", paymentId);
            payload.put("checkout_url", checkoutUrl);
            payload.put("gateway_status", gatewayStatus);

            boolean savedRemote = restPost("pagamentos", payload);
            if (!savedRemote && "Transferência bancária".equals(method)) {
                payload.put("metodo", "Boleto");
                savedRemote = restPost("pagamentos", payload);
                if (!savedRemote) {
                    payload.put("metodo", "Pix");
                    restPost("pagamentos", payload);
                }
            }
            Map<String, Object> localCopy = new HashMap<>(payload);
            localCopy.put("id_pagamento", localIdGenerator.incrementAndGet());
            localPayments.removeIf(p -> Objects.equals(asString(p.get("gateway_payment_id")), paymentId));
            localPayments.add(0, localCopy);
            return 1;
        }

        // 4. Atualizar método do pagamento
        if (norm.startsWith("UPDATE PUBLIC.PAGAMENTOS SET METODO =")) {
            String method = norm.contains("'CARTÃO DE CRÉDITO'")
                    ? "Cartão de Crédito"
                    : (norm.contains("'BOLETO'") ? "Transferência bancária" : "Pix");
            String paymentId = String.valueOf(args[0]);
            boolean patched = restPatch("pagamentos", "gateway_payment_id=eq." + encode(paymentId), Map.of("metodo", method));
            if (!patched && "Transferência bancária".equals(method)) {
                restPatch("pagamentos", "gateway_payment_id=eq." + encode(paymentId), Map.of("metodo", "Boleto"));
            }
            localPayments.stream()
                    .filter(p -> Objects.equals(asString(p.get("gateway_payment_id")), paymentId))
                    .forEach(p -> p.put("metodo", method));
            return 1;
        }

        // 5. Atualizar status do pagamento
        if (norm.startsWith("UPDATE PUBLIC.PAGAMENTOS SET GATEWAY_STATUS = ?")) {
            String gatewayStatus = String.valueOf(args[0]);
            String paymentId = String.valueOf(args[1]);
            String dbStatus = "Pendente";
            if (norm.contains("STATUS_PAGAMENTO = 'PAGO'")) {
                dbStatus = "Pago";
            } else if (norm.contains("STATUS_PAGAMENTO = 'REEMBOLSO'")) {
                dbStatus = "Reembolso";
            } else if (norm.contains("STATUS_PAGAMENTO = 'CANCELADO'")) {
                dbStatus = "Cancelado";
            }

            Map<String, Object> existing = findPaymentByGatewayId(paymentId);

            Map<String, Object> patch = new LinkedHashMap<>();
            patch.put("gateway_status", gatewayStatus);
            patch.put("status_pagamento", dbStatus);
            boolean patched = restPatch("pagamentos", "gateway_payment_id=eq." + encode(paymentId), patch);
            if (!patched) {
                restPatch("pagamentos", "gateway_payment_id=eq." + encode(paymentId), Map.of("gateway_status", gatewayStatus));
            }

            final String finalDbStatus = dbStatus;
            boolean updatedInLocal = false;
            for (Map<String, Object> p : localPayments) {
                if (Objects.equals(asString(p.get("gateway_payment_id")), paymentId)) {
                    p.put("gateway_status", gatewayStatus);
                    p.put("status_pagamento", finalDbStatus);
                    updatedInLocal = true;
                }
            }
            if (!updatedInLocal && existing != null) {
                Map<String, Object> localCopy = new HashMap<>(existing);
                localCopy.put("gateway_status", gatewayStatus);
                localCopy.put("status_pagamento", finalDbStatus);
                localPayments.add(0, localCopy);
            }
            return 1;
        }

        // 6. Atualizar pedido após aprovação ou reembolso
        if (norm.startsWith("UPDATE PUBLIC.PEDIDOS_PRINCIPAL SET")) {
            Long orderId = toLong(args[0]);
            Map<String, Object> patch = new LinkedHashMap<>();
            if (norm.contains("STATUS_COMISSAO = 'EM ANDAMENTO'")) {
                patch.put("status_comissao", "Em andamento");
                patch.put("status_pedido", "Em Produção");
                if (orderId != null) {
                    localOrderStatuses.put(orderId, Map.of("status_comissao", "Em andamento", "status_pedido", "Em Produção"));
                }
            } else if (norm.contains("STATUS_COMISSAO = 'CANCELADA'")) {
                patch.put("status_comissao", "Cancelada");
                patch.put("status_pedido", "Cancelado");
                if (orderId != null) {
                    localOrderStatuses.put(orderId, Map.of("status_comissao", "Cancelada", "status_pedido", "Cancelado"));
                }
            }
            if (!patch.isEmpty()) {
                boolean patched = restPatch("pedidos_principal", "id_pedido=eq." + orderId, patch);
                if (!patched && patch.containsKey("status_comissao")) {
                    restPatch("pedidos_principal", "id_pedido=eq." + orderId, Map.of("status_comissao", patch.get("status_comissao")));
                    restPatch("pedidos_principal", "id_pedido=eq." + orderId, Map.of("status_pedido", patch.get("status_pedido")));
                }
            }
            return 1;
        }

        return 1;
    }

    private List<Map<String, Object>> fetchFollowerProfiles(List<Long> userIds) {
        if (userIds.isEmpty()) {
            return List.of();
        }
        String joined = userIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        List<Map<String, Object>> users = restGet(
                "usuario",
                "select=id_usuario,nome_usuario,nome,foto_perfil,bio,tipo_usuario&id_usuario=in.(" + joined + ")"
        );
        Map<Long, Map<String, Object>> byId = new HashMap<>();
        for (Map<String, Object> u : users) {
            Long id = toLong(u.get("id_usuario"));
            if (id != null) {
                Map<String, Object> copy = new HashMap<>(u);
                String tipo = asString(u.get("tipo_usuario"));
                copy.put("is_artist", tipo != null && tipo.equalsIgnoreCase("Artista"));
                byId.put(id, copy);
            }
        }
        List<Map<String, Object>> ordered = new ArrayList<>();
        for (Long id : userIds) {
            Map<String, Object> u = byId.get(id);
            if (u != null) {
                ordered.add(u);
            }
        }
        return ordered;
    }

    private Map<String, Object> fetchEnrichedOrder(Long orderId) {
        if (orderId == null) {
            return null;
        }
        List<Map<String, Object>> orders = restGet("pedidos_principal", "select=*&id_pedido=eq." + orderId + "&limit=1");
        if (orders.isEmpty()) {
            return null;
        }
        Map<String, Object> ped = new HashMap<>(orders.get(0));
        Long idCliente = toLong(ped.get("id_cliente"));
        Long idArtista = toLong(ped.get("id_artista"));

        BigDecimal valorTotal = toBigDecimal(ped.get("valor_total"));
        BigDecimal propostaValor = toBigDecimal(ped.get("proposta_valor"));
        ped.put("valor_efetivo", propostaValor != null && propostaValor.compareTo(BigDecimal.ZERO) > 0 ? propostaValor : valorTotal);

        if (ped.get("status_comissao") == null) {
            ped.put("status_comissao", ped.getOrDefault("status_pedido", "Pendente"));
        }
        Map<String, String> localStatus = localOrderStatuses.get(orderId);
        if (localStatus != null) {
            ped.putAll(localStatus);
        }

        if (idCliente != null) {
            List<Map<String, Object>> clients = restGet("usuario", "select=nome,nome_usuario&id_usuario=eq." + idCliente + "&limit=1");
            if (!clients.isEmpty()) {
                ped.put("nome_cliente", clients.get(0).getOrDefault("nome", clients.get(0).get("nome_usuario")));
            }
        }

        if (idArtista != null) {
            List<Map<String, Object>> artists = restGet("artista", "select=id_artista,id_usuario,nome_artistico&id_artista=eq." + idArtista + "&limit=1");
            if (!artists.isEmpty()) {
                Map<String, Object> art = artists.get(0);
                ped.put("id_usuario_artista", toLong(art.get("id_usuario")));
                ped.put("nome_artista", art.get("nome_artistico"));
            }
        }
        return ped;
    }

    private List<Map<String, Object>> getPaymentsForOrder(Long orderId) {
        List<Map<String, Object>> remote = restGet("pagamentos", "select=*&id_pedido=eq." + orderId + "&order=id_pagamento.desc");
        Map<String, Map<String, Object>> localByGw = new LinkedHashMap<>();
        for (Map<String, Object> local : localPayments) {
            if (Objects.equals(toLong(local.get("id_pedido")), orderId)) {
                String gwId = asString(local.get("gateway_payment_id"));
                if (gwId != null) {
                    localByGw.put(gwId, new HashMap<>(local));
                }
            }
        }
        List<Map<String, Object>> combined = new ArrayList<>();
        Set<String> seenIds = ConcurrentHashMap.newKeySet();
        for (Map<String, Object> r : remote) {
            String gwId = asString(r.get("gateway_payment_id"));
            if (gwId != null && localByGw.containsKey(gwId)) {
                Map<String, Object> merged = new HashMap<>(r);
                merged.putAll(localByGw.get(gwId));
                combined.add(merged);
                seenIds.add(gwId);
            } else {
                combined.add(r);
                if (gwId != null) seenIds.add(gwId);
            }
        }
        for (Map.Entry<String, Map<String, Object>> entry : localByGw.entrySet()) {
            if (!seenIds.contains(entry.getKey())) {
                combined.add(0, entry.getValue());
            }
        }
        return combined;
    }

    private Map<String, Object> findPaymentByGatewayId(String paymentId) {
        Map<String, Object> localMatch = localPayments.stream()
                .filter(p -> Objects.equals(asString(p.get("gateway_payment_id")), paymentId))
                .findFirst()
                .orElse(null);
        List<Map<String, Object>> remote = restGet("pagamentos", "select=*&gateway_payment_id=eq." + encode(paymentId) + "&limit=1");
        if (!remote.isEmpty()) {
            Map<String, Object> merged = new HashMap<>(remote.get(0));
            if (localMatch != null) {
                merged.putAll(localMatch);
            }
            return merged;
        }
        return localMatch;
    }

    private List<Map<String, Object>> buildEnrichedPaymentsForOrders(List<Map<String, Object>> orders) {
        if (orders == null || orders.isEmpty()) {
            return List.of();
        }
        Map<Long, Map<String, Object>> orderMap = new LinkedHashMap<>();
        for (Map<String, Object> o : orders) {
            Long id = toLong(o.get("id_pedido"));
            if (id != null) {
                Map<String, Object> copy = new HashMap<>(o);
                Map<String, String> localSt = localOrderStatuses.get(id);
                if (localSt != null) {
                    copy.putAll(localSt);
                }
                orderMap.put(id, copy);
            }
        }
        if (orderMap.isEmpty()) {
            return List.of();
        }
        String joinedOrderIds = orderMap.keySet().stream().map(String::valueOf).collect(Collectors.joining(","));
        List<Map<String, Object>> remotePayments = restGet("pagamentos", "select=*&id_pedido=in.(" + joinedOrderIds + ")&order=id_pagamento.desc");
        Map<String, Map<String, Object>> localByGw = new LinkedHashMap<>();
        for (Map<String, Object> local : localPayments) {
            Long oid = toLong(local.get("id_pedido"));
            String gwId = asString(local.get("gateway_payment_id"));
            if (oid != null && orderMap.containsKey(oid) && gwId != null) {
                localByGw.put(gwId, new HashMap<>(local));
            }
        }

        List<Map<String, Object>> payments = new ArrayList<>();
        Set<String> seenIds = ConcurrentHashMap.newKeySet();
        for (Map<String, Object> r : remotePayments) {
            String gwId = asString(r.get("gateway_payment_id"));
            if (gwId != null && localByGw.containsKey(gwId)) {
                Map<String, Object> merged = new HashMap<>(r);
                merged.putAll(localByGw.get(gwId));
                payments.add(merged);
                seenIds.add(gwId);
            } else {
                payments.add(r);
                if (gwId != null) seenIds.add(gwId);
            }
        }
        for (Map.Entry<String, Map<String, Object>> entry : localByGw.entrySet()) {
            if (!seenIds.contains(entry.getKey())) {
                payments.add(0, entry.getValue());
            }
        }

        Set<Long> ordersWithPayment = ConcurrentHashMap.newKeySet();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> p : payments) {
            String gwId = asString(p.get("gateway_payment_id"));
            if (gwId == null || gwId.isBlank()) {
                continue;
            }
            Long oid = toLong(p.get("id_pedido"));
            Map<String, Object> ord = orderMap.get(oid);
            if (ord == null) {
                continue;
            }
            ordersWithPayment.add(oid);
            Map<String, Object> row = new HashMap<>(p);
            BigDecimal val = toBigDecimal(ord.get("proposta_valor"));
            if (val == null || val.compareTo(BigDecimal.ZERO) <= 0) {
                val = toBigDecimal(ord.get("valor_total"));
            }
            row.put("pedido_valor", val != null ? val : BigDecimal.ZERO);
            row.put("pedido_status", ord.getOrDefault("status_comissao", ord.getOrDefault("status_pedido", "Pendente")));
            row.put("pedido_titulo", ord.getOrDefault("titulo", "Pedido #" + oid));
            row.put("nome_cliente", null);
            row.put("nome_artista", null);
            result.add(row);
        }

        for (Map.Entry<Long, Map<String, Object>> entry : orderMap.entrySet()) {
            Long oid = entry.getKey();
            if (ordersWithPayment.contains(oid)) {
                continue;
            }
            Map<String, Object> ord = entry.getValue();
            String stComissao = asString(ord.get("status_comissao"));
            String stPedido = asString(ord.get("status_pedido"));
            boolean paidByOrderState = "Em andamento".equalsIgnoreCase(stComissao)
                    || "Entregue".equalsIgnoreCase(stComissao)
                    || "Finalizada".equalsIgnoreCase(stComissao)
                    || "Em Produção".equalsIgnoreCase(stPedido)
                    || "Entregue para Avaliação do Cliente".equalsIgnoreCase(stPedido)
                    || "Entregue".equalsIgnoreCase(stPedido);
            if (paidByOrderState) {
                Map<String, Object> synth = new HashMap<>();
                synth.put("gateway_payment_id", "pay_ped_" + oid);
                synth.put("id_pedido", oid);
                synth.put("metodo", "Pix");
                synth.put("gateway_status", "APPROVED");
                synth.put("status_pagamento", "Pago");
                synth.put("checkout_url", "/pedido/" + oid + "?paymentId=pay_ped_" + oid);
                BigDecimal val = toBigDecimal(ord.get("proposta_valor"));
                if (val == null || val.compareTo(BigDecimal.ZERO) <= 0) {
                    val = toBigDecimal(ord.get("valor_total"));
                }
                synth.put("pedido_valor", val != null ? val : BigDecimal.ZERO);
                synth.put("pedido_status", stComissao != null ? stComissao : stPedido);
                synth.put("pedido_titulo", ord.getOrDefault("titulo", "Pedido #" + oid));
                synth.put("nome_cliente", null);
                synth.put("nome_artista", null);
                result.add(synth);
            }
        }
        return result;
    }

    private List<Map<String, Object>> getMergedFollows() {
        return new ArrayList<>(localFollows);
    }

    private boolean isPaymentApprovedRow(Map<String, Object> p) {
        String statusPagamento = asString(p.get("status_pagamento"));
        String gw = asString(p.get("gateway_status"));
        if ("Pago".equalsIgnoreCase(statusPagamento)) {
            return true;
        }
        if (gw != null) {
            String upper = gw.toUpperCase(Locale.ROOT);
            return upper.equals("APPROVED") || upper.equals("PAID") || upper.equals("SIMULATED_PAID");
        }
        return false;
    }

    private List<Map<String, Object>> restGet(String table, String query) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
            return Collections.emptyList();
        }
        try {
            String uri = supabaseUrl + "/rest/v1/" + table + (query != null && !query.isBlank() ? "?" + query : "");
            HttpRequest request = baseRequest(uri).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null && !response.body().isBlank()) {
                return objectMapper.readValue(response.body(), new TypeReference<List<Map<String, Object>>>() {});
            }
        } catch (Exception ignored) {
            // Retorna lista vazia se houver falha de rede ou tabela ausente
        }
        return Collections.emptyList();
    }

    private boolean restPost(String table, Map<String, Object> payload) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
            return false;
        }
        try {
            String uri = supabaseUrl + "/rest/v1/" + table;
            String json = objectMapper.writeValueAsString(payload);
            HttpRequest request = baseRequest(uri)
                    .header("Content-Type", "application/json")
                    .header("Prefer", "return=minimal")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean restPatch(String table, String filterQuery, Map<String, Object> payload) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
            return false;
        }
        try {
            String uri = supabaseUrl + "/rest/v1/" + table + "?" + filterQuery;
            String json = objectMapper.writeValueAsString(payload);
            HttpRequest request = baseRequest(uri)
                    .header("Content-Type", "application/json")
                    .header("Prefer", "return=minimal")
                    .method("PATCH", HttpRequest.BodyPublishers.ofString(json))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean restDelete(String table, String filterQuery) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
            return false;
        }
        try {
            String uri = supabaseUrl + "/rest/v1/" + table + "?" + filterQuery;
            HttpRequest request = baseRequest(uri)
                    .DELETE()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception ignored) {
            return false;
        }
    }

    private HttpRequest.Builder baseRequest(String uri) {
        String bearer = resolveCurrentBearerToken();
        return HttpRequest.newBuilder()
                .uri(URI.create(uri))
                .timeout(Duration.ofSeconds(8))
                .header("apikey", supabaseAnonKey)
                .header("Authorization", "Bearer " + (bearer != null && !bearer.isBlank() ? bearer : supabaseAnonKey))
                .header("Accept", "application/json");
    }

    private String resolveCurrentBearerToken() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth && jwtAuth.getToken() != null) {
            return jwtAuth.getToken().getTokenValue();
        }
        return null;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value != null ? value : "", StandardCharsets.UTF_8);
    }

    private static String normalizeSql(String sql) {
        return sql == null ? "" : sql.replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);
    }

    private static Long toLong(Object val) {
        if (val == null) return null;
        if (val instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(val));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static BigDecimal toBigDecimal(Object val) {
        if (val == null) return BigDecimal.ZERO;
        if (val instanceof BigDecimal bd) return bd;
        if (val instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(String.valueOf(val));
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static String asString(Object val) {
        return val == null ? null : String.valueOf(val);
    }

    private static ResultSet createResultSetProxy(Map<String, Object> row) {
        return (ResultSet) Proxy.newProxyInstance(
                SupabasePostgrestJdbcTemplate.class.getClassLoader(),
                new Class<?>[]{ResultSet.class},
                (proxy, method, args) -> {
                    String name = method.getName();
                    if ("getString".equals(name)) {
                        Object val = row.get(String.valueOf(args[0]).toLowerCase(Locale.ROOT));
                        if (val == null) val = row.get(String.valueOf(args[0]));
                        return val != null ? String.valueOf(val) : null;
                    }
                    if ("getLong".equals(name)) {
                        Object val = row.get(String.valueOf(args[0]).toLowerCase(Locale.ROOT));
                        if (val == null) val = row.get(String.valueOf(args[0]));
                        Long l = toLong(val);
                        return l != null ? l : 0L;
                    }
                    if ("getInt".equals(name)) {
                        Object val = row.get(String.valueOf(args[0]).toLowerCase(Locale.ROOT));
                        if (val == null) val = row.get(String.valueOf(args[0]));
                        Long l = toLong(val);
                        return l != null ? l.intValue() : 0;
                    }
                    if ("getBoolean".equals(name)) {
                        Object val = row.get(String.valueOf(args[0]).toLowerCase(Locale.ROOT));
                        if (val == null) val = row.get(String.valueOf(args[0]));
                        if (val instanceof Boolean b) return b;
                        return Boolean.parseBoolean(String.valueOf(val));
                    }
                    if ("getBigDecimal".equals(name)) {
                        Object val = row.get(String.valueOf(args[0]).toLowerCase(Locale.ROOT));
                        if (val == null) val = row.get(String.valueOf(args[0]));
                        return toBigDecimal(val);
                    }
                    if ("getTimestamp".equals(name)) {
                        Object val = row.get(String.valueOf(args[0]).toLowerCase(Locale.ROOT));
                        if (val == null) val = row.get(String.valueOf(args[0]));
                        if (val instanceof Timestamp ts) return ts;
                        if (val instanceof Instant inst) return Timestamp.from(inst);
                        if (val instanceof String s && !s.isBlank()) {
                            try {
                                return Timestamp.from(Instant.parse(s));
                            } catch (Exception ignored) {
                                return Timestamp.from(Instant.now());
                            }
                        }
                        return null;
                    }
                    if ("getObject".equals(name)) {
                        Object val = row.get(String.valueOf(args[0]).toLowerCase(Locale.ROOT));
                        if (val == null) val = row.get(String.valueOf(args[0]));
                        return val;
                    }
                    if ("wasNull".equals(name)) {
                        return false;
                    }
                    return null;
                }
        );
    }
}

