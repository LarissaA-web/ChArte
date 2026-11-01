package br.com.charte.backend.common;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthenticatedUserService {

    private final JdbcTemplate jdbcTemplate;

    public AuthenticatedUserService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public record UserAccount(
            Long idUsuario,
            String nomeUsuario,
            String nome,
            String fotoPerfil,
            String idAuth
    ) {}

    public Long requireUserIdByAuthId(String authId) {
        return requireUserByAuthId(authId).idUsuario();
    }

    public UserAccount requireUserByAuthId(String authId) {
        if (authId == null || authId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuário não autenticado");
        }
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT id_usuario, nome_usuario, nome, foto_perfil, CAST(id_auth AS VARCHAR) AS id_auth
                    FROM public.usuario
                    WHERE CAST(id_auth AS VARCHAR) = ?
                    """,
                    (rs, rowNum) -> new UserAccount(
                            rs.getLong("id_usuario"),
                            rs.getString("nome_usuario"),
                            rs.getString("nome"),
                            rs.getString("foto_perfil"),
                            rs.getString("id_auth")
                    ),
                    authId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conta de usuário não vinculada no sistema");
        }
    }

    public UserAccount findOptionalUserByAuthId(String authId) {
        if (authId == null || authId.isBlank()) {
            return null;
        }
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT id_usuario, nome_usuario, nome, foto_perfil, CAST(id_auth AS VARCHAR) AS id_auth
                    FROM public.usuario
                    WHERE CAST(id_auth AS VARCHAR) = ?
                    """,
                    (rs, rowNum) -> new UserAccount(
                            rs.getLong("id_usuario"),
                            rs.getString("nome_usuario"),
                            rs.getString("nome"),
                            rs.getString("foto_perfil"),
                            rs.getString("id_auth")
                    ),
                    authId
            );
        } catch (EmptyResultDataAccessException ex) {
            return null;
        }
    }

    public UserAccount requireUserByUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome de usuário inválido");
        }
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT id_usuario, nome_usuario, nome, foto_perfil, CAST(id_auth AS VARCHAR) AS id_auth
                    FROM public.usuario
                    WHERE LOWER(nome_usuario) = LOWER(?)
                    """,
                    (rs, rowNum) -> new UserAccount(
                            rs.getLong("id_usuario"),
                            rs.getString("nome_usuario"),
                            rs.getString("nome"),
                            rs.getString("foto_perfil"),
                            rs.getString("id_auth")
                    ),
                    username.trim().replaceFirst("^@", "")
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuário não encontrado: " + username);
        }
    }
}
