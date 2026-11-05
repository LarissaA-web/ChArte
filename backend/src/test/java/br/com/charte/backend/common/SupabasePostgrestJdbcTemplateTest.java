package br.com.charte.backend.common;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

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
}
