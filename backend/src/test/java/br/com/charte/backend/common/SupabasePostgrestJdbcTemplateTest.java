package br.com.charte.backend.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.LocalDate;
import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class SupabasePostgrestJdbcTemplateTest {

    @Test
    void jdbcConnectionFailureIsClearAndNeverFallsBackToPostgrest() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenThrow(new SQLException("connection unavailable"));
        SupabasePostgrestJdbcTemplate template =
                new SupabasePostgrestJdbcTemplate(dataSource, "", "", true, new ObjectMapper());

        DataAccessResourceFailureException error = assertThrows(
                DataAccessResourceFailureException.class,
                () -> template.update("INSERT INTO public.pagamentos (valor) VALUES (?)", 10)
        );

        assertTrue(error.getMessage().contains("não foi redirecionada ao PostgREST"));
    }

    @Test
    void postgrestResolveContaAtivaPeloSubjectDoJwt() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<String> requestUri = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        server.createContext("/rest/v1/usuario", exchange -> {
            requestUri.set(exchange.getRequestURI().toString());
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = "[{\"id_usuario\":8}]".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        String subject = "f33df301-8ec7-44ab-b85c-e643251edb73";
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
                Jwt.withTokenValue("current-access-token").header("alg", "none").subject(subject).build()));
        try {
            SupabasePostgrestJdbcTemplate template = new SupabasePostgrestJdbcTemplate(
                    mock(DataSource.class), "http://127.0.0.1:" + server.getAddress().getPort(),
                    "local-test-key", false, new ObjectMapper());

            Long userId = template.queryForObject(
                    "SELECT id_usuario FROM public.usuario WHERE CAST(id_auth AS VARCHAR) = ? AND status_conta = 'Ativo' AND data_nascimento <= ?",
                    Long.class,
                    subject,
                    LocalDate.of(2010, 6, 10));

            assertEquals(8L, userId);
            assertTrue(requestUri.get().contains("id_auth=eq." + subject));
            assertTrue(requestUri.get().contains("status_conta=eq.Ativo"));
            assertTrue(requestUri.get().contains("data_nascimento=lte.2010-06-10"));
            assertEquals("Bearer current-access-token", authorization.get());
        } finally {
            SecurityContextHolder.clearContext();
            server.stop(0);
        }
    }

    @Test
    void postgrestSemChaveDeConfiguracaoNaoDeveParecerUsuarioSemVinculo() {
        SupabasePostgrestJdbcTemplate template = new SupabasePostgrestJdbcTemplate(
                mock(DataSource.class), "https://supabase.invalid", "", false, new ObjectMapper());

        DataAccessResourceFailureException error = assertThrows(
                DataAccessResourceFailureException.class,
                () -> template.queryForObject(
                        "SELECT id_usuario FROM public.usuario WHERE CAST(id_auth AS VARCHAR) = ? AND status_conta = 'Ativo'",
                        Long.class,
                        "f33df301-8ec7-44ab-b85c-e643251edb73"));

        assertTrue(error.getMessage().contains("SUPABASE_ANON_KEY"));
    }
}
