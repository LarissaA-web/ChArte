package br.com.charte.backend.commission;

import br.com.charte.backend.common.AuthenticatedUserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CommissionDeliveryServiceTest {
    private static final Long ORDER_ID = 33L;
    private static final Long ARTIST_USER_ID = 8L;
    private static final String AUTH_ID = "f33df301-8ec7-44ab-b85c-e643251edb73";
    private static final String OBJECT_PATH = ORDER_ID + "/" + AUTH_ID + "/550e8400-e29b-41d4-a716-446655440000.png";

    private JdbcTemplate jdbcTemplate;
    private AuthenticatedUserService authenticatedUserService;
    private CommissionDeliveryService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        authenticatedUserService = mock(AuthenticatedUserService.class);
        service = new CommissionDeliveryService(
                jdbcTemplate, authenticatedUserService, new ObjectMapper(),
                "https://supabase.example", "test-anon-key"
        );
        when(authenticatedUserService.requireUserByAuthId(AUTH_ID)).thenReturn(
                new AuthenticatedUserService.UserAccount(ARTIST_USER_ID, "artista", "Artista", null, AUTH_ID)
        );
    }

    @Test
    void registraEntregaDoArtistaResponsavelApenasDepoisDePagamentoAprovado() {
        mockOrder(ARTIST_USER_ID, "Em andamento", true);
        when(jdbcTemplate.update(anyString(), eq(OBJECT_PATH), eq("Entrega final"), eq(ORDER_ID), eq(ARTIST_USER_ID)))
                .thenReturn(1);

        CommissionDeliveryApi.DeliveryResponse result = service.registerDelivery(
                ORDER_ID, OBJECT_PATH, "  Entrega final  ", AUTH_ID
        );

        assertEquals(ORDER_ID, result.orderId());
        assertEquals("Entregue", result.status());
        verify(jdbcTemplate).update(anyString(), eq(OBJECT_PATH), eq("Entrega final"), eq(ORDER_ID), eq(ARTIST_USER_ID));
    }

    @Test
    void artistaDiferenteNaoPodeEnviarAComissao() {
        mockOrder(99L, "Em andamento", true);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.registerDelivery(ORDER_ID, OBJECT_PATH, "", AUTH_ID));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verify(jdbcTemplate, never()).update(anyString(), eq(OBJECT_PATH), eq(""), eq(ORDER_ID), eq(ARTIST_USER_ID));
    }

    @Test
    void impedeEntregaSemPagamentoConfirmadoOuDepoisDeEntregaAnterior() {
        mockOrder(ARTIST_USER_ID, "Em andamento", false);
        ResponseStatusException unpaid = assertThrows(ResponseStatusException.class,
                () -> service.registerDelivery(ORDER_ID, OBJECT_PATH, "", AUTH_ID));
        assertEquals(HttpStatus.CONFLICT, unpaid.getStatusCode());

        mockOrder(ARTIST_USER_ID, "Entregue", true);
        ResponseStatusException repeated = assertThrows(ResponseStatusException.class,
                () -> service.registerDelivery(ORDER_ID, OBJECT_PATH, "", AUTH_ID));
        assertEquals(HttpStatus.CONFLICT, repeated.getStatusCode());
        verify(jdbcTemplate, never()).update(anyString(), eq(OBJECT_PATH), eq(""), eq(ORDER_ID), eq(ARTIST_USER_ID));
    }

    @Test
    void rejeitaCaminhoDeArquivoQueNaoPertenceAoPedidoOuSessao() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.registerDelivery(ORDER_ID, "34/" + AUTH_ID + "/550e8400-e29b-41d4-a716-446655440000.png", "", AUTH_ID));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verify(jdbcTemplate, never()).update(anyString(), anyString(), anyString(), eq(ORDER_ID), eq(ARTIST_USER_ID));
    }

    @Test
    void bloqueiaUrlAssinadaParaUsuarioSemVinculoComPedido() throws SQLException {
        when(jdbcTemplate.queryForObject(anyString(), any(RowMapper.class), eq(ORDER_ID))).thenAnswer(invocation -> {
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("id_cliente")).thenReturn(77L);
            when(rs.getString("cliente_auth_id")).thenReturn("cliente-auth-id");
            when(rs.getLong("artista_usuario_id")).thenReturn(99L);
            when(rs.getString("artista_auth_id")).thenReturn("artista-auth-id");
            when(rs.getString("object_path")).thenReturn(OBJECT_PATH);
            return ((RowMapper<?>) invocation.getArgument(1)).mapRow(rs, 0);
        });

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.createDeliveryUrl(ORDER_ID, AUTH_ID, "jwt"));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
    }

    private void mockOrder(Long artistUserId, String status, boolean paid) {
        when(jdbcTemplate.queryForObject(anyString(), any(RowMapper.class), eq(ORDER_ID)))
                .thenReturn(new CommissionDeliveryService.DeliveryOrder(
                        ORDER_ID, artistUserId, status, paid, "Retrato personalizado", "10 dias", "Retrato"
                ));
    }
}
