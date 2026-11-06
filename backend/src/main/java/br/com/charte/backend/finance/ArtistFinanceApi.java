package br.com.charte.backend.finance;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/artist/finance")
public class ArtistFinanceApi {
    private final ArtistFinanceService financeService;

    public ArtistFinanceApi(ArtistFinanceService financeService) {
        this.financeService = financeService;
    }

    @GetMapping("/summary")
    public ArtistFinanceService.FinanceSummary summary(@AuthenticationPrincipal Jwt jwt) {
        return financeService.summary(jwt.getSubject());
    }

    @GetMapping("/movements")
    public ArtistFinanceService.MovementPage movements(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return financeService.movements(jwt.getSubject(), page, size);
    }
}
