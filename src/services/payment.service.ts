import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, firstValueFrom } from 'rxjs';
import { supabase } from '../app/core/supabase/supabase.client';
import { AuthService } from './auth.service';

export const PAYMENT_API_BASE_URL = '/api/payments';

export type MetodoPagamentoInput = 'pix' | 'card' | 'transfer' | 'PIX' | 'Cartao' | 'Transferencia';
export type StatusPagamentoGateway =
  | 'PENDING'
  | 'PROCESSING'
  | 'APPROVED'
  | 'PAID'
  | 'DECLINED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface CheckoutRequest {
  orderId: number;
  method: 'pix' | 'card' | 'transfer';
}

export interface CheckoutResponse {
  paymentId: string;
  checkoutUrl: string;
  status: 'pending' | 'paid' | 'failed';
  pixCode?: string | null;
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: 'pending' | 'paid' | 'failed';
}

export interface ProcessarPagamentoPayload {
  method: 'pix' | 'card' | 'transfer';
  cardHolderName?: string;
  cardLast4?: string;
  cardBrand?: string;
  installments?: number;
  pixCode?: string;
  simulateOutcome?: 'APPROVED' | 'DECLINED';
}

export interface PaymentView {
  paymentId: string;
  orderId: number;
  method: string;
  status: StatusPagamentoGateway;
  dbStatus?: 'Pendente' | 'Pago' | 'Cancelado' | 'Reembolso';
  amount: number;
  checkoutUrl: string;
  pixCode?: string | null;
  simulationDetails?: string | null;
  paymentDate?: string | null;
  orderStatus?: string | null;
  orderTitle?: string | null;
  clientName?: string | null;
  artistName?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private backendIndisponivelAte = 0;
  private readonly STORAGE_KEY = 'charte_transacoes_simuladas_v1';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
  ) {}

  private lerTransacoesLocais(): PaymentView[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private salvarTransacaoLocal(view: PaymentView): void {
    try {
      if (typeof localStorage === 'undefined' || !view?.paymentId) return;
      const lista = this.lerTransacoesLocais().filter((t) => t.paymentId !== view.paymentId);
      lista.unshift({ ...view });
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(lista));
    } catch {
      // ignora erro de quota
    }
  }

  private mesclarComLocais(remotas: PaymentView[], filtroOrderId?: number): PaymentView[] {
    const locais = this.lerTransacoesLocais().filter((t) =>
      filtroOrderId != null ? Number(t.orderId) === Number(filtroOrderId) : true,
    );
    const porId = new Map<string, PaymentView>();
    locais.forEach((l) => porId.set(l.paymentId, { ...l }));
    const resultado: PaymentView[] = [];
    const vistos = new Set<string>();

    for (const r of remotas || []) {
      const local = porId.get(r.paymentId);
      if (local) {
        // Prioriza estado final da simulação caso o banco tenha bloqueado update de status_pagamento
        const statusFinal =
          local.status !== 'PENDING' && r.status === 'PENDING' ? local.status : r.status;
        const dbStatusFinal =
          local.dbStatus && local.dbStatus !== 'Pendente' && r.dbStatus === 'Pendente'
            ? local.dbStatus
            : r.dbStatus;
        resultado.push({
          ...r,
          ...local,
          status: statusFinal,
          dbStatus: dbStatusFinal,
          orderTitle: r.orderTitle || local.orderTitle,
          clientName: r.clientName || local.clientName,
          artistName: r.artistName || local.artistName,
        });
      } else {
        resultado.push(r);
      }
      vistos.add(r.paymentId);
    }

    for (const l of locais) {
      if (!vistos.has(l.paymentId)) {
        resultado.unshift(l);
      }
    }

    return resultado;
  }

  private deveTentarBackend(): boolean {
    return Date.now() >= this.backendIndisponivelAte;
  }

  private marcarBackendIndisponivel(): void {
    this.backendIndisponivelAte = Date.now() + 60_000;
  }

  criarCheckout(dados: CheckoutRequest): Observable<CheckoutResponse> {
    return from(
      this.iniciarCheckout(dados.orderId, dados.method).then((view) => ({
        paymentId: view.paymentId,
        checkoutUrl: view.checkoutUrl,
        status: this.toLegacyStatus(view.status),
        pixCode: view.pixCode,
      })),
    );
  }

  consultarStatus(paymentId: string): Observable<PaymentStatusResponse> {
    return from(
      this.buscarPorPaymentId(paymentId).then((view) => ({
        paymentId: view.paymentId,
        status: this.toLegacyStatus(view.status),
      })),
    );
  }

  async iniciarCheckout(orderId: number, method: MetodoPagamentoInput): Promise<PaymentView> {
    const apiMethod = this.normalizarMetodoApi(method);
    if (this.deveTentarBackend()) {
      try {
        const view = await firstValueFrom(
          this.http.post<PaymentView>(`${PAYMENT_API_BASE_URL}/checkout`, {
            orderId,
            method: apiMethod,
          }),
        );
        this.salvarTransacaoLocal(view);
        return view;
      } catch (err: any) {
        if (this.isBusinessError(err)) {
          throw new Error(err?.error?.message || 'Não foi possível iniciar o checkout.');
        }
        this.marcarBackendIndisponivel();
      }
    }
    const fallbackView = await this.iniciarCheckoutSupabaseFallback(orderId, apiMethod);
    this.salvarTransacaoLocal(fallbackView);
    return fallbackView;
  }

  async processarPagamentoSimulado(
    paymentId: string,
    payload: ProcessarPagamentoPayload,
    orderIdFallback?: number,
  ): Promise<PaymentView> {
    const apiPayload = {
      ...payload,
      method: this.normalizarMetodoApi(payload.method),
    };
    if (this.deveTentarBackend()) {
      try {
        const view = await firstValueFrom(
          this.http.post<PaymentView>(
            `${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}/process`,
            apiPayload,
          ),
        );
        if (view.status === 'APPROVED' || view.status === 'PAID') {
          const targetOrderId = Number(view.orderId || orderIdFallback);
          if (targetOrderId > 0) {
            await supabase
              .from('pedidos_principal')
              .update({
                status_comissao: 'Em andamento',
                status_pedido: 'Em Produção',
              })
              .eq('id_pedido', targetOrderId);
            view.orderStatus = 'Em andamento';
          }
        }
        this.salvarTransacaoLocal(view);
        return view;
      } catch (err: any) {
        if (this.isBusinessError(err)) {
          throw new Error(err?.error?.message || 'Erro ao processar pagamento simulado.');
        }
        this.marcarBackendIndisponivel();
      }
    }
    const fallbackView = await this.processarPagamentoSupabaseFallback(
      paymentId,
      payload,
      orderIdFallback,
    );
    this.salvarTransacaoLocal(fallbackView);
    return fallbackView;
  }

  async cancelarPagamento(paymentId: string, orderIdFallback?: number): Promise<PaymentView> {
    if (this.deveTentarBackend()) {
      try {
        const view = await firstValueFrom(
          this.http.post<PaymentView>(
            `${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}/cancel`,
            {},
          ),
        );
        this.salvarTransacaoLocal(view);
        return view;
      } catch (err: any) {
        if (this.isBusinessError(err)) {
          throw new Error(err?.error?.message || 'Não foi possível cancelar o pagamento.');
        }
        this.marcarBackendIndisponivel();
      }
    }
    const fallbackView = await this.atualizarStatusSupabaseFallback(
      paymentId,
      'CANCELLED',
      orderIdFallback,
    );
    this.salvarTransacaoLocal(fallbackView);
    return fallbackView;
  }

  async reembolsarPagamento(paymentId: string, orderIdFallback?: number): Promise<PaymentView> {
    if (this.deveTentarBackend()) {
      try {
        const view = await firstValueFrom(
          this.http.post<PaymentView>(
            `${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}/refund`,
            {},
          ),
        );
        const targetOrderId = Number(view.orderId || orderIdFallback);
        if (targetOrderId > 0) {
          await supabase
            .from('pedidos_principal')
            .update({
              status_comissao: 'Cancelada',
              status_pedido: 'Cancelado',
            })
            .eq('id_pedido', targetOrderId);
          view.orderStatus = 'Cancelada';
        }
        this.salvarTransacaoLocal(view);
        return view;
      } catch (err: any) {
        if (this.isBusinessError(err)) {
          throw new Error(err?.error?.message || 'Não foi possível reembolsar o pagamento.');
        }
        this.marcarBackendIndisponivel();
      }
    }
    const fallbackView = await this.atualizarStatusSupabaseFallback(
      paymentId,
      'REFUNDED',
      orderIdFallback,
    );
    this.salvarTransacaoLocal(fallbackView);
    return fallbackView;
  }

  async buscarPorPaymentId(paymentId: string): Promise<PaymentView> {
    if (this.deveTentarBackend()) {
      try {
        return await firstValueFrom(
          this.http.get<PaymentView>(`${PAYMENT_API_BASE_URL}/${encodeURIComponent(paymentId)}`),
        );
      } catch (err: any) {
        if (this.isBusinessError(err)) {
          throw new Error(err?.error?.message || 'Pagamento não encontrado.');
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
        return this.mesclarComLocais(remotas, orderId);
      } catch {
        this.marcarBackendIndisponivel();
      }
    }
    const remotas = await this.listarHistoricoPorPedidoSupabase(orderId);
    return this.mesclarComLocais(remotas, orderId);
  }

  async listarHistoricoCliente(): Promise<PaymentView[]> {
    if (this.deveTentarBackend()) {
      try {
        const remotas = await firstValueFrom(
          this.http.get<PaymentView[]>(`${PAYMENT_API_BASE_URL}/history/customer`),
        );
        return this.mesclarComLocais(remotas);
      } catch {
        this.marcarBackendIndisponivel();
      }
    }
    const uid = Number(this.auth.getUsuarioLogado()?.idUsuario);
    if (!uid) return this.lerTransacoesLocais();
    const remotas = await this.listarHistoricoClienteSupabase(uid);
    return this.mesclarComLocais(remotas);
  }

  async listarVendasArtista(): Promise<PaymentView[]> {
    if (this.deveTentarBackend()) {
      try {
        const remotas = await firstValueFrom(
          this.http.get<PaymentView[]>(`${PAYMENT_API_BASE_URL}/history/artist`),
        );
        return this.mesclarComLocais(remotas);
      } catch {
        this.marcarBackendIndisponivel();
      }
    }
    const uid = Number(this.auth.getUsuarioLogado()?.idUsuario);
    if (!uid) return [];
    const remotas = await this.listarVendasArtistaSupabase(uid);
    return this.mesclarComLocais(remotas);
  }

  gerarCodigoPixSimulado(orderId: number, paymentId: string, valor: number): string {
    const cleanId = (paymentId || '00000000')
      .replace('pay_', '')
      .replace('mock_', '')
      .toUpperCase();
    const shortHash = cleanId.slice(0, 8) || 'CHARTE01';
    const valorFormatado = Number(valor || 0).toFixed(2);
    return `00020126580014BR.GOV.BCB.PIX0136CHARTE-SIM-${orderId}-${shortHash}5204000053039865406${valorFormatado}5802BR5913CHARTE ARTES6009SAO PAULO62070503***6304${shortHash.slice(0, 4)}`;
  }

  private toLegacyStatus(status: StatusPagamentoGateway): 'pending' | 'paid' | 'failed' {
    if (status === 'APPROVED' || status === 'PAID') return 'paid';
    if (
      status === 'DECLINED' ||
      status === 'FAILED' ||
      status === 'CANCELLED' ||
      status === 'REFUNDED'
    ) {
      return 'failed';
    }
    return 'pending';
  }

  private normalizarMetodoApi(method: MetodoPagamentoInput): 'PIX' | 'Cartao' | 'Transferencia' {
    const norm = String(method || '').toLowerCase();
    if (norm.includes('card') || norm.includes('cart')) return 'Cartao';
    if (norm.includes('transfer') || norm.includes('boleto')) return 'Transferencia';
    return 'PIX';
  }

  private paraMetodoBanco(method: string): 'Pix' | 'Cartão de Crédito' | 'Boleto' {
    const norm = String(method || '').toLowerCase();
    if (norm.includes('card') || norm.includes('cart')) return 'Cartão de Crédito';
    if (norm.includes('transfer') || norm.includes('boleto')) return 'Boleto';
    return 'Pix';
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

  private async iniciarCheckoutSupabaseFallback(
    orderId: number,
    method: string,
  ): Promise<PaymentView> {
    const user = this.auth.getUsuarioLogado();
    if (!user?.idUsuario) {
      throw new Error('Faça login para realizar o pagamento.');
    }

    const { data: pedido, error: errPed } = await supabase
      .from('pedidos_principal')
      .select(
        'id_pedido, id_cliente, id_artista, valor_total, proposta_valor, status_pedido, status_comissao, titulo, descricao',
      )
      .eq('id_pedido', orderId)
      .maybeSingle();

    if (errPed || !pedido) {
      throw new Error('Pedido não encontrado.');
    }

    if (Number(pedido.id_cliente) !== Number(user.idUsuario)) {
      throw new Error('Você não possui autorização para pagar este pedido.');
    }

    const { data: existentes } = await supabase
      .from('pagamentos')
      .select('*')
      .eq('id_pedido', orderId)
      .order('id_pagamento', { ascending: false });

    const lista = existentes || [];
    const jaPago = lista.find(
      (p: any) =>
        p.status_pagamento === 'Pago' ||
        p.gateway_status === 'APPROVED' ||
        p.gateway_status === 'PAID' ||
        p.gateway_status === 'simulated_paid',
    );
    if (jaPago) {
      throw new Error('Este pedido já possui um pagamento aprovado.');
    }

    const metodoBanco = this.paraMetodoBanco(method);
    const pendente = lista.find(
      (p: any) =>
        p.status_pagamento === 'Pendente' &&
        (!p.gateway_status ||
          p.gateway_status === 'PENDING' ||
          p.gateway_status === 'PROCESSING' ||
          p.gateway_status === 'simulated_pending') &&
        p.gateway_payment_id,
    );

    if (pendente) {
      if (pendente.metodo !== metodoBanco) {
        await supabase
          .from('pagamentos')
          .update({ metodo: metodoBanco })
          .eq('id_pagamento', pendente.id_pagamento);
        pendente.metodo = metodoBanco;
      }
      return this.mapSupabaseRowToPaymentView(pendente, pedido);
    }

    const randomHex = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
    const paymentId = `pay_${randomHex}`;
    const checkoutUrl = `/pedido/${orderId}?paymentId=${paymentId}`;

    const { data: inserido, error: errIns } = await supabase
      .from('pagamentos')
      .insert({
        id_pedido: orderId,
        metodo: metodoBanco,
        status_pagamento: 'Pendente',
        gateway_payment_id: paymentId,
        checkout_url: checkoutUrl,
        gateway_status: 'PENDING',
      })
      .select('*')
      .single();

    const rowEfetiva = inserido || {
      id_pagamento: Date.now(),
      id_pedido: orderId,
      metodo: metodoBanco,
      status_pagamento: 'Pendente',
      gateway_payment_id: paymentId,
      checkout_url: checkoutUrl,
      gateway_status: 'PENDING',
    };

    if (errIns && !inserido) {
      console.warn('Checkout mantido em simulação local (RLS na tabela pagamentos):', errIns.message);
    }

    return this.mapSupabaseRowToPaymentView(rowEfetiva, pedido);
  }

  private async processarPagamentoSupabaseFallback(
    paymentId: string,
    payload: ProcessarPagamentoPayload,
    orderIdFallback?: number,
  ): Promise<PaymentView> {
    const user = this.auth.getUsuarioLogado();
    if (!user?.idUsuario) {
      throw new Error('Sessão inválida. Faça login novamente.');
    }

    let query = supabase.from('pagamentos').select('*');
    if (paymentId) {
      query = query.eq('gateway_payment_id', paymentId);
    } else if (orderIdFallback) {
      query = query.eq('id_pedido', orderIdFallback);
    }
    const { data: rows } = await query.order('id_pagamento', { ascending: false }).limit(1);
    const localTx = this.lerTransacoesLocais().find(
      (t) =>
        (paymentId && t.paymentId === paymentId) ||
        (orderIdFallback && Number(t.orderId) === Number(orderIdFallback)),
    );

    const pag = rows?.[0] || (localTx
      ? {
          id_pagamento: 0,
          id_pedido: localTx.orderId,
          metodo: localTx.method,
          status_pagamento: localTx.dbStatus || 'Pendente',
          gateway_payment_id: localTx.paymentId,
          checkout_url: localTx.checkoutUrl,
          gateway_status: localTx.status,
        }
      : orderIdFallback
        ? {
            id_pagamento: 0,
            id_pedido: orderIdFallback,
            metodo: this.paraMetodoBanco(payload.method),
            status_pagamento: 'Pendente',
            gateway_payment_id: paymentId || `pay_${Date.now()}`,
            checkout_url: `/pedido/${orderIdFallback}`,
            gateway_status: 'PENDING',
          }
        : null);

    if (!pag) {
      throw new Error('Transação de pagamento não encontrada.');
    }

    const { data: pedido } = await supabase
      .from('pedidos_principal')
      .select('*')
      .eq('id_pedido', pag.id_pedido)
      .single();

    if (!pedido || Number(pedido.id_cliente) !== Number(user.idUsuario)) {
      throw new Error('Operação não autorizada para este pedido.');
    }

    if (pag.status_pagamento === 'Pago' || pag.gateway_status === 'APPROVED') {
      throw new Error('Este pagamento já foi aprovado anteriormente.');
    }

    const metodoBanco = this.paraMetodoBanco(payload.method || pag.metodo);
    if (metodoBanco === 'Cartão de Crédito') {
      const holder = (payload.cardHolderName || '').trim();
      const last4 = (payload.cardLast4 || '').trim();
      if (holder.length < 3) {
        throw new Error('Informe o nome do titular do cartão simulado.');
      }
      if (!/^\d{4}$/.test(last4)) {
        throw new Error('Informe os 4 últimos dígitos do cartão simulado.');
      }
    }

    const last4 = (payload.cardLast4 || '').trim();
    const holderUpper = (payload.cardHolderName || '').trim().toUpperCase();
    const deveRecusar =
      payload.simulateOutcome === 'DECLINED' ||
      (metodoBanco === 'Cartão de Crédito' &&
        (last4 === '0000' ||
          last4 === '9999' ||
          holderUpper.includes('RECUSADO') ||
          holderUpper.includes('DECLINED')));

    const novoGatewayStatus: StatusPagamentoGateway = deveRecusar ? 'DECLINED' : 'APPROVED';
    const novoDbStatus = deveRecusar ? 'Cancelado' : 'Pago';

    let atualizado: any = null;
    if (pag.id_pagamento) {
      const { data: updData, error: errUpd } = await supabase
        .from('pagamentos')
        .update({
          metodo: metodoBanco,
          gateway_status: novoGatewayStatus,
          status_pagamento: novoDbStatus,
        })
        .eq('id_pagamento', pag.id_pagamento)
        .select('*')
        .maybeSingle();

      if (errUpd || !updData) {
        // Caso o trigger fn_criar_comissao bloqueie status_pagamento = 'Pago', atualiza gateway_status
        const { data: updGw } = await supabase
          .from('pagamentos')
          .update({
            metodo: metodoBanco,
            gateway_status: novoGatewayStatus,
          })
          .eq('id_pagamento', pag.id_pagamento)
          .select('*')
          .maybeSingle();
        atualizado = updGw;
      } else {
        atualizado = updData;
      }
    }

    if (!atualizado) {
      atualizado = {
        ...pag,
        metodo: metodoBanco,
        gateway_status: novoGatewayStatus,
        status_pagamento: novoDbStatus,
      };
    }

    const jaEntregue =
      pedido.status_comissao === 'Entregue' || pedido.status_comissao === 'Finalizada';
    if (!deveRecusar && !jaEntregue) {
      await supabase
        .from('pedidos_principal')
        .update({
          status_comissao: 'Em andamento',
          status_pedido: 'Em Produção',
        })
        .eq('id_pedido', pedido.id_pedido);
      pedido.status_comissao = 'Em andamento';
      pedido.status_pedido = 'Em Produção';
    }

    const view = this.mapSupabaseRowToPaymentView(atualizado, pedido);
    view.simulationDetails = deveRecusar
      ? 'Transação recusada pelo simulador financeiro (limite/cartão de teste recusado).'
      : metodoBanco === 'Cartão de Crédito'
        ? `Pagamento via Cartão Simulado (final ${last4 || '4242'} em ${payload.installments || 1}x) aprovado.`
        : metodoBanco === 'Pix'
          ? 'Pagamento via PIX Simulado compensado instantaneamente.'
          : 'Transferência/Boleto simulado compensado com sucesso.';
    return view;
  }

  private async atualizarStatusSupabaseFallback(
    paymentId: string,
    targetStatus: StatusPagamentoGateway,
    orderIdFallback?: number,
  ): Promise<PaymentView> {
    let query = supabase.from('pagamentos').select('*');
    if (paymentId) {
      query = query.eq('gateway_payment_id', paymentId);
    } else if (orderIdFallback) {
      query = query.eq('id_pedido', orderIdFallback);
    }
    const { data: rows } = await query.order('id_pagamento', { ascending: false }).limit(1);
    const localTx = this.lerTransacoesLocais().find(
      (t) =>
        (paymentId && t.paymentId === paymentId) ||
        (orderIdFallback && Number(t.orderId) === Number(orderIdFallback)),
    );
    const pag = rows?.[0] || (localTx
      ? {
          id_pagamento: 0,
          id_pedido: localTx.orderId,
          metodo: localTx.method,
          status_pagamento: localTx.dbStatus || 'Pendente',
          gateway_payment_id: localTx.paymentId,
          checkout_url: localTx.checkoutUrl,
          gateway_status: localTx.status,
        }
      : null);
    if (!pag) {
      throw new Error('Pagamento não encontrado.');
    }

    const dbStatus =
      targetStatus === 'APPROVED' || targetStatus === 'PAID'
        ? 'Pago'
        : targetStatus === 'REFUNDED'
          ? 'Reembolso'
          : targetStatus === 'PENDING' || targetStatus === 'PROCESSING'
            ? 'Pendente'
            : 'Cancelado';

    let atualizado: any = null;
    if (pag.id_pagamento) {
      const { data: upd } = await supabase
        .from('pagamentos')
        .update({
          gateway_status: targetStatus,
          status_pagamento: dbStatus,
        })
        .eq('id_pagamento', pag.id_pagamento)
        .select('*')
        .maybeSingle();
      atualizado = upd;
    }
    if (!atualizado) {
      atualizado = {
        ...pag,
        gateway_status: targetStatus,
        status_pagamento: dbStatus,
      };
    }

    const { data: pedido } = await supabase
      .from('pedidos_principal')
      .select('*')
      .eq('id_pedido', pag.id_pedido)
      .maybeSingle();

    if (dbStatus === 'Reembolso' && pedido) {
      await supabase
        .from('pedidos_principal')
        .update({ status_comissao: 'Cancelada', status_pedido: 'Cancelado' })
        .eq('id_pedido', pag.id_pedido);
      pedido.status_comissao = 'Cancelada';
    }

    return this.mapSupabaseRowToPaymentView(atualizado, pedido);
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

    const pedidosComPagamento = new Set<number>();
    const resultado = (pagamentos || []).map((pag: any) => {
      const ped = mapaPedidos.get(Number(pag.id_pedido));
      pedidosComPagamento.add(Number(pag.id_pedido));
      const view = this.mapSupabaseRowToPaymentView(pag, ped);
      if (ped) {
        view.clientName = mapaClientes.get(Number(ped.id_cliente)) || `Cliente #${ped.id_cliente}`;
        view.artistName = mapaArtistas.get(Number(ped.id_artista)) || `Artista #${ped.id_artista}`;
      }
      return view;
    });

    for (const ped of pedidos) {
      const idPed = Number(ped.id_pedido);
      if (pedidosComPagamento.has(idPed)) continue;
      const stCom = String(ped.status_comissao || '');
      const stPed = String(ped.status_pedido || '');
      if (
        ['Em andamento', 'Entregue', 'Finalizada'].includes(stCom) ||
        ['Em Produção', 'Entregue para Avaliação do Cliente', 'Entregue'].includes(stPed)
      ) {
        const view = this.mapSupabaseRowToPaymentView(
          {
            id_pagamento: idPed,
            id_pedido: idPed,
            metodo: 'Pix',
            status_pagamento: 'Pago',
            gateway_payment_id: `pay_ped_${idPed}`,
            checkout_url: `/pedido/${idPed}`,
            gateway_status: 'APPROVED',
          },
          ped,
        );
        view.clientName = mapaClientes.get(Number(ped.id_cliente)) || `Cliente #${ped.id_cliente}`;
        view.artistName = mapaArtistas.get(Number(ped.id_artista)) || `Artista #${ped.id_artista}`;
        resultado.push(view);
      }
    }

    return resultado;
  }

  private mapSupabaseRowToPaymentView(pag: any, pedido?: any): PaymentView {
    const orderId = Number(pag.id_pedido);
    const amount = Number(pedido?.proposta_valor ?? pedido?.valor_total ?? 0);
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
