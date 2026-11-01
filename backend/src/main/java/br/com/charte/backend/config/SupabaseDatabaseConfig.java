package br.com.charte.backend.config;

import br.com.charte.backend.common.SupabasePostgrestJdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
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

@Configuration
public class SupabaseDatabaseConfig {

    @Bean
    @Primary
    public JdbcTemplate charteJdbcTemplate(
            DataSource dataSource,
            ObjectMapper objectMapper,
            @Value("${spring.datasource.url:}") String jdbcUrl,
            @Value("${spring.datasource.username:}") String dbUser,
            @Value("${spring.datasource.password:}") String dbPassword,
            @Value("${charte.supabase.url:${SUPABASE_URL:https://djvktcghevdtpdqdtcmx.supabase.co}}") String supabaseUrl,
            @Value("${charte.supabase.anon-key:${SUPABASE_ANON_KEY:sb_publishable_RTmhpqNrIjUGd4adjmF7EA_xY2o3M8C}}") String supabaseAnonKey
    ) {
        boolean jdbcConfigured = isRealJdbcConfigured(jdbcUrl, dbUser, dbPassword);
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
            @Value("${spring.datasource.password:}") String dbPassword
    ) {
        if (isRealJdbcConfigured(jdbcUrl, dbUser, dbPassword)) {
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

    private static boolean isRealJdbcConfigured(String jdbcUrl, String dbUser, String dbPassword) {
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            return false;
        }
        if (jdbcUrl.contains("<host>") || jdbcUrl.contains("127.0.0.1:5432")) {
            return dbUser != null && !dbUser.isBlank() && !dbUser.contains("<database-user>")
                    && dbPassword != null && !dbPassword.isBlank() && !dbPassword.contains("<database-password>");
        }
        return dbPassword != null && !dbPassword.isBlank() && !dbPassword.contains("<database-password>");
    }
}

