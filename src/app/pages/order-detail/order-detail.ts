import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArtistAreaService } from '../../../services/artist-area.service';
import { AuthService } from '../../../services/auth.service';
import { Comissao } from '../../models/artist-area';
import { PaymentService, PaymentView } from '../../../services/payment.service';
import { Subscription, combineLatest } from 'rxjs';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, RouterLink],
  template: `
    <main class="order-detail-page">
      @if (pedido) {
        <div class="top-nav-links">
          <a class="back-link" routerLink="/carrinho" [queryParams]="{ aba: 'pedidos' }">← Voltar aos pedidos</a>
          <a class="back-link secondary" routerLink="/carrinho" [queryParams]="{ aba: 'pagamentos' }">Ver histórico de transações</a>
        </div>

        <header class="detail-heading">
          <div class="heading-badges">
            <span class="badge-order">PEDIDO #{{ pedido.id }}</span>
            <span class="badge-sim">AMBIENTE DE PAGAMENTO SIMULADO</span>
          </div>
          <h1>{{ pedido.titulo }}</h1>
          <p>Solicitado em {{ pedido.criadaEm | date:'dd/MM/yyyy' }} · Artista responsável: <a [routerLink]="['/perfil', pedido.artistaUsername]">@{{ pedido.artistaUsername }}</a></p>
        </header>

        <div class="detail-grid">
          <div class="left-column">
            <section class="detail-card">
              <div class="detail-card-heading">
                <div>
                  <span class="detail-label">ACOMPANHAMENTO</span>
                  <h2>Status do pedido</h2>
                </div>
                <span class="detail-status" [class.paid]="pedido.pagamentoStatus === 'pago'" [class.failed]="pedido.pagamentoStatus === 'falhou'">
                  {{ statusExibido }}
                </span>
              </div>

              <ol class="status-timeline">
                <li class="done">
                  <i></i>
                  <div>
                    <strong>Solicitação registrada</strong>
                    <small>Pedido vinculado ao artista @{{ pedido.artistaUsername }}</small>
                  </div>
                </li>
                <li [class.done]="pedido.status !== 'Solicitada' && pedido.status !== 'Recusada' && pedido.status !== 'Cancelada'">
                  <i></i>
                  <div>
                    <strong>Condições da contratação</strong>
                    <small>{{
                      pedido.status === 'Solicitada'
                        ? 'Aguardando análise da artista'
                        : pedido.status === 'Recusada'
                          ? 'Solicitação recusada'
                          : 'Valor e prazo definidos para o pedido'
                    }}</small>
                  </div>
                </li>
                <li [class.done]="pedido.pagamentoStatus === 'pago'" [class.waiting]="pedido.status === 'Pendente' && pedido.pagamentoStatus !== 'pago'">
                  <i></i>
                  <div>
                    <strong>{{ pedido.pagamentoStatus === 'pago' ? 'Pagamento aprovado (Simulado)' : 'Pagamento simulado' }}</strong>
                    <small>{{
                      pedido.pagamentoStatus === 'pago'
                        ? 'Transação aprovada pelo simulador financeiro interno'
                        : pedido.status === 'Pendente'
                          ? 'Escolha uma modalidade ao lado para concluir a contratação'
                          : 'Disponível após aprovação do orçamento'
                    }}</small>
                  </div>
                </li>
                <li [class.done]="pedido.status === 'Em andamento' || pedido.status === 'Entregue' || pedido.status === 'Finalizada'">
                  <i></i>
                  <div>
                    <strong>Em produção</strong>
                    <small>O artista produz e prepara os arquivos da sua arte</small>
                  </div>
                </li>
                <li [class.done]="pedido.status === 'Entregue' || pedido.status === 'Finalizada'" [class.waiting]="pedido.status === 'Em andamento'">
                  <i></i>
                  <div>
                    <strong>Arte enviada pelo artista</strong>
                    <small>{{
                      pedido.status === 'Entregue'
                        ? 'Imagem enviada! Revise abaixo e aprove para concluir a comissão'
                        : pedido.status === 'Finalizada'
                          ? 'Arte entregue pelo artista'
                          : 'Aguardando envio da arte pelo artista'
                    }}</small>
                  </div>
                </li>
                <li [class.done]="pedido.status === 'Finalizada'" [class.waiting]="pedido.status === 'Entregue'">
                  <i></i>
                  <div>
                    <strong>Comissão aprovada e concluída</strong>
                    <small>{{
                      pedido.status === 'Finalizada'
                        ? 'Imagem aprovada pelo cliente · comissão completa'
                        : pedido.status === 'Entregue'
                          ? 'Aguardando aprovação da imagem pelo cliente'
                          : 'Concluída após aprovação da arte pelo cliente'
                    }}</small>
                  </div>
                </li>
              </ol>

              @if (pedido.status === 'Entregue' || pedido.status === 'Finalizada' || pedido.arquivoEntrega) {
                <div class="delivery-result">
                  <div class="delivery-header">
                    <span class="detail-label">{{ pedido.status === 'Finalizada' ? 'COMISSÃO COMPLETA' : 'ENTREGA DO ARTISTA' }}</span>
                    <h3>{{ pedido.status === 'Finalizada' ? 'Arte final aprovada' : 'Arte enviada para sua aprovação' }}</h3>
                  </div>
                  @if (pedido.arquivoEntrega) {
                    <img [src]="pedido.arquivoEntrega" alt="Arte entregue pelo artista" />
                    <div class="delivery-links">
                      <a [href]="pedido.arquivoEntrega" target="_blank" rel="noopener" download="comissao-charte.png">
                        Abrir / Baixar imagem original ↗
                      </a>
                    </div>
                  }
                  @if (pedido.observacaoEntrega) {
                    <p class="delivery-note"><strong>Mensagem do artista:</strong> {{ pedido.observacaoEntrega }}</p>
                  }

                  @if (pedido.status === 'Entregue' && ehClienteDoPedido) {
                    <div class="delivery-approval-box">
                      <h4>Aprovar imagem da comissão?</h4>
                      <p>Confira a arte enviada pelo artista. Ao aprovar a imagem, a comissão será dada como completa.</p>
                      @if (statusMensagem) {
                        <p class="payment-message" [class.error]="statusErro" aria-live="polite">{{ statusMensagem }}</p>
                      }
                      <div class="approval-actions">
                        <button type="button" class="pay-button approve-delivery-btn" [disabled]="statusCarregando" (click)="aprovarEntrega()">
                          {{ statusCarregando ? 'Confirmando…' : '✓ Aprovar imagem e concluir comissão' }}
                        </button>
                        <button type="button" class="cancel-order revision-btn" [disabled]="statusCarregando" (click)="solicitarAjustesEntrega()">
                          Solicitar ajustes na arte
                        </button>
                      </div>
                    </div>
                  } @else if (pedido.status === 'Entregue' && !ehClienteDoPedido) {
                    <div class="delivery-approval-box waiting-client">
                      <strong>Aguardando aprovação do cliente</strong>
                      <p>A comissão será marcada como concluída assim que o cliente aprovar a imagem enviada.</p>
                    </div>
                  } @else if (pedido.status === 'Finalizada') {
                    <div class="delivery-approval-box completed-box">
                      <strong>✓ Imagem aprovada pelo cliente · Comissão concluída!</strong>
                      @if (pedido.concluidaEm) {
                        <small>Concluída em {{ pedido.concluidaEm | date:'dd/MM/yyyy' }}</small>
                      }
                    </div>
                  }
                </div>
              }
            </section>

            <!-- HISTÓRICO DE TRANSAÇÕES DESTE PEDIDO -->
            <section class="detail-card history-card">
              <div class="detail-card-heading">
                <div>
                  <span class="detail-label">REGISTROS FINANCEIROS</span>
                  <h2>Histórico de transações do pedido</h2>
                </div>
              </div>

              @if (historicoPedido.length > 0) {
                <div class="tx-list">
                  @for (tx of historicoPedido; track tx.paymentId) {
                    <div class="tx-item">
                      <div class="tx-main">
                        <span class="tx-id">{{ tx.paymentId }}</span>
                        <strong>{{ tx.method }} · {{ tx.amount | currency:'BRL' }}</strong>
                        <small>{{ tx.simulationDetails || 'Operação registrada no simulador interno' }}</small>
                      </div>
                      <div class="tx-meta">
                        <span class="tx-badge" [attr.data-status]="tx.status">{{ traduzirStatusGateway(tx.status) }}</span>
                        <small>{{ tx.paymentDate | date:'dd/MM/yyyy' }}</small>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="empty-tx">Nenhuma tentativa de pagamento registrada para este pedido ainda.</p>
              }
            </section>
          </div>

          <aside class="detail-card summary-card">
            <span class="detail-label">RESUMO DA CONTRATAÇÃO</span>
            <h2>{{ pedido.opcaoTitulo || 'Comissão personalizada' }}</h2>
            <dl>
              <div>
                <dt>Artista</dt>
                <dd><a [routerLink]="['/perfil', pedido.artistaUsername]">@{{ pedido.artistaUsername }}</a></dd>
              </div>
              <div>
                <dt>Cliente</dt>
                <dd>{{ pedido.cliente.nome || '@' + pedido.cliente.username }}</dd>
              </div>
              <div>
                <dt>Valor total</dt>
                <dd class="price-highlight">{{ valorEfetivo | currency:'BRL' }}</dd>
              </div>
              <div>
                <dt>Modalidade</dt>
                <dd>{{ transacaoAtual?.method || pedido.pagamento || 'Definido no checkout' }}</dd>
              </div>
              <div>
                <dt>Prazo estimado</dt>
                <dd>{{ pedido.propostaPrazo || pedido.prazo }}</dd>
              </div>
            </dl>

            @if (pedido.status === 'Aguardando aprovação do cliente') {
              <section class="payment-box proposal-box">
                <span class="detail-label">PROPOSTA DO ARTISTA</span>
                <h3>Revise antes de aprovar</h3>
                <p>
                  O artista propôs <strong>{{ valorEfetivo | currency:'BRL' }}</strong> com prazo de
                  <strong>{{ pedido.propostaPrazo || pedido.prazo }}</strong>. Ao aprovar, o checkout simulado será liberado.
                </p>
                @if (statusMensagem) {
                  <p class="payment-message" [class.error]="statusErro" aria-live="polite">{{ statusMensagem }}</p>
                }
                <button type="button" class="pay-button" [disabled]="statusCarregando" (click)="aprovarProposta()">
                  {{ statusCarregando ? 'Atualizando…' : 'Aprovar proposta e liberar checkout' }}
                </button>
                <button type="button" class="cancel-order" [disabled]="statusCarregando" (click)="cancelar()">
                  Recusar proposta
                </button>
              </section>
            }

            @if (podePagar) {
              <section class="payment-box checkout-box" aria-label="Checkout de pagamento simulado">
                <div class="checkout-header">
                  <span class="detail-label">CHECKOUT SIMULADO INTERNO</span>
                  <h3>Escolha a modalidade de pagamento</h3>
                  <p class="sim-disclaimer">
                    Simulação acadêmica 100% interna. Nenhum valor financeiro real é cobrado ou transferido.
                  </p>
                </div>

                <!-- ABAS DE MODALIDADE -->
                <div class="method-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    [class.active]="metodoPagamento === 'pix'"
                    (click)="selecionarMetodo('pix')"
                  >
                    ❖ PIX Simulado
                  </button>
                  <button
                    type="button"
                    role="tab"
                    [class.active]="metodoPagamento === 'card'"
                    (click)="selecionarMetodo('card')"
                  >
                    💳 Cartão Simulado
                  </button>
                  <button
                    type="button"
                    role="tab"
                    [class.active]="metodoPagamento === 'transfer'"
                    (click)="selecionarMetodo('transfer')"
                  >
                    📄 Boleto / Transf.
                  </button>
                </div>

                @if (!checkoutAtivo) {
                  <button
                    class="pay-button"
                    type="button"
                    [disabled]="pagamentoCarregando"
                    (click)="iniciarPagamento()"
                  >
                    {{ pagamentoCarregando ? 'Gerando transação simulada…' : 'Iniciar Checkout Simulado · ' + (valorEfetivo | currency:'BRL') }}
                  </button>
                } @else {
                  <div class="active-checkout-panel">
                    <div class="tx-header-pill">
                      <span>ID: <strong>{{ transacaoAtual?.paymentId || pedido.paymentId }}</strong></span>
                      <span class="status-pill">{{ traduzirStatusGateway(transacaoAtual?.status || 'PENDING') }}</span>
                    </div>

                    <!-- MODALIDADE PIX SIMULADO -->
                    @if (metodoPagamento === 'pix') {
                      <div class="pix-simulation-panel">
                        <div class="qr-placeholder" aria-hidden="true">
                          <div class="qr-grid">
                            <span>▪▫▪</span>
                            <span>▫▪▫</span>
                            <span>▪▫▪</span>
                          </div>
                          <small>QR Code Fictício ChArte</small>
                        </div>
                        <label for="pix-code-input">Código PIX Copia e Cola (Fictício)</label>
                        <div class="pix-copy-row">
                          <input
                            id="pix-code-input"
                            type="text"
                            readonly
                            [value]="codigoPixAtual"
                          />
                          <button type="button" class="btn-copy" (click)="copiarCodigoPix()">
                            {{ pixCopiado ? '✓ Copiado' : 'Copiar' }}
                          </button>
                        </div>
                      </div>
                    }

                    <!-- MODALIDADE CARTÃO SIMULADO -->
                    @if (metodoPagamento === 'card') {
                      <div class="card-simulation-panel">
                        <div class="quick-fill-row">
                          <button type="button" class="btn-quick approve" (click)="preencherCartaoTeste('aprovado')">
                            ✓ Cartão Teste Aprovado (4242)
                          </button>
                          <button type="button" class="btn-quick decline" (click)="preencherCartaoTeste('recusado')">
                            ✕ Cartão Teste Recusado (0000)
                          </button>
                        </div>

                        <label for="card-holder">Nome do titular (fictício)</label>
                        <input
                          id="card-holder"
                          type="text"
                          [(ngModel)]="cartaoTitular"
                          name="cartaoTitular"
                          placeholder="Ex.: MARIA A SILVA"
                        />

                        <div class="card-row-split">
                          <div>
                            <label for="card-last4">Últimos 4 dígitos</label>
                            <input
                              id="card-last4"
                              type="text"
                              maxlength="4"
                              [(ngModel)]="cartaoUltimos4"
                              name="cartaoUltimos4"
                              placeholder="4242"
                            />
                          </div>
                          <div>
                            <label for="card-installments">Parcelas</label>
                            <select id="card-installments" [(ngModel)]="cartaoParcelas" name="cartaoParcelas">
                              <option [ngValue]="1">1x sem juros</option>
                              <option [ngValue]="2">2x sem juros</option>
                              <option [ngValue]="3">3x sem juros</option>
                              <option [ngValue]="6">6x sem juros</option>
                            </select>
                          </div>
                        </div>
                        <small class="security-note">
                          Segurança: Não informe nem armazenamos número completo de cartão ou CVV.
                        </small>
                      </div>
                    }

                    <!-- MODALIDADE TRANSFERÊNCIA / BOLETO SIMULADO -->
                    @if (metodoPagamento === 'transfer') {
                      <div class="transfer-simulation-panel">
                        <label>Linha digitável fictícia (Simulação Interna)</label>
                        <code class="boleto-code">00190.00009 02026.110104 00000.123456 8 00000000015000</code>
                        <small>Compensação simulada imediata ao confirmar a operação abaixo.</small>
                      </div>
                    }

                    <!-- SELETOR DE CENÁRIO DA SIMULAÇÃO -->
                    <div class="outcome-selector">
                      <label>Resultado desejado na simulação:</label>
                      <div class="outcome-options">
                        <label class="radio-pill" [class.selected]="resultadoSimulacao === 'APPROVED'">
                          <input type="radio" name="outcome" value="APPROVED" [(ngModel)]="resultadoSimulacao" />
                          Simular Aprovação
                        </label>
                        <label class="radio-pill decline" [class.selected]="resultadoSimulacao === 'DECLINED'">
                          <input type="radio" name="outcome" value="DECLINED" [(ngModel)]="resultadoSimulacao" />
                          Simular Recusa
                        </label>
                      </div>
                    </div>

                    @if (processandoSimulacao) {
                      <div class="processing-banner" role="status">
                        <span class="spinner"></span>
                        <span>Processando transação no simulador financeiro do backend…</span>
                      </div>
                    }

                    <button
                      class="pay-button confirm-btn"
                      type="button"
                      [disabled]="pagamentoCarregando || processandoSimulacao"
                      (click)="confirmarPagamentoSimulado()"
                    >
                      {{ processandoSimulacao ? 'Processando pagamento…' : 'Confirmar Pagamento Simulado · ' + (valorEfetivo | currency:'BRL') }}
                    </button>

                    <button
                      type="button"
                      class="verify-payment"
                      [disabled]="pagamentoCarregando || processandoSimulacao"
                      (click)="cancelarCheckoutAtual()"
                    >
                      Cancelar tentativa atual
                    </button>
                  </div>
                }

                @if (pagamentoMensagem) {
                  <div class="payment-feedback-box" [class.error]="pagamentoErro" [class.success]="!pagamentoErro">
                    <strong>{{ pagamentoErro ? 'Pagamento não aprovado' : 'Atualização do pagamento' }}</strong>
                    <p>{{ pagamentoMensagem }}</p>
                  </div>
                }
              </section>
            } @else if (pedido.pagamentoStatus === 'pago' || pedido.status === 'Em andamento' || pedido.status === 'Entregue' || pedido.status === 'Finalizada') {
              <section class="paid-receipt-card" aria-label="Comprovante de pagamento simulado">
                <div class="receipt-badge">✓ PAGAMENTO SIMULADO APROVADO</div>
                <h3>Comprovante da Contratação</h3>
                <p>Pagamento confirmado pelo simulador interno. O artista já pode produzir e entregar sua obra.</p>
                <dl class="receipt-dl">
                  <div>
                    <dt>ID da Transação</dt>
                    <dd>{{ transacaoAtual?.paymentId || pedido.paymentId || 'SIM-' + pedido.id }}</dd>
                  </div>
                  <div>
                    <dt>Modalidade</dt>
                    <dd>{{ transacaoAtual?.method || pedido.pagamento || 'PIX Simulado' }}</dd>
                  </div>
                  <div>
                    <dt>Valor Pago</dt>
                    <dd>{{ valorEfetivo | currency:'BRL' }}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>APROVADO (Pago)</dd>
                  </div>
                </dl>
                @if (pagamentoMensagem) {
                  <p class="payment-message" [class.error]="pagamentoErro">{{ pagamentoMensagem }}</p>
                }
                <button
                  type="button"
                  class="refund-btn"
                  [disabled]="pagamentoCarregando"
                  (click)="solicitarReembolsoSimulado()"
                >
                  Simular estorno / reembolso
                </button>
              </section>
            }

            <h3>Descrição do Pedido</h3>
            <p class="description">{{ pedido.descricao }}</p>

            @if (pedido.referencias.length) {
              <h3>Referências / Imagem da Obra</h3>
              <div class="reference-list">
                @for (ref of pedido.referencias; track ref) {
                  @if (ref.startsWith('data:image') || ref.startsWith('http') || ref.startsWith('/')) {
                    <img class="reference-image" [src]="ref" alt="Imagem de referência da obra" />
                  } @else {
                    <a [href]="ref" target="_blank" rel="noopener">Abrir referência ↗</a>
                  }
                }
              </div>
            }

            @if (pedido.status === 'Solicitada' || (pedido.status === 'Pendente' && pedido.pagamentoStatus !== 'pago')) {
              <button class="cancel-order" type="button" [disabled]="statusCarregando" (click)="cancelar()">
                {{ statusCarregando ? 'Atualizando…' : 'Cancelar pedido' }}
              </button>
            }
          </aside>
        </div>
      } @else if (carregandoPedido) {
        <section class="missing-order">
          <h1>Carregando pedido...</h1>
          <p>Aguarde enquanto buscamos os detalhes da contratação.</p>
        </section>
      } @else {
        <section class="missing-order">
          <h1>Pedido não encontrado</h1>
          <p>Este pedido não existe ou não pertence à sua conta.</p>
          <a routerLink="/carrinho" [queryParams]="{ aba: 'pedidos' }">Voltar aos pedidos</a>
        </section>
      }
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#151217;color:#f8f5fa}
    .order-detail-page{max-width:1160px;margin:auto;padding:36px 24px 80px}
    .top-nav-links{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
    .back-link{color:#c994e4;text-decoration:none;font-weight:700;font-size:13px}
    .back-link.secondary{color:#9e94a3}
    .back-link:hover{text-decoration:underline}
    .detail-heading{margin:24px 0}
    .heading-badges{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .badge-order,.detail-label{color:#ba7bd6;font-size:10px;font-weight:800;letter-spacing:.13em}
    .badge-sim{background:#2d2235;border:1px solid #593d6b;color:#dcb2f2;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px}
    .detail-heading h1{font-size:32px;margin:8px 0}
    .detail-heading p{color:#aaa0af;margin:0;font-size:14px}
    .detail-heading a{color:#d396f1;text-decoration:none;font-weight:700}
    .detail-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(340px,.95fr);gap:20px;align-items:start}
    .left-column{display:grid;gap:20px}
    .detail-card{background:#211b25;border:1px solid #3b313f;border-radius:16px;padding:24px}
    .detail-card-heading{display:flex;align-items:center;justify-content:space-between;gap:15px}
    .detail-card h2{font-size:19px;margin:7px 0 0}
    .detail-status{background:#45371c;color:#efce89;border-radius:20px;padding:7px 12px;font-size:12px;font-weight:700}
    .detail-status.paid{background:#1e3b2b;color:#a9e0b8}
    .detail-status.failed{background:#482328;color:#ffb3ba}
    .status-timeline{list-style:none;margin:27px 0 10px;padding:0}
    .status-timeline li{position:relative;display:flex;gap:14px;min-height:64px;color:#827986}
    .status-timeline li:not(:last-child):before{content:'';position:absolute;width:2px;background:#49404d;left:7px;top:16px;bottom:0}
    .status-timeline li.done{color:#f4edf7}
    .status-timeline li.waiting{color:#efce89}
    .status-timeline li.waiting i{border-color:#d7a64b}
    .status-timeline li.done:before{background:#b263d3}
    .status-timeline i{z-index:1;flex:0 0 14px;height:14px;border:2px solid #625968;border-radius:50%;background:#211b25}
    .status-timeline li.done i{border-color:#c27be0;background:#c27be0;box-shadow:0 0 0 4px #633b7044}
    .status-timeline strong,.status-timeline small{display:block}
    .status-timeline small{color:#9e94a3;margin-top:4px}
    .tx-list{display:grid;gap:10px;margin-top:16px}
    .tx-item{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#19151c;border:1px solid #352c3a;border-radius:10px}
    .tx-main{display:grid;gap:3px}
    .tx-id{font-family:monospace;font-size:11px;color:#b89ec4}
    .tx-main strong{font-size:13px}
    .tx-main small,.tx-meta small{font-size:11px;color:#988d9e}
    .tx-meta{text-align:right;display:grid;gap:4px;justify-items:end}
    .tx-badge{font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;background:#3a3140;color:#e3d8ea}
    .tx-badge[data-status="APPROVED"],.tx-badge[data-status="PAID"]{background:#1e3b2b;color:#a9e0b8}
    .tx-badge[data-status="DECLINED"],.tx-badge[data-status="FAILED"],.tx-badge[data-status="CANCELLED"]{background:#482328;color:#ffb3ba}
    .tx-badge[data-status="REFUNDED"]{background:#3f311b;color:#f5d08a}
    .empty-tx{color:#988d9e;font-size:13px;margin:14px 0 0}
    .summary-card h2{margin:8px 0 18px}
    .summary-card dl{margin:0}
    .summary-card dl div{display:flex;justify-content:space-between;gap:15px;border-bottom:1px solid #3b313f;padding:10px 0;font-size:13px}
    .summary-card dt{color:#aaa0af}
    .summary-card dd{margin:0;text-align:right}
    .price-highlight{font-size:16px;font-weight:800;color:#e3b5ff}
    .summary-card dd a,.reference-list a{color:#d396f1;text-decoration:none}
    .summary-card h3{font-size:13px;margin:20px 0 6px}
    .description,.delivery-result p{white-space:pre-wrap;color:#c5bac9;line-height:1.6;font-size:13px;margin:0}
    .reference-list{display:grid;gap:8px;font-size:13px;margin-top:8px}
    .reference-image{width:100%;max-height:240px;object-fit:contain;background:#171319;border-radius:8px}
    .payment-box{margin-top:18px;padding:18px;background:#19151c;border:1px solid #493450;border-radius:14px}
    .payment-box h3{margin:6px 0}
    .sim-disclaimer{font-size:11px;color:#b89ec4;margin:4px 0 12px}
    .method-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}
    .method-tabs button{padding:9px 6px;font-size:11px;font-weight:700;border-radius:8px;border:1px solid #433749;background:#211b25;color:#cfc5d4;cursor:pointer}
    .method-tabs button.active{background:#4a295e;border-color:#b263d3;color:#fff}
    .active-checkout-panel{margin-top:12px;display:grid;gap:12px}
    .tx-header-pill{display:flex;justify-content:space-between;align-items:center;background:#231c28;padding:8px 12px;border-radius:8px;font-size:11px;color:#cbbdd2}
    .status-pill{background:#3d2f47;color:#e5c5f7;padding:2px 8px;border-radius:99px;font-weight:700}
    .pix-simulation-panel,.card-simulation-panel,.transfer-simulation-panel{background:#211b25;border:1px solid #382e3d;border-radius:10px;padding:12px;display:grid;gap:8px}
    .qr-placeholder{display:grid;place-items:center;padding:12px;background:#151118;border:1px dashed #5c436b;border-radius:8px;text-align:center}
    .qr-grid{display:grid;font-size:20px;line-height:1.1;letter-spacing:4px;color:#d699f5}
    .pix-copy-row{display:flex;gap:6px}
    .pix-copy-row input{flex:1;padding:9px;border-radius:7px;border:1px solid #4d4054;background:#161219;color:#e2d7e8;font-size:11px;font-family:monospace}
    .btn-copy{padding:0 12px;border-radius:7px;border:1px solid #964ec2;background:#3a214a;color:#f3e5fa;font-weight:700;font-size:12px;cursor:pointer}
    .quick-fill-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .btn-quick{padding:6px 8px;font-size:10px;font-weight:700;border-radius:6px;cursor:pointer;border:1px solid transparent}
    .btn-quick.approve{background:#1b3326;border-color:#2f6846;color:#a9e0b8}
    .btn-quick.decline{background:#3b1e23;border-color:#75353f;color:#ffb8bd}
    .card-simulation-panel label,.pix-simulation-panel label,.transfer-simulation-panel label{font-size:11px;color:#b9aebd;margin:2px 0 0}
    .card-simulation-panel input,.card-simulation-panel select{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:7px;border:1px solid #4d4054;background:#161219;color:#fff;font-size:12px}
    .card-row-split{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .security-note{font-size:10px;color:#94889a}
    .boleto-code{display:block;padding:10px;background:#161219;border-radius:6px;font-size:11px;color:#e0d4e6;word-break:break-all}
    .outcome-selector{background:#211b25;padding:10px 12px;border-radius:9px;border:1px solid #382e3d}
    .outcome-selector>label{display:block;font-size:11px;color:#b9aebd;margin-bottom:6px}
    .outcome-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .radio-pill{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:7px 10px;border-radius:7px;border:1px solid #453a4b;cursor:pointer;color:#d6cbd9}
    .radio-pill.selected{border-color:#7bc995;background:#1b3326;color:#b5ecc6}
    .radio-pill.decline.selected{border-color:#d46b76;background:#3b1e23;color:#ffc2c7}
    .processing-banner{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:#2f2238;color:#e7c8f7;font-size:12px}
    .spinner{width:14px;height:14px;border:2px solid #e7c8f7;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .pay-button{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:12px;text-align:center;border:0;border-radius:9px;background:#a447d2;color:#fff;font-weight:700;text-decoration:none;cursor:pointer;font-size:13px}
    .pay-button.confirm-btn{background:linear-gradient(135deg,#9b3dc8,#7528a3)}
    .pay-button:disabled,.verify-payment:disabled{opacity:.6;cursor:wait}
    .verify-payment{width:100%;margin-top:4px;border:0;background:transparent;color:#d7a0ef;cursor:pointer;font-size:12px}
    .payment-feedback-box{margin-top:12px;padding:12px;border-radius:9px;font-size:12px}
    .payment-feedback-box.success{background:#1e3b2b;color:#b4e6c2;border:1px solid #2f6846}
    .payment-feedback-box.error{background:#3d1f24;color:#ffc2c7;border:1px solid #783741}
    .payment-feedback-box p{margin:4px 0 0;color:inherit}
    .paid-receipt-card{margin-top:18px;padding:18px;border-radius:12px;background:#182b22;border:1px solid #2e6144;color:#d4f5dd}
    .receipt-badge{display:inline-block;font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;background:#254d37;color:#9ef0b6}
    .paid-receipt-card h3{margin:8px 0 4px;font-size:16px}
    .paid-receipt-card p{font-size:12px;color:#b6dec2;margin:0 0 12px}
    .receipt-dl div{border-bottom-color:#274a36!important;padding:7px 0!important}
    .refund-btn{margin-top:12px;width:100%;padding:9px;border-radius:8px;border:1px solid #6b5635;background:#2e2518;color:#f2d194;font-size:12px;font-weight:700;cursor:pointer}
    .cancel-order{width:100%;margin-top:20px;padding:11px;border:1px solid #a75058;color:#ffb8bd;background:transparent;border-radius:10px;font-weight:700;cursor:pointer}
    .cancel-order:hover{background:#53292d}
    .delivery-result{margin-top:18px;padding:18px;background:#19151c;border:1px solid #453450;border-radius:14px;display:grid;gap:12px}
    .delivery-header h3{margin:4px 0 0;font-size:18px}
    .delivery-result img{width:100%;max-height:440px;object-fit:contain;border-radius:10px;background:#120f14;border:1px solid #322839}
    .delivery-links a{color:#d396f1;font-size:12px;font-weight:700;text-decoration:none}
    .delivery-links a:hover{text-decoration:underline}
    .delivery-note{padding:10px 12px;border-radius:8px;background:#221c27;border:1px solid #382e3f}
    .delivery-approval-box{padding:14px 16px;border-radius:12px;background:#221a29;border:1px solid #6b4488;display:grid;gap:8px}
    .delivery-approval-box h4{margin:0;font-size:15px;color:#f3e5fa}
    .delivery-approval-box p{margin:0;font-size:12px;color:#cabcd2}
    .approval-actions{display:grid;gap:8px;margin-top:4px}
    .approve-delivery-btn{background:linear-gradient(135deg,#2d8a56,#1f663e)!important;margin-top:0}
    .revision-btn{margin-top:0!important;padding:9px!important;font-size:12px}
    .delivery-approval-box.completed-box{background:#182b22;border-color:#2e6144;color:#b8f2c9}
    .delivery-approval-box.waiting-client{background:#2b2418;border-color:#6b5635;color:#f2d194}
    .missing-order{padding:100px 0;text-align:center}
    .missing-order p{color:#aaa0af}
    .missing-order a{color:#d396f1}
    @media(max-width:820px){.order-detail-page{padding:24px 16px 55px}.detail-grid{grid-template-columns:1fr}.detail-heading h1{font-size:26px}}
  `],
})
export class OrderDetail implements OnInit, OnDestroy {
  pedido?: Comissao;
  carregandoPedido = true;
  private pedidoSubscription?: Subscription;

  pagamentoCarregando = false;
  processandoSimulacao = false;
  pagamentoMensagem = '';
  pagamentoErro = false;
  statusMensagem = '';
  statusErro = false;
  statusCarregando = false;

  metodoPagamento: 'pix' | 'card' | 'transfer' = 'pix';
  checkoutAtivo = false;
  transacaoAtual: PaymentView | null = null;
  historicoPedido: PaymentView[] = [];
  pixCopiado = false;

  cartaoTitular = 'CLIENTE TESTE CHARTE';
  cartaoUltimos4 = '4242';
  cartaoParcelas = 1;
  resultadoSimulacao: 'APPROVED' | 'DECLINED' = 'APPROVED';

  get valorEfetivo(): number {
    return Number(this.pedido?.propostaValor ?? this.pedido?.valor ?? 0);
  }

  get podePagar(): boolean {
    if (!this.pedido) return false;
    return (
      this.pedido.status === 'Pendente' &&
      this.pedido.pagamentoStatus !== 'pago'
    );
  }

  get codigoPixAtual(): string {
    if (this.transacaoAtual?.pixCode) {
      return this.transacaoAtual.pixCode;
    }
    if (!this.pedido) return '';
    return this.pagamentos.gerarCodigoPixSimulado(
      this.pedido.id,
      this.pedido.paymentId || `pay_${this.pedido.id}`,
      this.valorEfetivo,
    );
  }

  get statusExibido(): string {
    if (!this.pedido) return '';
    if (this.pedido.status === 'Entregue') {
      return 'Arte enviada · Aguardando aprovação';
    }
    if (this.pedido.status === 'Finalizada') {
      return 'Comissão concluída';
    }
    if (this.pedido.pagamentoStatus === 'pago' && this.pedido.status === 'Pendente') {
      return 'Pago · Em produção';
    }
    if (this.pedido.status === 'Pendente' && this.pedido.pagamentoStatus === 'pendente') {
      return 'Aguardando pagamento';
    }
    if (this.pedido.status === 'Pendente' && this.pedido.pagamentoStatus === 'falhou') {
      return 'Pagamento recusado';
    }
    return this.pedido.status;
  }

  get ehClienteDoPedido(): boolean {
    const usuario = this.auth.getUsuarioLogado();
    if (!usuario || !this.pedido) return false;
    return this.pedido.cliente.username.toLowerCase() === usuario.nomeUsuario.toLowerCase();
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private artistData: ArtistAreaService,
    private auth: AuthService,
    private pagamentos: PaymentService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const usuario = this.auth.getUsuarioLogado();

    if (!Number.isFinite(id) || id <= 0 || !usuario) {
      this.carregandoPedido = false;
      this.cdr.detectChanges();
      return;
    }

    let dadosPagamentoCarregados = false;
    this.pedidoSubscription = combineLatest([
      this.artistData.comissoesCarregadas$,
      this.artistData.comissoes$,
    ]).subscribe(([carregadas]) => {
      if (!carregadas) return;

      const encontrado = this.artistData.obterComissao(id);
      const pertenceAoUsuario =
        encontrado?.cliente.username.toLowerCase() === usuario.nomeUsuario.toLowerCase() ||
        (encontrado
          ? this.artistData.correspondeAoArtista(encontrado.artistaUsername, usuario.nomeUsuario)
          : false) ||
        (usuario.nomeArtistico && encontrado
          ? this.artistData.correspondeAoArtista(encontrado.artistaUsername, usuario.nomeArtistico)
          : false);

      if (encontrado && pertenceAoUsuario) {
        this.pedido = { ...encontrado };
        if (!dadosPagamentoCarregados) {
          dadosPagamentoCarregados = true;
          void this.carregarDadosPagamento(encontrado.id);
        }
      }

      this.carregandoPedido = false;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.pedidoSubscription?.unsubscribe();
  }

  selecionarMetodo(metodo: 'pix' | 'card' | 'transfer'): void {
    this.metodoPagamento = metodo;
    this.pagamentoMensagem = '';
    this.pagamentoErro = false;
    this.cdr.detectChanges();
  }

  preencherCartaoTeste(tipo: 'aprovado' | 'recusado'): void {
    if (tipo === 'aprovado') {
      this.cartaoTitular = 'MARIA SILVA APROVADO';
      this.cartaoUltimos4 = '4242';
      this.resultadoSimulacao = 'APPROVED';
    } else {
      this.cartaoTitular = 'CARTAO TESTE RECUSADO';
      this.cartaoUltimos4 = '0000';
      this.resultadoSimulacao = 'DECLINED';
    }
    this.cdr.detectChanges();
  }

  copiarCodigoPix(): void {
    const codigo = this.codigoPixAtual;
    if (!codigo) return;
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(codigo);
    }
    this.pixCopiado = true;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.pixCopiado = false;
      this.cdr.detectChanges();
    }, 2500);
  }

  async iniciarPagamento(): Promise<void> {
    if (!this.pedido || !this.podePagar || this.pagamentoCarregando) return;
    this.pagamentoCarregando = true;
    this.pagamentoErro = false;
    this.pagamentoMensagem = '';
    this.cdr.detectChanges();

    try {
      const view = await this.pagamentos.iniciarCheckout(this.pedido.id, this.metodoPagamento);
      this.transacaoAtual = view;
      this.checkoutAtivo = true;
      await this.artistData.vincularCheckout(
        this.pedido.id,
        view.paymentId,
        view.checkoutUrl,
        'pendente',
        this.metodoPagamento,
      );
      const atualizado = this.artistData.obterComissao(this.pedido.id);
      if (atualizado) {
        this.pedido = { ...atualizado };
      }
      await this.carregarHistoricoPedido(this.pedido!.id);
    } catch (err: any) {
      this.pagamentoErro = true;
      this.pagamentoMensagem =
        err?.message || 'Não foi possível iniciar o checkout simulado.';
    } finally {
      this.pagamentoCarregando = false;
      this.cdr.detectChanges();
    }
  }

  async confirmarPagamentoSimulado(): Promise<void> {
    if (!this.pedido || this.processandoSimulacao) return;

    if (this.metodoPagamento === 'card') {
      if (this.cartaoTitular.trim().length < 3) {
        this.pagamentoErro = true;
        this.pagamentoMensagem = 'Informe o nome do titular do cartão simulado.';
        this.cdr.detectChanges();
        return;
      }
      if (!/^\d{4}$/.test(this.cartaoUltimos4.trim())) {
        this.pagamentoErro = true;
        this.pagamentoMensagem = 'Informe exatamente os 4 últimos dígitos do cartão simulado.';
        this.cdr.detectChanges();
        return;
      }
    }

    this.processandoSimulacao = true;
    this.pagamentoErro = false;
    this.pagamentoMensagem = '';
    this.cdr.detectChanges();

    try {
      const pedidoId = this.pedido.id;
      let paymentId = this.transacaoAtual?.paymentId || this.pedido.paymentId;
      if (!paymentId) {
        const criado = await this.pagamentos.iniciarCheckout(pedidoId, this.metodoPagamento);
        this.transacaoAtual = criado;
        paymentId = criado.paymentId;
      }

      const resultado = await this.pagamentos.processarPagamentoSimulado(
        paymentId,
        {
          method: this.metodoPagamento,
          cardHolderName: this.metodoPagamento === 'card' ? this.cartaoTitular.trim() : undefined,
          cardLast4: this.metodoPagamento === 'card' ? this.cartaoUltimos4.trim() : undefined,
          cardBrand: 'ChArte SimCard',
          installments: this.cartaoParcelas,
          pixCode: this.codigoPixAtual,
          simulateOutcome: this.resultadoSimulacao,
        },
        pedidoId,
      );

      this.transacaoAtual = resultado;
      const aprovado = resultado.status === 'APPROVED' || resultado.status === 'PAID';

      await this.artistData.atualizarPagamento(
        pedidoId,
        aprovado ? 'pago' : 'falhou',
        {
          paymentId: resultado.paymentId,
          metodo: resultado.method,
          checkoutUrl: resultado.checkoutUrl,
        },
      );
      await this.artistData.recarregarComissoes();
      const comissaoAtualizada = this.artistData.obterComissao(pedidoId);
      if (comissaoAtualizada) {
        this.pedido = {
          ...comissaoAtualizada,
          pagamentoStatus: aprovado ? 'pago' : 'falhou',
          status:
            aprovado &&
            comissaoAtualizada.status !== 'Entregue' &&
            comissaoAtualizada.status !== 'Finalizada'
              ? 'Em andamento'
              : comissaoAtualizada.status,
          paymentId: resultado.paymentId || comissaoAtualizada.paymentId,
          pagamento: resultado.method || comissaoAtualizada.pagamento,
        };
      }
      await this.carregarHistoricoPedido(pedidoId);

      if (aprovado) {
        this.checkoutAtivo = false;
        this.pagamentoErro = false;
        this.pagamentoMensagem =
          resultado.simulationDetails ||
          'Pagamento simulado aprovado com sucesso! A comissão já está em andamento.';
      } else {
        this.checkoutAtivo = false;
        this.pagamentoErro = true;
        this.pagamentoMensagem =
          resultado.simulationDetails ||
          'Pagamento recusado na simulação. Você pode iniciar uma nova tentativa.';
      }
    } catch (err: any) {
      this.pagamentoErro = true;
      this.pagamentoMensagem =
        err?.message || 'Ocorreu um erro ao processar a simulação de pagamento.';
    } finally {
      this.processandoSimulacao = false;
      this.cdr.detectChanges();
    }
  }

  async cancelarCheckoutAtual(): Promise<void> {
    if (!this.pedido) return;
    const paymentId = this.transacaoAtual?.paymentId || this.pedido.paymentId;
    if (!paymentId) {
      this.checkoutAtivo = false;
      this.cdr.detectChanges();
      return;
    }

    this.pagamentoCarregando = true;
    this.cdr.detectChanges();
    try {
      const cancelado = await this.pagamentos.cancelarPagamento(paymentId, this.pedido.id);
      this.transacaoAtual = cancelado;
      this.checkoutAtivo = false;
      this.pagamentoErro = false;
      this.pagamentoMensagem = 'Tentativa de pagamento cancelada. Você pode escolher outra modalidade.';
      await this.carregarHistoricoPedido(this.pedido.id);
    } catch (err: any) {
      this.pagamentoErro = true;
      this.pagamentoMensagem = err?.message || 'Não foi possível cancelar a tentativa.';
    } finally {
      this.pagamentoCarregando = false;
      this.cdr.detectChanges();
    }
  }

  async solicitarReembolsoSimulado(): Promise<void> {
    if (!this.pedido) return;
    const paymentId = this.transacaoAtual?.paymentId || this.pedido.paymentId;
    if (!paymentId) return;

    this.pagamentoCarregando = true;
    this.cdr.detectChanges();
    try {
      const pedidoId = this.pedido.id;
      const reembolsado = await this.pagamentos.reembolsarPagamento(paymentId, pedidoId);
      this.transacaoAtual = reembolsado;
      await this.artistData.atualizarPagamento(pedidoId, 'falhou', { reembolso: true });
      await this.artistData.recarregarComissoes();
      const comissaoAtualizada = this.artistData.obterComissao(pedidoId);
      if (comissaoAtualizada) {
        this.pedido = {
          ...comissaoAtualizada,
          pagamentoStatus: 'falhou',
          status: 'Pendente',
        };
      }
      await this.carregarHistoricoPedido(pedidoId);
      this.pagamentoErro = false;
      this.pagamentoMensagem = 'Reembolso simulado registrado com sucesso.';
    } catch (err: any) {
      this.pagamentoErro = true;
      this.pagamentoMensagem = err?.message || 'Não foi possível simular o reembolso.';
    } finally {
      this.pagamentoCarregando = false;
      this.cdr.detectChanges();
    }
  }

  traduzirStatusGateway(status: string): string {
    switch (String(status || '').toUpperCase()) {
      case 'APPROVED':
      case 'PAID':
        return 'APROVADO';
      case 'DECLINED':
      case 'FAILED':
        return 'RECUSADO';
      case 'CANCELLED':
        return 'CANCELADO';
      case 'REFUNDED':
        return 'REEMBOLSADO';
      case 'PROCESSING':
        return 'PROCESSANDO';
      default:
        return 'PENDENTE';
    }
  }

  private async carregarDadosPagamento(orderId: number): Promise<void> {
    await this.carregarHistoricoPedido(orderId);
    if (this.historicoPedido.length > 0) {
      this.transacaoAtual = this.historicoPedido[0];
      if (this.transacaoAtual.status === 'PENDING' || this.transacaoAtual.status === 'PROCESSING') {
        this.checkoutAtivo = true;
      }
    }
    this.cdr.detectChanges();
  }

  private async carregarHistoricoPedido(orderId: number): Promise<void> {
    try {
      this.historicoPedido = await this.pagamentos.listarHistoricoPorPedido(orderId);
    } catch {
      this.historicoPedido = [];
    }
    this.cdr.detectChanges();
  }

  async aprovarProposta(): Promise<void> {
    if (!this.pedido || this.pedido.status !== 'Aguardando aprovação do cliente' || this.statusCarregando) return;

    this.statusCarregando = true;
    this.statusMensagem = '';
    this.statusErro = false;
    this.cdr.detectChanges();

    try {
      const atualizado = await this.artistData.atualizarStatus(this.pedido.id, 'Pendente');
      if (!atualizado) {
        this.statusMensagem = 'Não foi possível aprovar a proposta. Verifique sua conexão e tente novamente.';
        this.statusErro = true;
        return;
      }

      const comissao = this.artistData.obterComissao(this.pedido.id);
      if (comissao) {
        this.pedido = { ...comissao };
      }
      this.statusMensagem = 'Proposta aprovada! Escolha a modalidade abaixo para realizar o pagamento simulado.';
    } catch {
      this.statusMensagem = 'Ocorreu um erro ao aprovar a proposta. Tente novamente.';
      this.statusErro = true;
    } finally {
      this.statusCarregando = false;
      this.cdr.detectChanges();
    }
  }

  async cancelar(): Promise<void> {
    if (!this.pedido || !['Solicitada', 'Aguardando aprovação do cliente', 'Pendente'].includes(this.pedido.status) || this.statusCarregando) return;

    this.statusCarregando = true;
    this.statusMensagem = '';
    this.statusErro = false;
    this.cdr.detectChanges();

    try {
      const atualizado = await this.artistData.atualizarStatus(this.pedido.id, 'Cancelada');
      if (!atualizado) {
        this.statusMensagem = 'Não foi possível cancelar o pedido.';
        this.statusErro = true;
        return;
      }

      const comissao = this.artistData.obterComissao(this.pedido.id);
      if (comissao) {
        this.pedido = { ...comissao };
      }
      this.statusMensagem = 'Pedido cancelado.';
    } catch {
      this.statusMensagem = 'Ocorreu um erro ao cancelar o pedido.';
      this.statusErro = true;
    } finally {
      this.statusCarregando = false;
      this.cdr.detectChanges();
    }
  }

  async aprovarEntrega(): Promise<void> {
    if (!this.pedido || this.pedido.status !== 'Entregue' || this.statusCarregando) return;

    this.statusCarregando = true;
    this.statusMensagem = '';
    this.statusErro = false;
    this.cdr.detectChanges();

    try {
      const ok = await this.artistData.aprovarEntregaCliente(this.pedido.id);
      if (!ok) {
        this.statusMensagem = 'Não foi possível registrar a aprovação da entrega.';
        this.statusErro = true;
        return;
      }

      const comissao = this.artistData.obterComissao(this.pedido.id);
      if (comissao) {
        this.pedido = { ...comissao, status: 'Finalizada' };
      }
      this.statusMensagem = 'Arte aprovada com sucesso! A comissão foi concluída.';
    } catch {
      this.statusMensagem = 'Ocorreu um erro ao aprovar a entrega.';
      this.statusErro = true;
    } finally {
      this.statusCarregando = false;
      this.cdr.detectChanges();
    }
  }

  async solicitarAjustesEntrega(): Promise<void> {
    if (!this.pedido || this.pedido.status !== 'Entregue' || this.statusCarregando) return;

    this.statusCarregando = true;
    this.statusMensagem = '';
    this.statusErro = false;
    this.cdr.detectChanges();

    try {
      const ok = await this.artistData.solicitarRevisaoEntrega(this.pedido.id);
      if (!ok) {
        this.statusMensagem = 'Não foi possível solicitar ajustes no momento.';
        this.statusErro = true;
        return;
      }

      const comissao = this.artistData.obterComissao(this.pedido.id);
      if (comissao) {
        this.pedido = { ...comissao, status: 'Em andamento' };
      }
      this.statusMensagem = 'Solicitação de ajustes enviada! O pedido voltou para produção.';
    } catch {
      this.statusMensagem = 'Ocorreu um erro ao solicitar ajustes.';
      this.statusErro = true;
    } finally {
      this.statusCarregando = false;
      this.cdr.detectChanges();
    }
  }
}
