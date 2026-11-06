package br.com.charte.backend.commission;

import br.com.charte.backend.common.AuthenticatedUserService;
import br.com.charte.backend.common.SupabasePostgrestJdbcTemplate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CommissionDeliveryService {

    private static final String DELIVERY_PATH_PATTERN = "^[1-9][0-9]*/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\\.(png|jpg|jpeg|webp)$";

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String supabaseUrl;
    private final String supabaseAnonKey;

    public CommissionDeliveryService(
            JdbcTemplate jdbcTemplate,
            AuthenticatedUserService authenticatedUserService,
            ObjectMapper objectMapper,
            @Value("${charte.supabase.url}") String supabaseUrl,
            @Value("${charte.supabase.anon-key:}") String supabaseAnonKey
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
        this.objectMapper = objectMapper;
        this.supabaseUrl = supabaseUrl == null ? "" : supabaseUrl.replaceAll("/+$", "");
        this.supabaseAnonKey = supabaseAnonKey == null ? "" : supabaseAnonKey;
        this.httpClient = HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(5)).build();
    }

    public record DeliveryOrder(
            Long id,
            Long artistUserId,
            String status,
            boolean paid,
            String title,
            String deadline,
            String optionTitle
    ) {}

    @Transactional
    public CommissionDeliveryApi.DeliveryResponse registerDelivery(
            Long orderId,
            String objectPath,
            String message,
            String authId
    ) {
        requireJdbcMode();
        if (orderId == null || orderId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Número do pedido inválido");
        }

        var account = authenticatedUserService.requireUserByAuthId(authId);
        validateObjectPath(orderId, authId, objectPath);
        String safeMessage = message == null ? "" : message.trim();
        if (safeMessage.length() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A mensagem excede o limite permitido");
        }

        DeliveryOrder order = findOrder(orderId);
        if (!account.idUsuario().equals(order.artistUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Somente o artista responsável pode enviar esta comissão");
        }
        if (isReadyArtPurchase(order)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pedido não é uma comissão");
        }
        if (!order.paid()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O pagamento ainda não foi confirmado");
        }
        if (!"Pendente".equals(order.status()) && !"Em andamento".equals(order.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pedido não está aguardando uma entrega");
        }

        int updated = jdbcTemplate.update(
                """
                UPDATE public.pedidos_principal p
                SET status_comissao = 'Entregue',
                    status_pedido = 'Entregue para Avaliação do Cliente',
                    referencias = COALESCE(
                        (
                            SELECT array_agg(ref)
                            FROM unnest(COALESCE(p.referencias, ARRAY[]::text[])) AS existing(ref)
                            WHERE ref NOT LIKE 'ENTREGA_ARQUIVO::%'
                              AND ref NOT LIKE 'ENTREGA_OBS::%'
                              AND ref NOT LIKE 'ENTREGA_ARQUIVOS_JSON::%'
                        ),
                        ARRAY[]::text[]
                    ) || ARRAY['ENTREGA_ARQUIVO::' || ?, 'ENTREGA_OBS::' || ?]::text[]
                WHERE p.id_pedido = ?
                  AND p.id_artista = (SELECT a.id_artista FROM public.artista a WHERE a.id_usuario = ?)
                  AND CAST(p.status_comissao AS VARCHAR) IN ('Pendente', 'Em andamento')
                  AND EXISTS (
                      SELECT 1 FROM public.pagamentos pg
                      WHERE pg.id_pedido = p.id_pedido
                        AND (CAST(pg.status_pagamento AS VARCHAR) = 'Pago'
                             OR UPPER(COALESCE(pg.gateway_status, '')) IN ('APPROVED', 'PAID', 'SIMULATED_PAID'))
                  )
                  AND NOT (
                      COALESCE(p.titulo, '') LIKE 'Aquisição:%'
                      OR COALESCE(p.prazo, '') = 'Entrega imediata após confirmação do pagamento'
                      OR COALESCE(p.opcao_titulo, '') LIKE 'Obra Digital%'
                      OR COALESCE(p.opcao_titulo, '') = 'Obra de Portfólio'
                  )
                """,
                objectPath,
                safeMessage,
                orderId,
                account.idUsuario()
        );
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O pedido mudou ou já recebeu uma entrega. Atualize a página e tente novamente.");
        }

        return new CommissionDeliveryApi.DeliveryResponse(orderId, "Entregue");
    }

    public CommissionDeliveryApi.DeliveryUrlResponse createDeliveryUrl(Long orderId, String authId, String accessToken) {
        requireJdbcMode();
        if (orderId == null || orderId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Número do pedido inválido");
        }
        var requester = authenticatedUserService.requireUserByAuthId(authId);
        DeliveryAccess access = findDeliveryAccess(orderId);
        boolean isCustomer = requester.idUsuario().equals(access.customerUserId());
        boolean isArtist = requester.idUsuario().equals(access.artistUserId());
        if (!isCustomer && !isArtist) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Você não tem acesso à entrega deste pedido");
        }
        String objectPath = access.objectPath();
        if (objectPath == null || objectPath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Este pedido ainda não possui uma entrega");
        }
        validateStoredObjectPath(orderId, access.artistAuthId(), objectPath);
        return requestSignedUrl(objectPath, accessToken);
    }

    private DeliveryAccess findDeliveryAccess(Long orderId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT p.id_cliente,
                           cliente.id_auth AS cliente_auth_id,
                           artista_usuario.id_usuario AS artista_usuario_id,
                           artista_usuario.id_auth AS artista_auth_id,
                           (SELECT substring(ref FROM length('ENTREGA_ARQUIVO::') + 1)
                            FROM unnest(COALESCE(p.referencias, ARRAY[]::text[])) AS refs(ref)
                            WHERE ref LIKE 'ENTREGA_ARQUIVO::%' LIMIT 1) AS object_path
                    FROM public.pedidos_principal p
                    JOIN public.usuario cliente ON cliente.id_usuario = p.id_cliente
                    JOIN public.artista a ON a.id_artista = p.id_artista
                    JOIN public.usuario artista_usuario ON artista_usuario.id_usuario = a.id_usuario
                    WHERE p.id_pedido = ?
                    """,
                    (rs, rowNum) -> new DeliveryAccess(
                            rs.getLong("id_cliente"), rs.getString("cliente_auth_id"),
                            rs.getLong("artista_usuario_id"), rs.getString("artista_auth_id"),
                            rs.getString("object_path")
                    ),
                    orderId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido não encontrado");
        }
    }

    private CommissionDeliveryApi.DeliveryUrlResponse requestSignedUrl(String objectPath, String accessToken) {
        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank() || accessToken == null || accessToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "A visualização privada não está configurada");
        }
        try {
            String encodedPath = java.util.Arrays.stream(objectPath.split("/"))
                    .map(part -> URLEncoder.encode(part, StandardCharsets.UTF_8).replace("+", "%20"))
                    .collect(java.util.stream.Collectors.joining("/"));
            String endpoint = supabaseUrl + "/storage/v1/object/sign/comissoes-privadas/" + encodedPath;
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(java.time.Duration.ofSeconds(10))
                    .header("apikey", supabaseAnonKey)
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{\"expiresIn\":300}"))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "O Storage não autorizou a visualização desta entrega");
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Não foi possível gerar o acesso temporário à entrega");
            }
            JsonNode body = objectMapper.readTree(response.body());
            String relativeUrl = body.path("signedURL").asText("");
            if (!relativeUrl.startsWith("/") || relativeUrl.startsWith("//")) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "O Storage retornou um endereço de entrega inválido");
            }
            String signedUrl = relativeUrl.startsWith("/storage/v1/")
                    ? supabaseUrl + relativeUrl
                    : supabaseUrl + "/storage/v1" + relativeUrl;
            return new CommissionDeliveryApi.DeliveryUrlResponse(signedUrl, 300);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "A conexão com o Storage foi interrompida");
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Não foi possível conectar ao Storage privado");
        }
    }

    private static void validateStoredObjectPath(Long orderId, String artistAuthId, String objectPath) {
        if (artistAuthId == null || !objectPath.matches(DELIVERY_PATH_PATTERN)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O caminho da entrega armazenada é inválido");
        }
        String[] parts = objectPath.split("/", 3);
        if (!orderId.toString().equals(parts[0]) || !artistAuthId.equalsIgnoreCase(parts[1])) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A entrega armazenada não corresponde ao pedido");
        }
    }

    private record DeliveryAccess(Long customerUserId, String customerAuthId, Long artistUserId,
                                  String artistAuthId, String objectPath) {}

    private DeliveryOrder findOrder(Long orderId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT p.id_pedido, a.id_usuario AS artista_usuario_id,
                           CAST(p.status_comissao AS VARCHAR) AS status_comissao,
                           p.titulo, p.prazo, p.opcao_titulo,
                           EXISTS (
                               SELECT 1 FROM public.pagamentos pg
                               WHERE pg.id_pedido = p.id_pedido
                                 AND (CAST(pg.status_pagamento AS VARCHAR) = 'Pago'
                                      OR UPPER(COALESCE(pg.gateway_status, '')) IN ('APPROVED', 'PAID', 'SIMULATED_PAID'))
                           ) AS pagamento_pago
                    FROM public.pedidos_principal p
                    JOIN public.artista a ON a.id_artista = p.id_artista
                    WHERE p.id_pedido = ?
                    FOR UPDATE OF p
                    """,
                    (rs, rowNum) -> new DeliveryOrder(
                            rs.getLong("id_pedido"),
                            rs.getLong("artista_usuario_id"),
                            rs.getString("status_comissao"),
                            rs.getBoolean("pagamento_pago"),
                            rs.getString("titulo"),
                            rs.getString("prazo"),
                            rs.getString("opcao_titulo")
                    ),
                    orderId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido não encontrado");
        }
    }

    private static void validateObjectPath(Long orderId, String authId, String objectPath) {
        if (objectPath == null || !objectPath.matches(DELIVERY_PATH_PATTERN)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Arquivo de entrega inválido");
        }
        String[] parts = objectPath.split("/", 3);
        if (parts.length != 3 || !orderId.toString().equals(parts[0]) || !authId.equalsIgnoreCase(parts[1])) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O arquivo não corresponde ao pedido autenticado");
        }
    }

    private static boolean isReadyArtPurchase(DeliveryOrder order) {
        String title = order.title() == null ? "" : order.title().trim();
        String deadline = order.deadline() == null ? "" : order.deadline().trim();
        String option = order.optionTitle() == null ? "" : order.optionTitle().trim();
        return title.startsWith("Aquisição:")
                || "Entrega imediata após confirmação do pagamento".equals(deadline)
                || option.startsWith("Obra Digital")
                || "Obra de Portfólio".equals(option);
    }

    private void requireJdbcMode() {
        if (jdbcTemplate instanceof SupabasePostgrestJdbcTemplate supabaseJdbc
                && !supabaseJdbc.isJdbcConfigured()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "O envio seguro de comissões exige conexão JDBC direta."
            );
        }
    }
}
