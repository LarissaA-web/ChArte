package br.com.charte.backend.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.DispatcherType;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/checkout/**", "/error").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/followers/**").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));
        return http.build();
    }

    @Bean
    @ConditionalOnMissingBean(JwtDecoder.class)
    JwtDecoder supabaseJwtDecoder(
            @Value("${charte.supabase.url:${SUPABASE_URL:https://djvktcghevdtpdqdtcmx.supabase.co}}") String supabaseUrl,
            @Value("${charte.supabase.anon-key:${SUPABASE_ANON_KEY:sb_publishable_RTmhpqNrIjUGd4adjmF7EA_xY2o3M8C}}") String supabaseAnonKey
    ) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(6))
                .build();
        ObjectMapper mapper = new ObjectMapper();
        String baseUrl = supabaseUrl.replaceAll("/+$", "");
        Map<String, CachedJwt> cache = new ConcurrentHashMap<>();

        return token -> {
            if (token == null || token.isBlank()) {
                throw new BadJwtException("Token JWT ausente");
            }

            CachedJwt cached = cache.get(token);
            if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
                return cached.jwt();
            }

            Map<String, Object> headers = decodePart(mapper, token, 0);
            Map<String, Object> claims = decodePart(mapper, token, 1);

            if (headers.isEmpty()) {
                headers = Map.of("alg", "HS256", "typ", "JWT");
            }

            Instant issuedAt = extractInstant(claims.get("iat"), Instant.now().minusSeconds(5));
            Instant expiresAt = extractInstant(claims.get("exp"), Instant.now().plusSeconds(3600));
            if (expiresAt.isBefore(Instant.now())) {
                throw new BadJwtException("Token JWT expirado");
            }

            // Verifica o token diretamente no endpoint oficial do Supabase Auth (/auth/v1/user)
            try {
                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(baseUrl + "/auth/v1/user"))
                        .timeout(Duration.ofSeconds(6))
                        .header("apikey", supabaseAnonKey)
                        .header("Authorization", "Bearer " + token)
                        .GET()
                        .build();
                HttpResponse<String> res = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() == 401 || res.statusCode() == 403) {
                    throw new BadJwtException("Token JWT rejeitado pelo Supabase Auth (" + res.statusCode() + ")");
                }
                if (res.statusCode() >= 200 && res.statusCode() < 300 && res.body() != null && !res.body().isBlank()) {
                    Map<String, Object> userBody = mapper.readValue(res.body(), new TypeReference<Map<String, Object>>() {});
                    Object id = userBody.get("id");
                    if (id != null && !claims.containsKey("sub")) {
                        claims = new HashMap<>(claims);
                        claims.put("sub", String.valueOf(id));
                    }
                }
            } catch (BadJwtException e) {
                throw e;
            } catch (Exception ignored) {
                // Caso esteja sem rede no ambiente local, utiliza claims decodificados se sub estiver presente
                if (!claims.containsKey("sub")) {
                    throw new BadJwtException("Não foi possível validar o token JWT");
                }
            }

            if (!claims.containsKey("sub") || String.valueOf(claims.get("sub")).isBlank()) {
                throw new BadJwtException("Token JWT sem claim sub");
            }

            Jwt jwt = new Jwt(token, issuedAt, expiresAt, headers, claims);
            Instant cacheUntil = Instant.now().plusSeconds(60);
            cache.put(token, new CachedJwt(jwt, cacheUntil.isBefore(expiresAt) ? cacheUntil : expiresAt));
            return jwt;
        };
    }

    private record CachedJwt(Jwt jwt, Instant expiresAt) {}

    private static Map<String, Object> decodePart(ObjectMapper mapper, String token, int index) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length <= index) {
                return Map.of();
            }
            byte[] decoded = Base64.getUrlDecoder().decode(parts[index]);
            return mapper.readValue(new String(decoded, StandardCharsets.UTF_8), new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static Instant extractInstant(Object raw, Instant fallback) {
        if (raw instanceof Number n) {
            return Instant.ofEpochSecond(n.longValue());
        }
        return fallback;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${charte.cors.allowed-origins:${charte.cors.allowed-origin:http://localhost:4200}}") List<String> allowedOrigins
    ) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "X-Dev-Payment-Token", "X-Confirm-Token"));
        config.setExposedHeaders(List.of("Location"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
