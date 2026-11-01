package br.com.charte.backend.payment;

import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/payments")
public class PaymentApi {
    private final PaymentService paymentService;

    public PaymentApi(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    public record SimulateRequest(String status) {}

    @PostMapping("/checkout")
    public PaymentService.PaymentView checkout(
            @RequestBody PaymentService.CheckoutRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.checkout(request, jwt.getSubject());
    }

    @PostMapping("/{paymentId}/process")
    public PaymentService.PaymentView processPayment(
            @PathVariable String paymentId,
            @RequestBody(required = false) PaymentService.ProcessPaymentRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.processSimulatedPayment(paymentId, request, jwt.getSubject());
    }

    @PostMapping("/{paymentId}/cancel")
    public PaymentService.PaymentView cancelPayment(
            @PathVariable String paymentId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.cancelPayment(paymentId, jwt.getSubject());
    }

    @PostMapping("/{paymentId}/refund")
    public PaymentService.PaymentView refundPayment(
            @PathVariable String paymentId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.refundPayment(paymentId, jwt.getSubject());
    }

    @GetMapping("/{paymentId}")
    public PaymentService.PaymentView getByPaymentId(
            @PathVariable String paymentId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.findByPaymentId(paymentId, jwt.getSubject());
    }

    @GetMapping("/orders/{orderId}/latest")
    public PaymentService.PaymentView getLatestByOrderId(
            @PathVariable Long orderId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.findLatestByOrderId(orderId, jwt.getSubject());
    }

    @GetMapping("/orders/{orderId}/history")
    public List<PaymentService.PaymentView> listOrderPayments(
            @PathVariable Long orderId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.listOrderPayments(orderId, jwt.getSubject());
    }

    @GetMapping("/history/customer")
    public List<PaymentService.PaymentView> listCustomerPayments(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.listCustomerPayments(jwt.getSubject());
    }

    @GetMapping("/history/artist")
    public List<PaymentService.PaymentView> listArtistSales(
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.listArtistSales(jwt.getSubject());
    }

    @PostMapping("/dev/{paymentId}/status")
    public PaymentService.PaymentView simulate(
            @PathVariable String paymentId,
            @RequestBody SimulateRequest request,
            @RequestHeader(name = "X-Confirm-Token", required = false) String token,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return paymentService.simulate(paymentId, request.status(), token, jwt.getSubject());
    }
}
