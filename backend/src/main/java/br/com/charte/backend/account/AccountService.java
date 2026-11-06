package br.com.charte.backend.account;

import br.com.charte.backend.common.SupabasePostgrestJdbcTemplate;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountService {
    private final JdbcTemplate jdbcTemplate;

    public AccountService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void deactivate(String authId, String confirmation) {
        requireJdbcMode();
        if (authId == null || authId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuário não autenticado");
        }

        AccountRow account;
        try {
            account = jdbcTemplate.queryForObject(
                    "SELECT id_usuario, nome_usuario, status_conta::text AS status_conta FROM public.usuario WHERE id_auth = ? FOR UPDATE",
                    (rs, rowNum) -> new AccountRow(rs.getLong("id_usuario"), rs.getString("nome_usuario"), rs.getString("status_conta")),
                    java.util.UUID.fromString(authId)
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conta não encontrada");
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identidade inválida");
        }

        if (!account.username().equalsIgnoreCase(confirmation.trim().replaceFirst("^@", ""))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A confirmação do nome de usuário não corresponde");
        }
        if ("Inativo".equalsIgnoreCase(account.status())) return;
        if (!"Ativo".equalsIgnoreCase(account.status())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Esta conta não está ativa");
        }

        Long artistId = findArtistId(account.id());
        if (hasOpenOrders(account.id())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Conclua ou cancele os pedidos em andamento antes de desativar a conta");
        }
        if (hasPendingPayments(account.id(), artistId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Resolva os pagamentos pendentes antes de desativar a conta");
        }
        if (hasHeldBalance(account.id(), artistId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A conta possui valores retidos que precisam ser resolvidos antes da desativação");
        }

        int updated = jdbcTemplate.update("""
                UPDATE public.usuario
                SET status_conta = 'Inativo',
                    nome_usuario = 'desativado_' || id_usuario,
                    nome = 'Conta desativada',
                    email = 'desativado+' || id_usuario || '@invalid.charte',
                    telefone = '',
                    data_nascimento = DATE '1900-01-01',
                    genero = 'Não Informado',
                    foto_perfil = NULL,
                    banner_perfil = NULL,
                    bio = NULL,
                    data_atualizacao = NOW()
                WHERE id_usuario = ? AND status_conta = 'Ativo'
                """, account.id());
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "O estado da conta mudou. Atualize e tente novamente");
        }

        if (artistId != null) {
            jdbcTemplate.update("UPDATE public.artista SET nome_artistico = 'Artista desativado ' || id_artista WHERE id_artista = ?", artistId);
            jdbcTemplate.update("UPDATE public.privacidade_artista SET perfil_publico = FALSE, exibir_redes_sociais = FALSE, exibir_informacoes = FALSE, aceitar_comissoes = FALSE WHERE id_usuario = ?", account.id());
        }
        jdbcTemplate.update("UPDATE public.redes_sociais SET twitter = NULL, instagram = NULL, tiktok = NULL, youtube = NULL WHERE id_usuario = ?", account.id());
        // Orders, payments, ledger movements, portfolio rows, reviews and auth identity are retained.
    }

    private Long findArtistId(long userId) {
        return jdbcTemplate.query(
                "SELECT id_artista FROM public.artista WHERE id_usuario = ?",
                rs -> rs.next() ? rs.getLong(1) : null,
                userId
        );
    }

    private boolean hasOpenOrders(long userId) {
        Long count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM public.pedidos_principal p
                LEFT JOIN public.artista a ON a.id_artista = p.id_artista
                WHERE (p.id_cliente = ? OR a.id_usuario = ?)
                  AND NOT (
                    CAST(p.status_pedido AS VARCHAR) IN ('Entregue', 'Cancelado', 'Reembolso', 'Devolvido')
                    AND CAST(p.status_comissao AS VARCHAR) IN ('Finalizada', 'Cancelada', 'Recusada')
                  )
                """, Long.class, userId, userId);
        return count != null && count > 0;
    }

    private boolean hasPendingPayments(long userId, Long artistId) {
        long idArtist = artistId == null ? -1L : artistId;
        Long count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM public.pagamentos
                WHERE (id_cliente = ? OR id_artista = ?)
                  AND CAST(status_pagamento AS VARCHAR) IN ('Pendente', 'Enviado')
                """, Long.class, userId, idArtist);
        return count != null && count > 0;
    }

    private boolean hasHeldBalance(long userId, Long artistId) {
        long idArtist = artistId == null ? -1L : artistId;
        Long count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM (
                  SELECT id_pagamento,
                    SUM(CASE
                      WHEN tipo_movimentacao = 'credito_retido' THEN valor
                      WHEN tipo_movimentacao IN ('credito_liberado', 'debito_retido', 'estorno_retido', 'credito_estornado') THEN -valor
                      ELSE 0
                    END) AS saldo_retido
                  FROM public.movimentacoes_financeiras
                  WHERE id_cliente = ? OR id_artista = ?
                  GROUP BY id_pagamento
                  HAVING SUM(CASE
                    WHEN tipo_movimentacao = 'credito_retido' THEN valor
                    WHEN tipo_movimentacao IN ('credito_liberado', 'debito_retido', 'estorno_retido', 'credito_estornado') THEN -valor
                    ELSE 0
                  END) > 0
                ) saldo
                """, Long.class, userId, idArtist);
        return count != null && count > 0;
    }

    private void requireJdbcMode() {
        if (jdbcTemplate instanceof SupabasePostgrestJdbcTemplate supabaseJdbc && !supabaseJdbc.isJdbcConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Desativação de conta exige conexão JDBC para ser atômica e preservar obrigações financeiras.");
        }
    }

    private record AccountRow(long id, String username, String status) {}
}
