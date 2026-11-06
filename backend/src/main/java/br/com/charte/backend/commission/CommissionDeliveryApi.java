package br.com.charte.backend.commission;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/commissions")
public class CommissionDeliveryApi {

    private final CommissionDeliveryService deliveryService;

    public CommissionDeliveryApi(CommissionDeliveryService deliveryService) {
        this.deliveryService = deliveryService;
    }

    public record DeliveryRequest(
            @NotBlank @Size(max = 512) String objectPath,
            @Size(max = 2000) String message
    ) {}

    public record DeliveryResponse(Long orderId, String status) {}
    public record DeliveryUrlResponse(String signedUrl, int expiresInSeconds) {}

    @org.springframework.web.bind.annotation.GetMapping("/{orderId}/delivery-url")
    public DeliveryUrlResponse createDeliveryUrl(
            @PathVariable Long orderId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return deliveryService.createDeliveryUrl(orderId, jwt.getSubject(), jwt.getTokenValue());
    }

    @PostMapping("/{orderId}/delivery")
    public DeliveryResponse registerDelivery(
            @PathVariable Long orderId,
            @Valid @RequestBody DeliveryRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return deliveryService.registerDelivery(orderId, request.objectPath(), request.message(), jwt.getSubject());
    }
}
