package br.com.charte.backend.payment;

import com.fasterxml.jackson.annotation.JsonCreator;

public enum PaymentMethod {
    PIX, CARD, TRANSFER;

    @JsonCreator
    public static PaymentMethod fromJson(String value) {
        return PaymentMethod.valueOf(value.toUpperCase(java.util.Locale.ROOT));
    }
}
