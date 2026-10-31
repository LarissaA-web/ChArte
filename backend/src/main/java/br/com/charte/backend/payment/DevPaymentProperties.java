package br.com.charte.backend.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "charte.payment.dev")
public record DevPaymentProperties(String checkoutBaseUrl) {
    public DevPaymentProperties {
        if (checkoutBaseUrl == null || checkoutBaseUrl.isBlank()) {
            checkoutBaseUrl = "http://localhost:8080/";
        }
    }
}
