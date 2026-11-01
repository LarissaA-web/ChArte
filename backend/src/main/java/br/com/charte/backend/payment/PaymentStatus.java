package br.com.charte.backend.payment;

import java.util.Locale;

public enum PaymentStatus {
    PENDING("Pendente", "PENDING"),
    PROCESSING("Pendente", "PROCESSING"),
    APPROVED("Pago", "APPROVED"),
    PAID("Pago", "APPROVED"),
    DECLINED("Cancelado", "DECLINED"),
    FAILED("Cancelado", "DECLINED"),
    CANCELLED("Cancelado", "CANCELLED"),
    REFUNDED("Reembolso", "REFUNDED");

    private final String dbStatus;
    private final String canonicalName;

    PaymentStatus(String dbStatus, String canonicalName) {
        this.dbStatus = dbStatus;
        this.canonicalName = canonicalName;
    }

    public String dbStatus() {
        return dbStatus;
    }

    public String canonicalName() {
        return canonicalName;
    }

    public boolean isApproved() {
        return this == APPROVED || this == PAID;
    }

    public boolean isDeclined() {
        return this == DECLINED || this == FAILED;
    }

    public static PaymentStatus fromInput(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Status de pagamento obrigatório");
        }
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "PENDING", "PENDENTE" -> PENDING;
            case "PROCESSING", "PROCESSANDO", "EM_PROCESSAMENTO" -> PROCESSING;
            case "APPROVED", "APROVADO" -> APPROVED;
            case "PAID", "PAGO" -> PAID;
            case "DECLINED", "RECUSADO" -> DECLINED;
            case "FAILED", "FALHOU" -> FAILED;
            case "CANCELLED", "CANCELED", "CANCELADO" -> CANCELLED;
            case "REFUNDED", "REEMBOLSO", "REEMBOLSADO" -> REFUNDED;
            default -> throw new IllegalArgumentException("Status inválido: " + raw);
        };
    }
}
