package br.com.charte.backend.follower;

import br.com.charte.backend.common.AuthenticatedUserService;
import br.com.charte.backend.common.AuthenticatedUserService.UserAccount;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FollowerService {

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;

    public FollowerService(JdbcTemplate jdbcTemplate, AuthenticatedUserService authenticatedUserService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
    }

    public record FollowSummaryView(
            Long targetUserId,
            String username,
            long followersCount,
            long followingCount,
            boolean isFollowing
    ) {}

    public record FollowerProfileView(
            Long userId,
            String username,
            String fullName,
            String avatarUrl,
            String bio,
            boolean isArtist
    ) {}

    public FollowSummaryView getSummary(String targetUsername, String currentAuthId) {
        UserAccount target = authenticatedUserService.requireUserByUsername(targetUsername);
        UserAccount current = authenticatedUserService.findOptionalUserByAuthId(currentAuthId);
        return buildSummary(target, current != null ? current.idUsuario() : null);
    }

    @Transactional
    public FollowSummaryView follow(String targetUsername, String currentAuthId) {
        UserAccount follower = authenticatedUserService.requireUserByAuthId(currentAuthId);
        UserAccount target = authenticatedUserService.requireUserByUsername(targetUsername);

        if (follower.idUsuario().equals(target.idUsuario())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Um usuário não pode seguir a si mesmo");
        }

        if (existsRelationship(follower.idUsuario(), target.idUsuario())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Você já segue este artista");
        }

        try {
            jdbcTemplate.update(
                    "INSERT INTO public.seguidores (id_seguidor, id_seguindo) VALUES (?, ?)",
                    follower.idUsuario(),
                    target.idUsuario()
            );
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Você já segue este artista");
        }

        return buildSummary(target, follower.idUsuario());
    }

    @Transactional
    public FollowSummaryView unfollow(String targetUsername, String currentAuthId) {
        UserAccount follower = authenticatedUserService.requireUserByAuthId(currentAuthId);
        UserAccount target = authenticatedUserService.requireUserByUsername(targetUsername);

        jdbcTemplate.update(
                "DELETE FROM public.seguidores WHERE id_seguidor = ? AND id_seguindo = ?",
                follower.idUsuario(),
                target.idUsuario()
        );

        return buildSummary(target, follower.idUsuario());
    }

    public List<FollowerProfileView> listFollowers(String targetUsername) {
        UserAccount target = authenticatedUserService.requireUserByUsername(targetUsername);
        return jdbcTemplate.query(
                """
                SELECT u.id_usuario, u.nome_usuario, u.nome, u.foto_perfil, u.bio,
                       CASE WHEN a.id_usuario IS NOT NULL OR LOWER(CAST(u.tipo_usuario AS VARCHAR)) = 'artista' THEN TRUE ELSE FALSE END AS is_artist
                FROM public.seguidores s
                JOIN public.usuario u ON u.id_usuario = s.id_seguidor
                LEFT JOIN public.artista a ON a.id_usuario = u.id_usuario
                WHERE s.id_seguindo = ?
                ORDER BY s.id DESC
                """,
                (rs, rowNum) -> new FollowerProfileView(
                        rs.getLong("id_usuario"),
                        rs.getString("nome_usuario"),
                        rs.getString("nome"),
                        rs.getString("foto_perfil"),
                        rs.getString("bio"),
                        rs.getBoolean("is_artist")
                ),
                target.idUsuario()
        );
    }

    public List<FollowerProfileView> listFollowing(String targetUsername) {
        UserAccount target = authenticatedUserService.requireUserByUsername(targetUsername);
        return jdbcTemplate.query(
                """
                SELECT u.id_usuario, u.nome_usuario, u.nome, u.foto_perfil, u.bio,
                       CASE WHEN a.id_usuario IS NOT NULL OR LOWER(CAST(u.tipo_usuario AS VARCHAR)) = 'artista' THEN TRUE ELSE FALSE END AS is_artist
                FROM public.seguidores s
                JOIN public.usuario u ON u.id_usuario = s.id_seguindo
                LEFT JOIN public.artista a ON a.id_usuario = u.id_usuario
                WHERE s.id_seguidor = ?
                ORDER BY s.id DESC
                """,
                (rs, rowNum) -> new FollowerProfileView(
                        rs.getLong("id_usuario"),
                        rs.getString("nome_usuario"),
                        rs.getString("nome"),
                        rs.getString("foto_perfil"),
                        rs.getString("bio"),
                        rs.getBoolean("is_artist")
                ),
                target.idUsuario()
        );
    }

    private FollowSummaryView buildSummary(UserAccount target, Long currentUserId) {
        Long followers = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.seguidores WHERE id_seguindo = ?",
                Long.class,
                target.idUsuario()
        );
        Long following = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.seguidores WHERE id_seguidor = ?",
                Long.class,
                target.idUsuario()
        );
        boolean isFollowing = currentUserId != null && existsRelationship(currentUserId, target.idUsuario());
        return new FollowSummaryView(
                target.idUsuario(),
                target.nomeUsuario(),
                followers != null ? followers : 0L,
                following != null ? following : 0L,
                isFollowing
        );
    }

    private boolean existsRelationship(Long followerId, Long targetId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.seguidores WHERE id_seguidor = ? AND id_seguindo = ?",
                Integer.class,
                followerId,
                targetId
        );
        return count != null && count > 0;
    }
}
