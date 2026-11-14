package br.com.charte.backend.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestCorrelationFilterTest {

    @Test
    void returnsGeneratedRequestIdAndMakesItAvailableInMdcDuringRequest() throws Exception {
        RequestCorrelationFilter filter = new RequestCorrelationFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/payments/checkout");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> idSeenDuringRequest = new AtomicReference<>();

        filter.doFilter(request, response, (req, res) -> idSeenDuringRequest.set(MDC.get(RequestCorrelationFilter.MDC_KEY)));

        String responseId = response.getHeader(RequestCorrelationFilter.HEADER_NAME);
        assertTrue(UUID.fromString(responseId) != null);
        assertEquals(responseId, idSeenDuringRequest.get());
        assertNull(MDC.get(RequestCorrelationFilter.MDC_KEY));
    }
}
