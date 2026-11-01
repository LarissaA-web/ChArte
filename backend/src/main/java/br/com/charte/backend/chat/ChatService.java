package br.com.charte.backend.chat;

import br.com.charte.backend.common.AuthenticatedUserService;
import br.com.charte.backend.common.AuthenticatedUserService.UserAccount;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ChatService {

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;

    public ChatService(JdbcTemplate jdbcTemplate, AuthenticatedUserService authenticatedUserService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
    }

    public record ChatUserView(
            String id,
            String username,
            String displayName,
            String avatarUrl
    ) {}

    public record LastMessageView(
            String content,
            String createdAt
    ) {}

    public record ChatConversationView(
            String id,
            ChatUserView participant,
            LastMessageView lastMessage
    ) {}

    public record ChatMessageView(
            String id,
            boolean isMine,
            String content,
            String createdAt
    ) {}

    public record StartConversationRequest(
            String participantId,
            String participantUsername,
            Long otherUserId,
            String otherUsername
    ) {}

    public record SendMessageRequest(String content) {}

    public List<ChatConversationView> listConversations(String authId) {
        Long myUserId = authenticatedUserService.requireUserIdByAuthId(authId);
        return jdbcTemplate.query(
                """
                SELECT c.id_conversa,
                       u.id_usuario AS other_user_id,
                       u.nome_usuario AS other_username,
                       u.nome AS other_full_name,
                       u.foto_perfil AS other_avatar,
                       (
                           SELECT m.conteudo
                           FROM public.mensagens m
                           WHERE m.id_conversa = c.id_conversa
                           ORDER BY m.data_envio DESC, m.id_mensagem DESC
                           LIMIT 1
                       ) AS last_message,
                       (
                           SELECT m.data_envio
                           FROM public.mensagens m
                           WHERE m.id_conversa = c.id_conversa
                           ORDER BY m.data_envio DESC, m.id_mensagem DESC
                           LIMIT 1
                       ) AS last_message_at
                FROM public.conversas c
                JOIN public.participante_conversa pc_me
                  ON pc_me.id_conversa = c.id_conversa AND pc_me.id_usuario = ?
                JOIN public.participante_conversa pc_other
                  ON pc_other.id_conversa = c.id_conversa AND pc_other.id_usuario <> ?
                JOIN public.usuario u
                  ON u.id_usuario = pc_other.id_usuario
                ORDER BY COALESCE(last_message_at, c.data_criacao) DESC, c.id_conversa DESC
                """,
                (rs, rowNum) -> {
                    Timestamp ts = rs.getTimestamp("last_message_at");
                    String msgContent = rs.getString("last_message");
                    LastMessageView lastMsg = msgContent != null
                            ? new LastMessageView(msgContent, ts != null ? ts.toInstant().toString() : Instant.now().toString())
                            : null;
                    return new ChatConversationView(
                            String.valueOf(rs.getLong("id_conversa")),
                            new ChatUserView(
                                    String.valueOf(rs.getLong("other_user_id")),
                                    rs.getString("other_username"),
                                    rs.getString("other_full_name"),
                                    rs.getString("other_avatar")
                            ),
                            lastMsg
                    );
                },
                myUserId,
                myUserId
        );
    }

    public List<ChatUserView> searchUsers(String query, String authId) {
        Long myUserId = authenticatedUserService.requireUserIdByAuthId(authId);
        String term = (query != null && !query.isBlank()) ? "%" + query.trim().toLowerCase() + "%" : "%";
        return jdbcTemplate.query(
                """
                SELECT id_usuario, nome_usuario, nome, foto_perfil
                FROM public.usuario
                WHERE id_usuario <> ?
                  AND (LOWER(nome_usuario) LIKE ? OR LOWER(nome) LIKE ?)
                ORDER BY nome ASC
                LIMIT 20
                """,
                (rs, rowNum) -> new ChatUserView(
                        String.valueOf(rs.getLong("id_usuario")),
                        rs.getString("nome_usuario"),
                        rs.getString("nome"),
                        rs.getString("foto_perfil")
                ),
                myUserId,
                term,
                term
        );
    }

    @Transactional
    public ChatConversationView startOrGetConversation(StartConversationRequest request, String authId) {
        Long myUserId = authenticatedUserService.requireUserIdByAuthId(authId);
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o destinatário da conversa");
        }

        String rawUsername = request.participantUsername() != null ? request.participantUsername() : request.otherUsername();
        String rawId = request.participantId() != null ? request.participantId()
                : (request.otherUserId() != null ? String.valueOf(request.otherUserId()) : null);

        UserAccount target;
        if (rawUsername != null && !rawUsername.isBlank()) {
            target = authenticatedUserService.requireUserByUsername(rawUsername);
        } else if (rawId != null && !rawId.isBlank()) {
            Long parsedId = Long.parseLong(rawId.trim());
            target = findUserByIdOrThrow(parsedId);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o destinatário da conversa");
        }

        if (myUserId.equals(target.idUsuario())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Não é possível iniciar conversa consigo mesmo");
        }

        List<Long> existing = jdbcTemplate.query(
                """
                SELECT pc1.id_conversa
                FROM public.participante_conversa pc1
                JOIN public.participante_conversa pc2 ON pc1.id_conversa = pc2.id_conversa
                WHERE pc1.id_usuario = ? AND pc2.id_usuario = ?
                LIMIT 1
                """,
                (rs, rowNum) -> rs.getLong("id_conversa"),
                myUserId,
                target.idUsuario()
        );

        Long conversationId;
        if (!existing.isEmpty()) {
            conversationId = existing.get(0);
        } else {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbcTemplate.update(connection -> {
                PreparedStatement ps = connection.prepareStatement(
                        "INSERT INTO public.conversas (data_criacao) VALUES (CURRENT_TIMESTAMP)",
                        new String[]{"id_conversa"}
                );
                return ps;
            }, keyHolder);

            Number generatedId = keyHolder.getKey();
            if (generatedId == null) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Falha ao criar conversa");
            }
            conversationId = generatedId.longValue();

            jdbcTemplate.update(
                    "INSERT INTO public.participante_conversa (id_conversa, id_usuario) VALUES (?, ?)",
                    conversationId,
                    myUserId
            );
            jdbcTemplate.update(
                    "INSERT INTO public.participante_conversa (id_conversa, id_usuario) VALUES (?, ?)",
                    conversationId,
                    target.idUsuario()
            );
        }

        return new ChatConversationView(
                String.valueOf(conversationId),
                new ChatUserView(
                        String.valueOf(target.idUsuario()),
                        target.nomeUsuario(),
                        target.nome(),
                        target.fotoPerfil()
                ),
                null
        );
    }

    public List<ChatMessageView> listMessages(Long conversationId, int limit, String authId) {
        Long myUserId = authenticatedUserService.requireUserIdByAuthId(authId);
        verifyConversationParticipant(conversationId, myUserId);

        int safeLimit = Math.min(Math.max(limit, 1), 200);
        return jdbcTemplate.query(
                """
                SELECT id_mensagem, id_conversa, id_remetente, conteudo, data_envio
                FROM public.mensagens
                WHERE id_conversa = ?
                ORDER BY data_envio ASC, id_mensagem ASC
                LIMIT ?
                """,
                (rs, rowNum) -> {
                    Timestamp ts = rs.getTimestamp("data_envio");
                    return new ChatMessageView(
                            String.valueOf(rs.getLong("id_mensagem")),
                            myUserId.equals(rs.getLong("id_remetente")),
                            rs.getString("conteudo"),
                            ts != null ? ts.toInstant().toString() : Instant.now().toString()
                    );
                },
                conversationId,
                safeLimit
        );
    }

    @Transactional
    public ChatMessageView sendMessage(Long conversationId, SendMessageRequest request, String authId) {
        Long myUserId = authenticatedUserService.requireUserIdByAuthId(authId);
        verifyConversationParticipant(conversationId, myUserId);

        String content = request != null && request.content() != null ? request.content().trim() : "";
        if (content.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mensagem não pode ser vazia");
        }

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO public.mensagens (id_conversa, id_remetente, conteudo, data_envio) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, conversationId);
            ps.setLong(2, myUserId);
            ps.setString(3, content);
            return ps;
        }, keyHolder);

        Long messageId = null;
        if (keyHolder.getKeys() != null && keyHolder.getKeys().get("id_mensagem") instanceof Number num) {
            messageId = num.longValue();
        } else if (keyHolder.getKey() != null) {
            messageId = keyHolder.getKey().longValue();
        }

        return new ChatMessageView(
                String.valueOf(messageId != null ? messageId : 0L),
                true,
                content,
                Instant.now().toString()
        );
    }

    private UserAccount findUserByIdOrThrow(Long idUsuario) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT id_usuario, nome_usuario, nome, foto_perfil, CAST(id_auth AS VARCHAR) AS id_auth
                    FROM public.usuario
                    WHERE id_usuario = ?
                    """,
                    (rs, rowNum) -> new UserAccount(
                            rs.getLong("id_usuario"),
                            rs.getString("nome_usuario"),
                            rs.getString("nome"),
                            rs.getString("foto_perfil"),
                            rs.getString("id_auth")
                    ),
                    idUsuario
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuário não encontrado");
        }
    }

    private void verifyConversationParticipant(Long conversationId, Long userId) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM public.participante_conversa WHERE id_conversa = ? AND id_usuario = ?",
                    Integer.class,
                    conversationId,
                    userId
            );
            if (count == null || count == 0) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Você não participa desta conversa");
            }
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Você não participa desta conversa");
        }
    }
}
