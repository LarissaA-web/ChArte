package br.com.charte.backend.common;

import java.time.LocalDate;
import java.time.ZoneId;

public final class MinimumAge {
    private static final ZoneId PLATFORM_ZONE = ZoneId.of("America/Sao_Paulo");

    private MinimumAge() {}

    public static LocalDate latestEligibleBirthDate() {
        return LocalDate.now(PLATFORM_ZONE).minusYears(16);
    }
}
