package br.com.charte.backend.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import br.com.charte.backend.common.SupabasePostgrestJdbcTemplate;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class AccountServiceTest {

    @Test
    void exigeJdbcAntesDeIniciarDesativacaoAtomica() {
        SupabasePostgrestJdbcTemplate jdbc = new SupabasePostgrestJdbcTemplate(
                mock(DataSource.class), "", "", false, null);
        AccountService service = new AccountService(jdbc);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.deactivate("00000000-0000-0000-0000-000000000001", "usuario"));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
    }

    @Test
    void permiteValidacaoDaIdentidadeSemJdbcEspecifico() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        AccountService service = new AccountService(jdbc);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> service.deactivate(null, "usuario"));

        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
        verifyNoInteractions(jdbc);
    }
}
