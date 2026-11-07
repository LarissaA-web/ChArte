import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { supabase } from '../app/core/supabase/supabase.client';

export const PAYMENT_API_BASE_URL = '/api/payments';

export class PaymentApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PaymentApiError';
  }
}

export type MetodoPagamentoInput = 'pix' | 'card' | 'transfer' | 'PIX' | 'Cartao' | 'Transferencia';
export type StatusPagamentoGateway =
  | 'PENDING' | 'PROCESSING' | 'APPROVED' | 'PAID' | 'DECLINED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface CheckoutRequest { orderId: number; method: 'pix' | 'card' | 'transfer'; }
export interface CheckoutResponse { paymentId: string; checkoutUrl: string; status: 'pending' | 'paid' | 'failed'; pixCode?: string | null; }
export interface PaymentStatusResponse { paymentId: string; status: 'pending' | 'paid' | 'failed'; }
export interface ProcessarPagamentoPayload {
  method: 'pix' | 'card' | 'transfer'; cardHolderName?: string; cardLast4?: string;
  cardBrand?: string; installments?: number; pixCode?: string; simulateOutcome?: 'APPROVED' | 'DECLINED';
}
export interface PaymentView {
  paymentId: string; orderId: number; method: string; status: StatusPagamentoGateway;
  dbStatus?: 'Pendente' | 'Pago' | 'Cancelado' | 'Reembolso'; amount: number; checkoutUrl: string;
  pixCode?: string | null; simulationDetails?: string | null; paymentDate?: string | null;
  orderStatus?: string | null; orderTitle?: string | null; clientName?: string | null; artistName?: string | null;
}
export interface FinanceSummary {
  grossRevenue: number | null;
  platformFees: number | null;
  artistNet: number | null;
  heldBalance: number;
  availableBalance: number;
  approvedPayments: number;
  readyArtSales: number;
  commissions: number;
  pendingOrders: number;
  productionOrders: number;
  completedOrders: number;
  approvedPaymentsMissingMovements: number;
  monthlyRevenue: { month: string; gross: number; artistNet: number }[];
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private backendIndisponivelAte = 0;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
  ) {}

  private deveTentarBackend(): boolean {
    return Date.now() >= this.backendIndisponivelAte;
  }

  private marcarBackendIndisponivel(): void {
    this.backendIndisponivelAte = Date.now() + 60_000;
  }

  criarCheckout(dados: CheckoutRequest): Observable<CheckoutResponse> {
    return from(this.iniciarCheckout(dados.orderId, dados.method).then((view) => ({
      paymentId: view.paymentId, checkoutUrl: view.checkoutUrl,
      status: this.toLegacyStatus(view.status), pixCode: view.pixCode,
    })));
  }

  consultarStatus(paymentId: string): Observable<PaymentStatusResponse> {
    return from(this.buscarPorPaymentId(paymentId).then((view) => ({
      paymentId: view.paymentId, status: this.toLegacyStatus(view.status),
    })));
  }

  async iniciarCheckout(orderId: number, method: MetodoPagamentoInput): Promise<PaymentView> {
    try {
      return await firstValueFrom(this.http.post<PaymentView>(`${PAYMENT_API_BASE_URL}/checkout`, {
        orderId,
        method: this.normalizarMetodoApi(method),
      }));
    } catch (error) {
      throw this.normalizarErroApi(error);
    }
  }

  async processarPagamentoSimulado(
    paymentId: string,
    payload: ProcessarPagamentoPayload,
    _orderIdFallback?: number,
  ): Promise<PaymentView> {
    try {
      return await firstValueFrom(this.http.post<PaymentView>(
        `${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}/process`,
        { ...payload, method: this.normalizarMetodoApi(payload.method) },
      ));
    } catch (error) {
      throw this.normalizarErroApi(error);
    }
  }

  async cancelarPagamento(paymentId: string, _orderIdFallback?: number): Promise<PaymentView> {
    try {
      return await firstValueFrom(this.http.post<PaymentView>(
        `${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}/cancel`, {},
      ));
    } catch (error) {
      throw this.normalizarErroApi(error);
    }
  }

  async reembolsarPagamento(paymentId: string, _orderIdFallback?: number): Promise<PaymentView> {
    try {
      return await firstValueFrom(this.http.post<PaymentView>(
        `${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}/refund`, {},
      ));
    } catch (error) {
      throw this.normalizarErroApi(error);
    }
  }

  async buscarPorPaymentId(paymentId: string): Promise<PaymentView> {
    if (this.deveTentarBackend()) {
      try {
        return await firstValueFrom(
          this.http.get<PaymentView>(`${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}`),
        );
      } catch (err: any) {
        if (this.isBusinessError(err)) {
          throw this.normalizarErroApi(err);
        }
        if (err instanceof HttpErrorResponse && [401, 403, 503].includes(err.status)) {
          throw this.normalizarErroApi(err);
        }
        this.marcarBackendIndisponivel();
      }
    }
    return this.buscarPorPaymentIdSupabase(paymentId);
  }

  async listarHistoricoPorPedido(orderId: number): Promise<PaymentView[]> {
    if (this.deveTentarBackend()) {
      try {
        const remotas = await firstValueFrom(
          this.http.get<PaymentView[]>(`${PAYMENT_API_BASE_URL}/orders/${orderId}/history`),
        );
        return remotas;
      } catch (error) {
        if (error instanceof HttpErrorResponse && [401, 403, 503].includes(error.status)) {
          throw this.normalizarErroApi(error);
        }
        this.marcarBackendIndisponivel();
      }
    }
    const remotas = await this.listarHistoricoPorPedidoSupabase(orderId);
    return remotas;
  }

  private normalizarErroApi(error: unknown): PaymentApiError {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      const backendMessage = typeof body === 'string'
        ? body
        : body?.message || body?.detail || body?.error;
      const message = typeof backendMessage === 'string' && backendMessage.trim()
        ? backendMessage
        : error.status === 0
          ? 'Não foi possível conectar ao servidor de pagamentos.'
          : `Falha HTTP ${error.status} ao comunicar com o servidor de pagamentos.`;
      return new PaymentApiError(message, error.status);
    }
    return new PaymentApiError(
      error instanceof Error ? error.message : 'Falha inesperada no servidor de pagamentos.',
      0,
    );
  }

  private propagateHttpError(error: unknown): void {
    if (error instanceof HttpErrorResponse && [401, 403, 503].includes(error.status)) {
      throw this.normalizarErroApi(error);
    }
  }

  async listarHistoricoCliente(): Promise<PaymentView[]> {
    if (this.deveTentarBackend()) {
      try {
        const remotas = await firstValueFrom(
          this.http.get<PaymentView[]>(`${PAYMENT_API_BASE_URL}/history/customer`),
        );
        return remotas;
      } catch (error) {
        this.propagateHttpError(error);
        this.marcarBackendIndisponivel();
      }
    }
    const uid = Number(this.auth.getUsuarioLogado()?.idUsuario);
    if (!uid) return [];
    const remotas = await this.listarHistoricoClienteSupabase(uid);
    return remotas;
  }

  async listarVendasArtista(): Promise<PaymentView[]> {
    if (this.deveTentarBackend()) {
      try {
        const remotas = await firstValueFrom(
          this.http.get<PaymentView[]>(`${PAYMENT_API_BASE_URL}/history/artist`),
        );
        return remotas;
      } catch (error) {
        this.propagateHttpError(error);
        this.marcarBackendIndisponivel();
      }
    }
    const uid = Number(this.auth.getUsuarioLogado()?.idUsuario);
    if (!uid) return [];
    const remotas = await this.listarVendasArtistaSupabase(uid);
    return remotas;
  }

  obterResumoFinanceiro(): Promise<FinanceSummary> {
    return firstValueFrom(this.http.get<FinanceSummary>('/api/artist/finance/summary'));
  }

  gerarCodigoPixSimulado(orderId: number, paymentId: string, valor: number): string {
    const cleanId = (paymentId || '00000000').replace('pay_', '').replace('mock_', '').toUpperCase();
    const shortHash = cleanId.slice(0, 8) || 'CHARTE01';
    return `00020126580014BR.GOV.BCB.PIX0136CHARTE-SIM-${orderId}-${shortHash}5204000053039865406${Number(valor || 0).toFixed(2)}5802BR5913CHARTE ARTES6009SAO PAULO62070503***6304${shortHash.slice(0, 4)}`;
  }

  private toLegacyStatus(status: StatusPagamentoGateway): 'pending' | 'paid' | 'failed' {
    if (status === 'APPROVED' || status === 'PAID') return 'paid';
    if (['DECLINED', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status)) return 'failed';
    return 'pending';
  }

  private normalizarMetodoApi(method: MetodoPagamentoInput): 'PIX' | 'Cartao' | 'Transferencia' {
    const norm = String(method || '').toLowerCase();
    if (norm.includes('card') || norm.includes('cart')) return 'Cartao';
    if (norm.includes('transfer') || norm.includes('boleto')) return 'Transferencia';
    return 'PIX';
  }

  private isBusinessError(err: any): boolean {
    const status = Number(err?.status || 0);
    const msg = err?.error?.message;
    if (typeof msg !== 'string' || !msg.trim()) {
      return false;
    }
    if (msg.includes('não vinculad')) {
      return false;
    }
    return status === 400 || status === 409;
  }

  private async buscarPorPaymentIdSupabase(paymentId: string): Promise<PaymentView> {
    const { data: pag, error } = await supabase
      .from('pagamentos')
      .select('*')
      .eq('gateway_payment_id', paymentId)
      .maybeSingle();

    if (error || !pag) {
      throw new Error('Pagamento não encontrado.');
    }

    const { data: pedido } = await supabase
      .from('pedidos_principal')
      .select('*')
      .eq('id_pedido', pag.id_pedido)
      .maybeSingle();

    return this.mapSupabaseRowToPaymentView(pag, pedido);
  }

  private async listarHistoricoPorPedidoSupabase(orderId: number): Promise<PaymentView[]> {
    const [{ data: rows }, { data: pedido }] = await Promise.all([
      supabase
        .from('pagamentos')
        .select('*')
        .eq('id_pedido', orderId)
        .order('id_pagamento', { ascending: false }),
      supabase.from('pedidos_principal').select('*').eq('id_pedido', orderId).maybeSingle(),
    ]);

    return (rows || []).map((r: any) => this.mapSupabaseRowToPaymentView(r, pedido));
  }

  private async listarHistoricoClienteSupabase(idCliente: number): Promise<PaymentView[]> {
    const { data: pedidos } = await supabase
      .from('pedidos_principal')
      .select('*')
      .eq('id_cliente', idCliente)
      .order('id_pedido', { ascending: false });

    if (!pedidos?.length) return [];
    return this.enriquecerListaPagamentosPorPedidos(pedidos);
  }

  private async listarVendasArtistaSupabase(idUsuarioArtista: number): Promise<PaymentView[]> {
    const { data: artista } = await supabase
      .from('artista')
      .select('id_artista')
      .eq('id_usuario', idUsuarioArtista)
      .maybeSingle();

    const idArtista = artista?.id_artista ?? idUsuarioArtista;
    const { data: pedidos } = await supabase
      .from('pedidos_principal')
      .select('*')
      .eq('id_artista', idArtista)
      .order('id_pedido', { ascending: false });

    if (!pedidos?.length) return [];
    return this.enriquecerListaPagamentosPorPedidos(pedidos);
  }

  private async enriquecerListaPagamentosPorPedidos(pedidos: any[]): Promise<PaymentView[]> {
    const idsPedidos = pedidos.map((p) => Number(p.id_pedido));
    const idsClientes = Array.from(
      new Set(pedidos.map((p) => Number(p.id_cliente)).filter((id) => Number.isFinite(id) && id > 0)),
    );
    const idsArtistas = Array.from(
      new Set(pedidos.map((p) => Number(p.id_artista)).filter((id) => Number.isFinite(id) && id > 0)),
    );

    const [{ data: pagamentos }, { data: clientes }, { data: artistas }] = await Promise.all([
      supabase
        .from('pagamentos')
        .select('*')
        .in('id_pedido', idsPedidos)
        .order('id_pagamento', { ascending: false }),
      idsClientes.length
        ? supabase.from('usuario').select('id_usuario, nome, nome_usuario').in('id_usuario', idsClientes)
        : Promise.resolve({ data: [] as any[] }),
      idsArtistas.length
        ? supabase.from('artista').select('id_artista, nome_artistico').in('id_artista', idsArtistas)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const mapaPedidos = new Map<number, any>();
    pedidos.forEach((p) => mapaPedidos.set(Number(p.id_pedido), p));

    const mapaClientes = new Map<number, string>();
    (clientes || []).forEach((u: any) =>
      mapaClientes.set(Number(u.id_usuario), u.nome || u.nome_usuario),
    );

    const mapaArtistas = new Map<number, string>();
    (artistas || []).forEach((a: any) =>
      mapaArtistas.set(Number(a.id_artista), a.nome_artistico),
    );

    const resultado = (pagamentos || []).map((pag: any) => {
      const ped = mapaPedidos.get(Number(pag.id_pedido));
      const view = this.mapSupabaseRowToPaymentView(pag, ped);
      if (ped) {
        view.clientName = mapaClientes.get(Number(ped.id_cliente)) || `Cliente #${ped.id_cliente}`;
        view.artistName = mapaArtistas.get(Number(ped.id_artista)) || `Artista #${ped.id_artista}`;
      }
      return view;
    });

    return resultado;
  }

  private mapSupabaseRowToPaymentView(pag: any, pedido?: any): PaymentView {
    const orderId = Number(pag.id_pedido);
    const amount = Number(pag.valor ?? pedido?.proposta_valor ?? pedido?.valor_total ?? 0);
    const paymentId = pag.gateway_payment_id || `pay_legado_${pag.id_pagamento}`;
    const rawGateway = String(pag.gateway_status || '')
      .replace(/^simulated_/i, '')
      .toUpperCase();
    const dbStatus = (pag.status_pagamento || 'Pendente') as
      | 'Pendente'
      | 'Pago'
      | 'Cancelado'
      | 'Reembolso';

    let status: StatusPagamentoGateway = 'PENDING';
    if (rawGateway === 'APPROVED' || rawGateway === 'PAID' || dbStatus === 'Pago') {
      status = 'APPROVED';
    } else if (rawGateway === 'DECLINED' || rawGateway === 'FAILED') {
      status = 'DECLINED';
    } else if (rawGateway === 'CANCELLED' || dbStatus === 'Cancelado') {
      status = 'CANCELLED';
    } else if (rawGateway === 'REFUNDED' || dbStatus === 'Reembolso') {
      status = 'REFUNDED';
    } else if (rawGateway === 'PROCESSING') {
      status = 'PROCESSING';
    }

    const method = pag.metodo || 'Pix';
    const pixCode = this.gerarCodigoPixSimulado(orderId, paymentId, amount);

    return {
      paymentId,
      orderId,
      method,
      status,
      dbStatus,
      amount,
      checkoutUrl: pag.checkout_url || `/pedido/${orderId}?paymentId=${paymentId}`,
      pixCode,
      simulationDetails: this.descreverStatus(status, method),
      paymentDate: pedido?.data_criacao
        ? String(pedido.data_criacao).slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      orderStatus: pedido?.status_comissao || pedido?.status_pedido || 'Pendente',
      orderTitle: pedido?.titulo || `Pedido #${orderId}`,
      clientName: null,
      artistName: null,
    };
  }

  private descreverStatus(status: StatusPagamentoGateway, method: string): string {
    switch (status) {
      case 'APPROVED':
      case 'PAID':
        return `Pagamento simulado aprovado (${method}).`;
      case 'DECLINED':
      case 'FAILED':
        return `Pagamento simulado recusado (${method}).`;
      case 'CANCELLED':
        return 'Pagamento simulado cancelado.';
      case 'REFUNDED':
        return 'Pagamento simulado reembolsado.';
      case 'PROCESSING':
        return 'Pagamento simulado em processamento.';
      default:
        return 'Aguardando confirmação do pagamento simulado.';
    }
  }
}
