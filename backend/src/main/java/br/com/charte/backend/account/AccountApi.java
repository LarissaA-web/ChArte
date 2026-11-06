package br.com.charte.backend.account;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/account")
public class AccountApi {
    private final AccountService accountService;

    public AccountApi(AccountService accountService) {
        this.accountService = accountService;
    }

    public record DeactivateRequest(@NotBlank String confirmUsername) {}
    public record DeactivateResponse(String status) {}

    @PostMapping("/deactivate")
    public ResponseEntity<DeactivateResponse> deactivate(
            @Valid @RequestBody DeactivateRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        if (jwt == null || jwt.getSubject() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        accountService.deactivate(jwt.getSubject(), request.confirmUsername());
        return ResponseEntity.ok(new DeactivateResponse("Inativo"));
    }
}
