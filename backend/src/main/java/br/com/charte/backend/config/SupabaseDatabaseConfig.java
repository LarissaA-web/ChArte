package br.com.charte.backend.config;

import br.com.charte.backend.common.SupabasePostgrestJdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Configuration
public class SupabaseDatabaseConfig {
    private static final Logger log = LoggerFactory.getLogger(SupabaseDatabaseConfig.class);

    @Bean
    @Primary
    public JdbcTemplate charteJdbcTemplate(
            DataSource dataSource,
            ObjectMapper objectMapper,
            @Value("${spring.datasource.url:}") String jdbcUrl,
            @Value("${spring.datasource.username:}") String dbUser,
            @Value("${spring.datasource.password:}") String dbPassword,
            @Value("${charte.database.mode:postgrest}") String databaseMode,
            @Value("${charte.supabase.url:${SUPABASE_URL:https://djvktcghevdtpdqdtcmx.supabase.co}}") String supabaseUrl,
            @Value("${charte.supabase.anon-key:${SUPABASE_ANON_KEY:}}") String supabaseAnonKey
    ) {
        boolean jdbcConfigured = isJdbcModeConfigured(databaseMode, jdbcUrl, dbUser, dbPassword);
        log.info("Modo de conexão Supabase ativo: {}", jdbcConfigured ? "JDBC" : "PostgREST");
        if (jdbcConfigured) {
            verifyJdbcConnection(dataSource);
        }
        return new SupabasePostgrestJdbcTemplate(
                dataSource,
                supabaseUrl,
                supabaseAnonKey,
                jdbcConfigured,
                objectMapper
        );
    }

    @Bean
    @Primary
    public PlatformTransactionManager transactionManager(
            DataSource dataSource,
            @Value("${spring.datasource.url:}") String jdbcUrl,
            @Value("${spring.datasource.username:}") String dbUser,
            @Value("${spring.datasource.password:}") String dbPassword,
            @Value("${charte.database.mode:postgrest}") String databaseMode
    ) {
        if (isJdbcModeConfigured(databaseMode, jdbcUrl, dbUser, dbPassword)) {
            return new DataSourceTransactionManager(dataSource);
        }
        return new AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() throws TransactionException {
                return new Object();
            }

            @Override
            protected void doBegin(Object transaction, TransactionDefinition definition) throws TransactionException {
                // No-op em modo PostgREST (cada operação REST já é transacional no Supabase)
            }

            @Override
            protected void doCommit(DefaultTransactionStatus status) throws TransactionException {
                // No-op em modo PostgREST
            }

            @Override
            protected void doRollback(DefaultTransactionStatus status) throws TransactionException {
                // No-op em modo PostgREST
            }
        };
    }

    static boolean isJdbcModeConfigured(String mode, String jdbcUrl, String dbUser, String dbPassword) {
        String normalizedMode = mode == null ? "" : mode.trim().toLowerCase(java.util.Locale.ROOT);
        if ("postgrest".equals(normalizedMode)) {
            return false;
        }
        if (!"jdbc".equals(normalizedMode)) {
            throw new IllegalStateException("charte.database.mode deve ser 'jdbc' ou 'postgrest'.");
        }
        if (jdbcUrl == null || !jdbcUrl.startsWith("jdbc:postgresql://")
                || jdbcUrl.contains("127.0.0.1") || jdbcUrl.contains("localhost")
                || jdbcUrl.contains("<host>")) {
            throw new IllegalStateException("Modo JDBC exige SUPABASE_JDBC_URL apontando ao PostgreSQL remoto.");
        }
        if (dbUser == null || dbUser.isBlank() || dbPassword == null || dbPassword.isBlank()) {
            throw new IllegalStateException("Modo JDBC exige SUPABASE_DB_USER e SUPABASE_DB_PASSWORD.");
        }
        String query = jdbcUrl.contains("?") ? jdbcUrl.substring(jdbcUrl.indexOf('?') + 1) : "";
        boolean verifyFull = java.util.Arrays.stream(query.split("&"))
                .anyMatch(param -> param.equalsIgnoreCase("sslmode=verify-full"));
        boolean rootCertificate = java.util.Arrays.stream(query.split("&"))
                .anyMatch(param -> param.regionMatches(true, 0, "sslrootcert=", 0, "sslrootcert=".length())
                        && param.length() > "sslrootcert=".length());
        if (!verifyFull || !rootCertificate) {
            throw new IllegalStateException("Modo JDBC exige sslmode=verify-full e sslrootcert na SUPABASE_JDBC_URL.");
        }
        return true;
    }

    private static void verifyJdbcConnection(DataSource dataSource) {
        try (Connection ignored = dataSource.getConnection()) {
            // Validates credentials, TLS certificate, hostname, and database reachability at startup.
        } catch (SQLException ex) {
            String sqlState = ex.getSQLState();
            throw new IllegalStateException("Modo JDBC ativo, mas a conexão PostgreSQL segura não está disponível"
                    + (sqlState == null ? "." : " (SQLState=" + sqlState + ")."));
        }
    }
}

