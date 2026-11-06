package br.com.charte.backend.order;

import br.com.charte.backend.common.AuthenticatedUserService;
import br.com.charte.backend.common.SupabasePostgrestJdbcTemplate;
import java.math.BigDecimal;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only preparation for ready-art order creation.
 *
 * Once enabled, order and pedido_itens inserts must be implemented together in
 * one JDBC transaction. No INSERT/UPDATE/DELETE is present in this scaffold.
 */
@Service
public class ReadyArtOrderService {

    private final JdbcTemplate jdbcTemplate;
    private final AuthenticatedUserService authenticatedUserService;

    public ReadyArtOrderService(
            JdbcTemplate jdbcTemplate,
            AuthenticatedUserService authenticatedUserService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.authenticatedUserService = authenticatedUserService;
    }

    private record PortfolioCandidate(
            Long portfolioId,
            Long artistId,
            String title,
            String description,
            BigDecimal price,
            String saleStatus
    ) {}

    @Transactional(readOnly = true)
    public void validatePurchaseRequest(Long portfolioId, String idempotencyKey, String authId) {
        requireJdbcMode();

        if (portfolioId == null || portfolioId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "portfolioId inválido");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "idempotencyKey inválida");
        }

        // The customer identity comes only from the authenticated JWT subject.
        authenticatedUserService.requireUserIdByAuthId(authId);

        PortfolioCandidate portfolio = findPortfolio(portfolioId);
        if (portfolio.price() == null || portfolio.price().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A obra não possui preço válido para checkout");
        }

        // status_venda currently permits NULL and has enum labels "0" and "1",
        // but neither application nor database rules define their meaning.
        // Do not infer availability and do not create an order until that rule,
        // plus persistence of idempotencyKey, is implemented.
        throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "READY_ART_ORDER_CREATION_DISABLED: status_venda não tem semântica confirmada e "
                        + "idempotencyKey ainda não pode ser persistida em pedidos_principal."
        );
    }

    private PortfolioCandidate findPortfolio(Long portfolioId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                    SELECT id_portifolio, id_artista, titulo, descricao, preco,
                           CAST(status_venda AS VARCHAR) AS status_venda
                    FROM public.portifolio
                    WHERE id_portifolio = ?
                    """,
                    (rs, rowNum) -> new PortfolioCandidate(
                            rs.getLong("id_portifolio"),
                            rs.getLong("id_artista"),
                            rs.getString("titulo"),
                            rs.getString("descricao"),
                            rs.getBigDecimal("preco"),
                            rs.getString("status_venda")
                    ),
                    portfolioId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Obra de portfólio não encontrada");
        }
    }

    private void requireJdbcMode() {
        if (jdbcTemplate instanceof SupabasePostgrestJdbcTemplate supabaseJdbc
                && !supabaseJdbc.isJdbcConfigured()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Criação de pedidos de arte pronta exige conexão JDBC direta."
            );
        }
    }
}
