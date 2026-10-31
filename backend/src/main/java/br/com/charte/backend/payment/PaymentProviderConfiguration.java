package br.com.charte.backend.payment;

import java.net.URI;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("dev & !prod")
@EnableConfigurationProperties(DevPaymentProperties.class)
public class PaymentProviderConfiguration {
    @Bean
    @ConditionalOnProperty(name = "charte.payment.provider", havingValue = "mock", matchIfMissing = true)
    PaymentProvider mockPaymentProvider(DevPaymentProperties properties) {
        return new MockPaymentProvider(URI.create(properties.checkoutBaseUrl()));
    }
}
