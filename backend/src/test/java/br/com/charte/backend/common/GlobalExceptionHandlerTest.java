package br.com.charte.backend.common;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;

class GlobalExceptionHandlerTest {

    @Test
    void logsSqlStateAndStackTraceWithoutExceptionMessages() {
        Logger logger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        String secretMarker = "sensitive-row-value-should-not-be-logged";
        SQLException sqlCause = new SQLException("server detail containing " + secretMarker, "42703", 0);
        DataAccessResourceFailureException exception = new DataAccessResourceFailureException(
                "wrapper detail containing " + secretMarker, sqlCause);
        MDC.put(RequestCorrelationFilter.MDC_KEY, "correlation-test-id");

        try {
            var response = new GlobalExceptionHandler().handleDataAccessException(exception);

            assertTrue(appender.list.stream().anyMatch(event ->
                    event.getFormattedMessage().contains("SQLState=42703")
                            && event.getFormattedMessage().contains("vendorCode=0")
                            && event.getFormattedMessage().contains("at ")));
            assertFalse(appender.list.stream().anyMatch(event -> event.getFormattedMessage().contains(secretMarker)));
            assertTrue(response.getStatusCode().isSameCodeAs(HttpStatus.SERVICE_UNAVAILABLE));
            assertTrue(response.getBody().get("message").equals("Serviço de banco de dados temporariamente indisponível"));
            assertTrue(response.getBody().get("requestId").equals("correlation-test-id"));
        } finally {
            MDC.remove(RequestCorrelationFilter.MDC_KEY);
            logger.detachAppender(appender);
            appender.stop();
        }
    }
}
