package br.com.charte.backend.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SupabaseDatabaseConfigTest {

    @Test
    void postgrestModeDoesNotRequireJdbcCredentials() {
        assertFalse(SupabaseDatabaseConfig.isJdbcModeConfigured("postgrest", "", "", ""));
    }

    @Test
    void jdbcModeRequiresRemoteUrlCredentialsAndVerifiedTls() {
        String secureUrl = "jdbc:postgresql://db.example.test:5432/postgres?sslmode=verify-full&sslrootcert=/run/secrets/supabase-ca.crt";

        assertTrue(SupabaseDatabaseConfig.isJdbcModeConfigured("jdbc", secureUrl, "backend_role", "secret"));
        assertThrows(IllegalStateException.class,
                () -> SupabaseDatabaseConfig.isJdbcModeConfigured("jdbc", secureUrl, "", "secret"));
        assertThrows(IllegalStateException.class,
                () -> SupabaseDatabaseConfig.isJdbcModeConfigured("jdbc", secureUrl, "backend_role", ""));
        assertThrows(IllegalStateException.class,
                () -> SupabaseDatabaseConfig.isJdbcModeConfigured("jdbc", "jdbc:postgresql://db.example.test/postgres", "backend_role", "secret"));
        assertThrows(IllegalStateException.class,
                () -> SupabaseDatabaseConfig.isJdbcModeConfigured("jdbc", "jdbc:postgresql://127.0.0.1/postgres?sslmode=verify-full&sslrootcert=/ca.crt", "backend_role", "secret"));
    }

    @Test
    void rejectsUnknownConnectionMode() {
        assertThrows(IllegalStateException.class,
                () -> SupabaseDatabaseConfig.isJdbcModeConfigured("automatic", "", "", ""));
    }
}
