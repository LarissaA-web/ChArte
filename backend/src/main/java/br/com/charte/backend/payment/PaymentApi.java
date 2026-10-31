package br.com.charte.backend.payment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/payments")
@Profile("dev & !prod")
public class PaymentApi {
    private final PaymentService service;

    public PaymentApi(PaymentService service) { this.service = service; }

    @PostMapping("/checkout")
    CheckoutResponse checkout(@Valid @RequestBody CheckoutRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.checkout(request, jwt.getSubject());
    }

    @GetMapping("/{paymentId}")
    StatusResponse status(@PathVariable String paymentId, @AuthenticationPrincipal Jwt jwt) {
        return service.status(paymentId, jwt.getSubject());
    }

    @PostMapping("/dev/{paymentId}/status")
    StatusResponse simulate(@PathVariable String paymentId, @Valid @RequestBody DevStatusRequest request,
                            @RequestHeader(value = "X-Dev-Payment-Token", required = false) String token,
                            @AuthenticationPrincipal Jwt jwt) {
        return service.simulate(paymentId, request.status(), token, jwt.getSubject());
    }

    public record CheckoutRequest(@NotNull Long orderId, @NotNull PaymentMethod method) {}
    public record CheckoutResponse(String paymentId, String checkoutUrl, String status) {}
    public record StatusResponse(String paymentId, String status) {}
    public record DevStatusRequest(@NotNull PaymentStatus status) {}
}

@RestController
@Profile("dev & !prod")
class MockCheckoutPage {
    @GetMapping(value = "/checkout/{paymentId}", produces = "text/html;charset=UTF-8")
    String checkoutPage() {
        return "<!doctype html><html lang='pt-BR'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Checkout de teste</title><body style='font:16px system-ui;max-width:620px;margin:12vh auto;padding:24px;color:#211b25'><h1>Checkout de teste</h1><p>Este checkout é uma simulação de desenvolvimento. Nenhum gateway foi acionado e nenhum dinheiro foi recebido.</p><p>O status só pode ser alterado pelo mecanismo de desenvolvimento protegido no servidor.</p></body></html>";
    }
}
