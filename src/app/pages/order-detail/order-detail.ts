import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ArtistAreaService } from '../../../services/artist-area.service';
import { AuthService } from '../../../services/auth.service';
import { Comissao } from '../../models/artist-area';
import { PaymentService } from '../../../services/payment.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-order-detail', standalone: true, imports: [CurrencyPipe, DatePipe, RouterLink],
  template: `
    <main class="order-detail-page">
      @if (pedido) {
        <a class="back-link" routerLink="/carrinho" [queryParams]="{ aba: 'pedidos' }">← Voltar aos pedidos</a>
        <header class="detail-heading"><span>PEDIDO #{{ pedido.id }}</span><h1>{{ pedido.titulo }}</h1><p>Solicitado em {{ pedido.criadaEm | date:'dd/MM/yyyy' }}</p></header>
        <div class="detail-grid">
          <section class="detail-card"><div class="detail-card-heading"><div><span class="detail-label">ACOMPANHAMENTO</span><h2>Status do pedido</h2></div><span class="detail-status">{{ statusExibido }}</span></div>
            <ol class="status-timeline"><li class="done"><i></i><div><strong>Solicitação enviada</strong><small>A artista está analisando seu pedido</small></div></li><li [class.done]="pedido.status !== 'Solicitada' && pedido.status !== 'Recusada' && pedido.status !== 'Cancelada'"><i></i><div><strong>Proposta da artista</strong><small>{{ pedido.status === 'Solicitada' ? 'Aguardando análise' : pedido.status === 'Recusada' ? 'Solicitação recusada' : 'Confira o valor e o prazo propostos' }}</small></div></li><li [class.done]="pedido.pagamentoStatus === 'pago'" [class.waiting]="pedido.status === 'Pendente' && pedido.pagamentoStatus !== 'pago'"><i></i><div><strong>{{ pedido.pagamentoStatus === 'pago' ? 'Pagamento confirmado' : 'Pagamento' }}</strong><small>{{ pedido.pagamentoStatus === 'pago' ? 'Pagamento confirmado pelo serviço' : pedido.status === 'Pendente' ? 'Pague para liberar o início da produção' : 'Disponível após aprovar a proposta' }}</small></div></li><li [class.done]="pedido.status === 'Em andamento' || pedido.status === 'Entregue' || pedido.status === 'Finalizada'"><i></i><div><strong>Em produção</strong><small>Sua arte está sendo criada</small></div></li><li [class.done]="pedido.status === 'Entregue' || pedido.status === 'Finalizada'"><i></i><div><strong>Arte entregue</strong><small>Confira a entrega abaixo</small></div></li></ol>
            @if ((pedido.status === 'Entregue' || pedido.status === 'Finalizada') && pedido.arquivoEntrega) { <div class="delivery-result"><h3>Entrega da artista</h3><img [src]="pedido.arquivoEntrega" alt="Arte entregue" />@if (pedido.observacaoEntrega) { <p>{{ pedido.observacaoEntrega }}</p> }</div> }
          </section>
          <aside class="detail-card summary-card"><span class="detail-label">RESUMO DO PEDIDO</span><h2>{{ pedido.opcaoTitulo || 'Comissão personalizada' }}</h2><dl><div><dt>Artista</dt><dd><a [routerLink]="['/perfil', pedido.artistaUsername]">@{{ pedido.artistaUsername }}</a></dd></div><div><dt>Valor</dt><dd>{{ (pedido.propostaValor ?? pedido.valor) | currency:'BRL' }}</dd></div><div><dt>Pagamento</dt><dd>{{ pedido.pagamento || 'Definido no checkout' }}</dd></div><div><dt>Prazo</dt><dd>{{ pedido.propostaPrazo || pedido.prazo }}</dd></div></dl>
            @if (pedido.status === 'Aguardando aprovação do cliente') { <section class="payment-box proposal-box"><span class="detail-label">PROPOSTA RECEBIDA</span><h3>Revise antes de aprovar</h3><p>A artista propôs {{ (pedido.propostaValor ?? pedido.valor) | currency:'BRL' }} com prazo de {{ pedido.propostaPrazo || pedido.prazo }}. Você só pagará depois de aprovar.</p>@if (statusMensagem) {
  <p class="payment-message" [class.error]="statusErro" aria-live="polite">{{ statusMensagem }}</p>
}<button type="button" class="pay-button" [disabled]="statusCarregando" (click)="aprovarProposta()">{{ statusCarregando ? 'Atualizando…' : 'Aprovar proposta' }}</button><button type="button" class="cancel-order" [disabled]="statusCarregando" (click)="cancelar()">Recusar proposta</button></section> }
            @if (pedido.status === 'Pendente' && pedido.pagamentoStatus !== 'pago') {
              <section class="payment-box"><span class="detail-label">PAGAMENTO</span><h3>Finalize o pagamento para liberar a produção</h3><p>A proposta foi aceita. O início da produção depende da confirmação do serviço de pagamento.</p>
                <label for="payment-method">Forma de pagamento</label><select id="payment-method" [value]="metodoPagamento" (change)="metodoPagamento = $any($event.target).value"><option value="pix">Pix</option><option value="card">Cartão</option><option value="transfer">Transferência bancária</option></select>
                @if (pagamentoMensagem) { <p class="payment-message" [class.error]="pagamentoErro">{{ pagamentoMensagem }}</p> }
                @if (pedido.checkoutUrl && pedido.pagamentoStatus === 'pendente') { <a class="pay-button" [href]="pedido.checkoutUrl">Continuar pagamento</a> }
                <button class="pay-button" type="button" [disabled]="pagamentoCarregando" (click)="iniciarPagamento()">{{ pagamentoCarregando ? 'Conectando ao checkout…' : 'Ir para pagamento · ' + ((pedido.propostaValor ?? pedido.valor) | currency:'BRL') }}</button>
                @if (pedido.paymentId) { <button type="button" class="verify-payment" [disabled]="pagamentoCarregando" (click)="verificarPagamento()">Já paguei · verificar status</button> }
              </section>
            } @else if (pedido.pagamentoStatus === 'pago') { <div class="paid-message">✓ Pagamento confirmado. A artista já pode iniciar a produção.</div> }
            <h3>Descrição</h3><p class="description">{{ pedido.descricao }}</p>@if (pedido.referencias.length) { <h3>Referências</h3><div class="reference-list">@for (ref of pedido.referencias; track ref) { @if (ref.startsWith('data:image')) { <img class="reference-image" [src]="ref" alt="Imagem de referência enviada" /> } @else { <a [href]="ref" target="_blank" rel="noopener">Abrir referência ↗</a> } }</div> }@if (pedido.status === 'Solicitada' || (pedido.status === 'Pendente' && pedido.pagamentoStatus !== 'pago')) { <button class="cancel-order" type="button" [disabled]="statusCarregando" (click)="cancelar()">{{ statusCarregando ? 'Atualizando…' : 'Cancelar pedido' }}</button> }</aside>
        </div>
      } @else if (carregandoPedido) {
        <section class="missing-order">
          <h1>Carregando pedido...</h1>
          <p>Aguarde enquanto buscamos os dados.</p>
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
    :host{display:block;min-height:100vh;background:#151217;color:#f8f5fa}.order-detail-page{max-width:1120px;margin:auto;padding:42px 24px 80px}.back-link{color:#c994e4;text-decoration:none;font-weight:700;font-size:13px}.detail-heading{margin:30px 0}.detail-heading>span,.detail-label{color:#ba7bd6;font-size:10px;font-weight:800;letter-spacing:.13em}.detail-heading h1{font-size:34px;margin:7px 0}.detail-heading p{color:#aaa0af;margin:0}.detail-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(300px,.8fr);gap:18px}.detail-card{background:#211b25;border:1px solid #3b313f;border-radius:16px;padding:24px}.detail-card-heading{display:flex;align-items:center;justify-content:space-between;gap:15px}.detail-card h2{font-size:19px;margin:7px 0 0}.detail-status{background:#45371c;color:#efce89;border-radius:20px;padding:7px 12px;font-size:12px;font-weight:700}.status-timeline{list-style:none;margin:27px 0;padding:0}.status-timeline li{position:relative;display:flex;gap:14px;min-height:66px;color:#827986}.status-timeline li:not(:last-child):before{content:'';position:absolute;width:2px;background:#49404d;left:7px;top:16px;bottom:0}.status-timeline li.done{color:#f4edf7}.status-timeline li.waiting{color:#efce89}.status-timeline li.waiting i{border-color:#d7a64b}.status-timeline li.done:before{background:#b263d3}.status-timeline i{z-index:1;flex:0 0 14px;height:14px;border:2px solid #625968;border-radius:50%;background:#211b25}.status-timeline li.done i{border-color:#c27be0;background:#c27be0;box-shadow:0 0 0 4px #633b7044}.status-timeline strong,.status-timeline small{display:block}.status-timeline small{color:#9e94a3;margin-top:4px}.summary-card h2{margin:8px 0 20px}.summary-card dl{margin:0}.summary-card dl div{display:flex;justify-content:space-between;gap:15px;border-bottom:1px solid #3b313f;padding:11px 0;font-size:13px}.summary-card dt{color:#aaa0af}.summary-card dd{margin:0;text-align:right}.summary-card dd a,.reference-list a{color:#d396f1;text-decoration:none}.summary-card h3{font-size:13px;margin:20px 0 6px}.description,.delivery-result p{white-space:pre-wrap;color:#c5bac9;line-height:1.6;font-size:13px;margin:0}.reference-list{display:grid;gap:7px;font-size:13px}.reference-image{width:100%;max-height:240px;object-fit:contain;background:#171319;border-radius:8px}.payment-box{margin-top:18px;padding:17px;background:#19151c;border:1px solid #493450;border-radius:12px}.payment-box h3{margin:7px 0}.payment-box p{font-size:12px;line-height:1.5;color:#b9aebd}.payment-box label{display:block;font-size:12px;margin:14px 0 6px}.payment-box select{width:100%;box-sizing:border-box;padding:11px;border:1px solid #514657;border-radius:8px;background:#211b25;color:#fff}.pay-button{display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:12px;text-align:center;border:0;border-radius:9px;background:#a447d2;color:#fff;font-weight:700;text-decoration:none;cursor:pointer}.pay-button:disabled,.verify-payment:disabled{opacity:.6;cursor:wait}.verify-payment{width:100%;margin-top:9px;border:0;background:transparent;color:#d7a0ef;cursor:pointer}.payment-message{margin:10px 0!important}.payment-message.error{color:#ffaaaa}.cancel-order:disabled{opacity:.6;cursor:wait}.paid-message{margin-top:18px;padding:13px;border-radius:9px;background:#1e3b2b;color:#a9e0b8;font-size:13px}.cancel-order{width:100%;margin-top:23px;padding:11px;border:1px solid #a75058;color:#ffb8bd;background:transparent;border-radius:10px;font-weight:700;cursor:pointer}.cancel-order:hover{background:#53292d}.delivery-result{margin-top:18px;padding:16px;background:#19151c;border-radius:12px}.delivery-result h3{margin-top:0}.delivery-result img{width:100%;max-height:400px;object-fit:contain;border-radius:8px}.delivery-result a{color:#d396f1}.missing-order{padding:100px 0;text-align:center}.missing-order p{color:#aaa0af}.missing-order a{color:#d396f1}@media(max-width:760px){.order-detail-page{padding:28px 16px 55px}.detail-grid{grid-template-columns:1fr}.detail-heading h1{font-size:28px}}
  `],
})
export class OrderDetail implements OnInit, OnDestroy {
  pedido?: Comissao;
  carregandoPedido = true;
  private pedidoSubscription?: Subscription;
  pagamentoCarregando = false;
  pagamentoMensagem = '';
  pagamentoErro = false;
  statusMensagem = '';
  statusErro = false;
  statusCarregando = false;
  metodoPagamento: 'pix' | 'card' | 'transfer' = 'pix';
  get statusExibido(): string { return this.pedido?.status === 'Pendente' && this.pedido.pagamentoStatus === 'pendente' ? 'Aguardando pagamento' : this.pedido?.status === 'Pendente' && this.pedido.pagamentoStatus === 'falhou' ? 'Pagamento recusado' : this.pedido?.status ?? ''; }
  constructor(private route: ActivatedRoute, private router: Router, private artistData: ArtistAreaService, private auth: AuthService, private pagamentos: PaymentService) {}
  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const usuario = this.auth.getUsuarioLogado();

    console.log('[Pedido] ID da rota:', id);
    console.log('[Pedido] Usuário logado:', usuario);
    console.log('[Pedido] Comissões atuais:', this.artistData.obterComissoesAtuais().length);

    if (!Number.isFinite(id) || id <= 0 || !usuario) {
      console.warn('[Pedido] Interrompido: ID inválido ou usuário indisponível.');
      this.carregandoPedido = false;
      return;
    }

    this.pedidoSubscription = this.artistData.comissoesCarregadas$.subscribe((carregadas) => {
      console.log('[Pedido] Comissões carregadas:', carregadas);
      if (!carregadas) return;

      const encontrado = this.artistData.obterComissao(id);
      console.log('[Pedido] Pedido encontrado:', encontrado);
      const pertenceAoUsuario =
        encontrado?.cliente.username.toLowerCase() === usuario.nomeUsuario.toLowerCase();

      if (encontrado && pertenceAoUsuario) {
        this.pedido = encontrado;

        if (encontrado.paymentId &&
            encontrado.pagamentoStatus !== 'pago' &&
            !this.pagamentoCarregando) {
          this.verificarPagamento();
        }
      }

      this.carregandoPedido = false;
    });
  }
  ngOnDestroy(): void { this.pedidoSubscription?.unsubscribe(); }
  iniciarPagamento(): void {
    if (!this.pedido || this.pedido.status !== 'Pendente' || this.pedido.pagamentoStatus === 'pago' || this.pagamentoCarregando) return;
    this.pagamentoCarregando = true;
    this.pagamentoErro = false;
    this.pagamentoMensagem = '';
    this.pagamentos.criarCheckout({ orderId: this.pedido.id, method: this.metodoPagamento }).subscribe({
      next: (resposta) => {
        const status = resposta.status === 'paid' ? 'pago' : resposta.status === 'failed' ? 'falhou' : 'pendente';
        this.artistData.vincularCheckout(this.pedido!.id, resposta.paymentId, resposta.checkoutUrl, status, this.metodoPagamento);
        this.pedido = this.artistData.obterComissao(this.pedido!.id);
        this.pagamentoCarregando = false;
        if (status === 'pago') this.pagamentoMensagem = 'Pagamento de teste simulado pelo servidor. Nenhum dinheiro foi recebido.';
        else if (status === 'falhou') { this.pagamentoMensagem = 'O pagamento não foi aprovado. Tente novamente.'; this.pagamentoErro = true; }
        else if (resposta.checkoutUrl) window.location.assign(resposta.checkoutUrl);
        else { this.pagamentoMensagem = 'O checkout foi criado, mas o servidor não retornou um link de pagamento.'; this.pagamentoErro = true; }
      },
      error: () => { this.pagamentoCarregando = false; this.pagamentoMensagem = 'Não foi possível conectar ao serviço de pagamento. Tente novamente.'; this.pagamentoErro = true; },
    });
  }
  verificarPagamento(): void {
    const paymentId = this.pedido?.paymentId;
    if (!paymentId || this.pagamentoCarregando) return;
    this.pagamentoCarregando = true;
    this.pagamentos.consultarStatus(paymentId).subscribe({
      next: (resposta) => {
        if (resposta.paymentId === paymentId) {
          const status = resposta.status === 'paid' ? 'pago' : resposta.status === 'failed' ? 'falhou' : 'pendente';
          this.artistData.atualizarPagamento(this.pedido!.id, status);
          this.pedido = this.artistData.obterComissao(this.pedido!.id);
          this.pagamentoMensagem = status === 'pago' ? 'Pagamento de teste simulado pelo servidor. Nenhum dinheiro foi recebido.' : status === 'falhou' ? 'O pagamento não foi aprovado. Tente novamente.' : 'Ainda aguardando a confirmação do pagamento.';
          this.pagamentoErro = status === 'falhou';
        }
        this.pagamentoCarregando = false;
      },
      error: () => { this.pagamentoCarregando = false; this.pagamentoMensagem = 'Não foi possível consultar o pagamento agora.'; this.pagamentoErro = true; },
    });
  }
  async aprovarProposta(): Promise<void> {
    if (!this.pedido || this.pedido.status !== 'Aguardando aprovação do cliente' || this.statusCarregando) return;

    this.statusCarregando = true;
    this.statusMensagem = '';
    this.statusErro = false;

    try {
      const atualizado = await this.artistData.atualizarStatus(this.pedido.id, 'Pendente');
      if (!atualizado) {
        this.statusMensagem = 'Não foi possível aprovar a proposta. Verifique sua conexão e tente novamente.';
        this.statusErro = true;
        return;
      }

      this.pedido = this.artistData.obterComissao(this.pedido.id);
      this.statusMensagem = 'Proposta aprovada. Você já pode seguir para o pagamento.';
    } catch (erro) {
      console.error('Erro ao aprovar proposta:', erro);
      this.statusMensagem = 'Ocorreu um erro ao aprovar a proposta. Tente novamente.';
      this.statusErro = true;
    } finally {
      this.statusCarregando = false;
    }
  }

  async cancelar(): Promise<void> {
    if (!this.pedido || !['Solicitada', 'Aguardando aprovação do cliente', 'Pendente'].includes(this.pedido.status) || this.statusCarregando) return;

    this.statusCarregando = true;
    this.statusMensagem = '';
    this.statusErro = false;

    try {
      const atualizado = await this.artistData.atualizarStatus(this.pedido.id, 'Cancelada');
      if (!atualizado) {
        this.statusMensagem = 'Não foi possível cancelar o pedido. Verifique sua conexão e tente novamente.';
        this.statusErro = true;
        return;
      }

      this.pedido = this.artistData.obterComissao(this.pedido.id);
      this.statusMensagem = 'Pedido cancelado.';
    } catch (erro) {
      console.error('Erro ao cancelar pedido:', erro);
      this.statusMensagem = 'Ocorreu um erro ao cancelar o pedido. Tente novamente.';
      this.statusErro = true;
    } finally {
      this.statusCarregando = false;
    }
  }
}
