package br.com.charte.backend.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.net.URI;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class PaymentServiceSafetyTest {
    @Test
    void paidSimulationIsRejectedEvenWhenTriggerIsNotVisible() {
        var jdbc = new StubJdbcTemplate(false);
        var provider = new StubProvider();
        PaymentService service = new PaymentService(jdbc, provider, "dev-secret", true);

        assertThatThrownBy(() -> service.simulate("mock-id", PaymentStatus.PAID, "dev-secret", "auth-id"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode().value())
                .isEqualTo(409);
        assertThat(provider.used).isFalse();
        assertThat(jdbc.queries).isEqualTo(1);
    }

    @Test
    void simulationIsUnavailableWhenTokenOrExplicitEnablementIsMissing() {
        var jdbc = new StubJdbcTemplate(false);
        var provider = new StubProvider();
        PaymentService service = new PaymentService(jdbc, provider, "", false);

        assertThatThrownBy(() -> service.simulate("mock-id", PaymentStatus.FAILED, null, "auth-id"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode().value())
                .isEqualTo(404);
        assertThat(jdbc.queries).isZero();
        assertThat(provider.used).isFalse();
    }

    private static final class StubJdbcTemplate extends JdbcTemplate {
        private final boolean triggerFound;
        private int queries;
        private StubJdbcTemplate(boolean triggerFound) { this.triggerFound = triggerFound; }
        @Override public <T> T queryForObject(String sql, Class<T> type) {
            queries++;
            if (sql.contains("pg_trigger") && type == Boolean.class) return type.cast(triggerFound);
            throw new AssertionError("Unexpected database query: " + sql);
        }
        @Override public <T> T queryForObject(String sql, Class<T> type, Object... args) {
            queries++;
            if (sql.contains("pg_trigger") && type == Boolean.class) return type.cast(triggerFound);
            throw new AssertionError("Unexpected database query: " + sql);
        }
    }

    private static final class StubProvider implements PaymentProvider {
        private boolean used;
        @Override public String name() { return "test"; }
        @Override public ProviderCheckout createCheckout(String ref, BigDecimal amount, PaymentMethod method) {
            used = true;
            return new ProviderCheckout("test", URI.create("http://localhost/checkout/test"), PaymentStatus.PENDING);
        }
        @Override public PaymentStatus getStatus(String id) { used = true; return PaymentStatus.PENDING; }
    }
}
