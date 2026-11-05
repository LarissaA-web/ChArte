package br.com.charte.backend.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * API contract for starting a ready-art purchase.
 * Creation is deliberately disabled until status_venda semantics and
 * database-backed idempotency are resolved.
 */
@RestController
@RequestMapping("/api/orders")
public class ReadyArtOrderApi {

    private final ReadyArtOrderService readyArtOrderService;

    public ReadyArtOrderApi(ReadyArtOrderService readyArtOrderService) {
        this.readyArtOrderService = readyArtOrderService;
    }

    public record StartReadyArtOrderRequest(
            @NotNull @Positive Long portfolioId,
            @NotBlank @Size(max = 128) String idempotencyKey
    ) {}

    public record StartReadyArtOrderResponse(
            Long orderId,
            Long portfolioId,
            String idempotencyKey,
            String status
    ) {}

    public record CreationDisabledResponse(String code, String message) {}

    /**
     * The endpoint accepts no client, artist, or price fields. SecurityConfig
     * already requires authentication for /api/**; the JWT subject is passed
     * to the service for the usuario.id_auth -> usuario.id_usuario mapping.
     */
    @PostMapping("/ready-art")
    public ResponseEntity<CreationDisabledResponse> startReadyArtOrder(
            @Valid @RequestBody StartReadyArtOrderRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        readyArtOrderService.validatePurchaseRequest(
                request.portfolioId(),
                request.idempotencyKey(),
                jwt.getSubject()
        );

        // The service currently always blocks after read-only validation.
        // Keep this response as a fail-closed guard if that implementation changes.
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(
                new CreationDisabledResponse(
                        "READY_ART_ORDER_CREATION_DISABLED",
                        "Pedido não criado: disponibilidade e persistência idempotente ainda não estão habilitadas."
                )
        );
    }
}
