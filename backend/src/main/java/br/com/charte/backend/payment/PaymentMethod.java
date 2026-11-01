package br.com.charte.backend.payment;

import com.fasterxml.jackson.annotation.JsonCreator;
import java.util.Locale;

public enum PaymentMethod {
    PIX("Pix"),
    CARTAO("Cartão de Crédito"),
    TRANSFERENCIA("Boleto");

    private final String dbValue;

    PaymentMethod(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    @JsonCreator
    public static PaymentMethod fromInput(String raw) {
        if (raw == null || raw.isBlank()) {
            return PIX;
        }
        String normalized = raw.trim()
                .replace("ã", "a")
                .replace("Ã", "A")
                .replace("ê", "e")
                .replace("Ê", "E")
                .replace("é", "e")
                .replace("á", "a")
                .toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "PIX" -> PIX;
            case "CARTAO", "CARTAO DE CREDITO", "CARTAO_CREDITO", "CREDIT_CARD", "CARD" -> CARTAO;
            case "TRANSFERENCIA", "TRANSFERENCIA BANCARIA", "TRANSFER", "BOLETO" -> TRANSFERENCIA;
            default -> throw new IllegalArgumentException("Método de pagamento inválido: " + raw);
        };
    }
}
