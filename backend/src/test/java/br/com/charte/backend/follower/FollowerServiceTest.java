package br.com.charte.backend.follower;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.charte.backend.common.AuthenticatedUserService;
import br.com.charte.backend.follower.FollowerService.FollowSummaryView;
import br.com.charte.backend.follower.FollowerService.FollowerProfileView;
import br.com.charte.backend.testsupport.InMemoryCharteJdbcTemplate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class FollowerServiceTest {
    private FollowerService followerService;

    @BeforeEach
    void setup() {
        InMemoryCharteJdbcTemplate jdbcTemplate = new InMemoryCharteJdbcTemplate();
        jdbcTemplate.addUser(1L, "auth_fan", "fan_arte", "Fã de Arte", false);
        jdbcTemplate.addUser(2L, "auth_artist", "artista_pro", "Artista Profissional", true);

        AuthenticatedUserService authUserService = new AuthenticatedUserService(jdbcTemplate);
        followerService = new FollowerService(jdbcTemplate, authUserService);
    }

    @Test
    void deveSeguirEDeixarDeSeguirArtistaAtualizandoContadores() {
        FollowSummaryView initial = followerService.getSummary("artista_pro", "auth_fan");
        assertEquals(0, initial.followersCount());
        assertFalse(initial.isFollowing());

        FollowSummaryView afterFollow = followerService.follow("artista_pro", "auth_fan");
        assertEquals(1, afterFollow.followersCount());
        assertTrue(afterFollow.isFollowing());

        List<FollowerProfileView> followers = followerService.listFollowers("artista_pro");
        assertEquals(1, followers.size());
        assertEquals("fan_arte", followers.get(0).username());

        List<FollowerProfileView> following = followerService.listFollowing("fan_arte");
        assertEquals(1, following.size());
        assertEquals("artista_pro", following.get(0).username());
        assertTrue(following.get(0).isArtist());

        FollowSummaryView afterUnfollow = followerService.unfollow("artista_pro", "auth_fan");
        assertEquals(0, afterUnfollow.followersCount());
        assertFalse(afterUnfollow.isFollowing());
    }

    @Test
    void deveImpedirUsuarioDeSeguirASiMesmo() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> followerService.follow("artista_pro", "auth_artist")
        );
        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void deveImpedirRelacaoDeSeguimentoDuplicada() {
        followerService.follow("artista_pro", "auth_fan");

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> followerService.follow("artista_pro", "auth_fan")
        );
        assertEquals(409, ex.getStatusCode().value());
    }

    @Test
    void deveExigirAutenticacaoParaSeguirArtista() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> followerService.follow("artista_pro", null)
        );
        assertEquals(401, ex.getStatusCode().value());
    }
}
