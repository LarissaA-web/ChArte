package br.com.charte.backend.payment;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PaymentProviderConfiguration {

    public PaymentProviderConfiguration(
            @Value("${charte.payment.provider:mock}") String configuredProvider,
            ObjectProvider<PaymentProvider> paymentProvider
    ) {
        if (paymentProvider.getIfAvailable() == null) {
            throw new IllegalStateException(
                    "Nenhum PaymentProvider ativo para charte.payment.provider=" + configuredProvider
            );
        }
    }
}
