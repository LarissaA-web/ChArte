package br.com.charte.backend.config;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.charte.backend.common.GlobalExceptionHandler;
import br.com.charte.backend.follower.FollowerController;
import br.com.charte.backend.follower.FollowerService;
import br.com.charte.backend.follower.FollowerService.FollowSummaryView;
import br.com.charte.backend.payment.PaymentApi;
import br.com.charte.backend.payment.PaymentService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {PaymentApi.class, FollowerController.class})
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class SecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private PaymentService paymentService;

    @MockitoBean
    private FollowerService followerService;

    @Test
    void deveBloquearCheckoutSemAutenticacaoCom401() throws Exception {
        mockMvc.perform(post("/api/payments/checkout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderId\":1,\"method\":\"PIX\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deveBloquearSeguirSemAutenticacaoCom401() throws Exception {
        mockMvc.perform(post("/api/followers/artista_teste"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void devePermitirConsultaPublicaDeResumoDeSeguidores() throws Exception {
        when(followerService.getSummary("artista_teste", null))
                .thenReturn(new FollowSummaryView(2L, "artista_teste", 12L, 3L, false));

        mockMvc.perform(get("/api/followers/artista_teste/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followersCount").value(12))
                .andExpect(jsonPath("$.followingCount").value(3));
    }
}
