import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { supabase } from '../app/core/supabase/supabase.client';
import { AvaliacaoArtista } from '../app/models/artist-area';

export type ReviewOrigin =
  | { type: 'pedido'; id: number }
  | { type: 'pagamento'; id: number };

export interface ReviewTarget {
  origin: ReviewOrigin;
  artistName: string;
  artistId: number;
}

export interface ArtistReviewSummary {
  average: number | null;
  total: number;
  reviews: AvaliacaoArtista[];
}

@Injectable({ providedIn: 'root' })
export class ArtistReviewService {
  private readonly criadaSubject = new Subject<void>();
  readonly avaliacaoCriada$ = this.criadaSubject.asObservable();

  async obterResumoArtista(idArtista: number): Promise<ArtistReviewSummary> {
    const { data, error } = await supabase
      .from('review')
      .select(`id_review, id_artista, id_cliente, nota, comentario, data_review,
        cliente:usuario!fk_review_cliente (id_usuario, nome_usuario, nome)`)
      .eq('id_artista', idArtista)
      .order('data_review', { ascending: false });

    if (error) throw error;

    const reviews: AvaliacaoArtista[] = (data ?? []).map((item: any) => ({
      id: Number(item.id_review),
      artistaUsername: '',
      cliente: item.cliente?.nome || item.cliente?.nome_usuario || 'Cliente',
      nota: Number(item.nota),
      comentario: item.comentario ?? '',
      data: item.data_review,
    }));
    const total = reviews.length;
    return {
      average: total ? Number((reviews.reduce((sum, review) => sum + review.nota, 0) / total).toFixed(1)) : null,
      total,
      reviews,
    };
  }

  async listarPendentesDoCliente(): Promise<ReviewTarget[]> {
    const idCliente = await this.idClienteAutenticado();
    if (!idCliente) return [];

    const { data: pagamentos, error } = await supabase
      .from('pagamentos')
      .select('id_pagamento, id_pedido, id_portifolio, id_cliente, id_artista, status_pagamento')
      .eq('id_cliente', idCliente)
      .eq('status_pagamento', 'Pago');
    if (error || !pagamentos?.length) return [];

    const existentes = await this.buscarReviewsExistentes(pagamentos);
    const artistasIds = [...new Set(pagamentos.map((item: any) => Number(item.id_artista)).filter(Number.isFinite))];
    const { data: artistas } = artistasIds.length
      ? await supabase.from('artista').select('id_artista, nome_artistico').in('id_artista', artistasIds)
      : { data: [] as any[] };
    const nomes = new Map<number, string>((artistas ?? []).map((item: any) => [Number(item.id_artista), item.nome_artistico]));
    const targets: ReviewTarget[] = [];

    for (const pagamento of pagamentos as any[]) {
      const idPagamento = Number(pagamento.id_pagamento);
      const idPedido = pagamento.id_pedido == null ? null : Number(pagamento.id_pedido);
      const idPortfolio = pagamento.id_portifolio == null ? null : Number(pagamento.id_portifolio);
      const artistaId = Number(pagamento.id_artista);
      if (!artistaId || !pagamento.id_cliente || Number(pagamento.id_cliente) !== idCliente) continue;

      if (idPortfolio && !idPedido && !existentes.pagamentos.has(idPagamento)) {
        targets.push({ origin: { type: 'pagamento', id: idPagamento }, artistId: artistaId, artistName: nomes.get(artistaId) || 'Artista' });
        continue;
      }

      if (!idPedido) continue;
      const pedido = await this.buscarPedidoElegivel(idPedido, idCliente);
      if (!pedido) continue;
      const compraLegada = String(pedido.titulo || '').startsWith('Aquisição:');
      if (compraLegada && !existentes.pagamentos.has(idPagamento)) {
        targets.push({ origin: { type: 'pagamento', id: idPagamento }, artistId: artistaId, artistName: nomes.get(artistaId) || 'Artista' });
      } else if (!compraLegada && !existentes.pedidos.has(idPedido)) {
        targets.push({ origin: { type: 'pedido', id: idPedido }, artistId: artistaId, artistName: nomes.get(artistaId) || 'Artista' });
      }
    }

    return targets;
  }

  async buscarElegibilidadeDoPedido(idPedido: number): Promise<ReviewTarget | null> {
    const idCliente = await this.idClienteAutenticado();
    if (!idCliente) return null;
    const { data: pedido } = await supabase.from('pedidos_principal')
      .select('id_pedido, id_cliente, id_artista, titulo, status_pedido, concluida_em')
      .eq('id_pedido', idPedido).eq('id_cliente', idCliente).maybeSingle();
    if (!pedido) return null;

    const { data: pagamento } = await supabase
      .from('pagamentos')
      .select('id_pagamento, id_portifolio, id_pedido, id_artista, id_cliente')
      .eq('id_pedido', idPedido)
      .eq('id_cliente', idCliente)
      .eq('status_pagamento', 'Pago')
      .order('id_pagamento', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pagamento || Number(pagamento.id_artista) !== Number(pedido.id_artista)) return null;

    const artistaId = Number(pagamento.id_artista ?? pedido.id_artista);
    const { data: artista } = await supabase.from('artista').select('nome_artistico').eq('id_artista', artistaId).maybeSingle();
    const compra = String(pedido.titulo || '').startsWith('Aquisição:') || (pagamento.id_portifolio != null && pagamento.id_pedido == null);
    if (!compra && !(pedido.status_pedido === 'Entregue' && pedido.concluida_em)) return null;
    const origin: ReviewOrigin = compra ? { type: 'pagamento', id: Number(pagamento.id_pagamento) } : { type: 'pedido', id: idPedido };
    if (await this.jaExisteAvaliacao(origin)) return null;
    return { origin, artistId: artistaId, artistName: artista?.nome_artistico || 'Artista' };
  }

  async registrar(origin: ReviewOrigin, nota: number, comentario: string): Promise<{ ok: boolean; message?: string }> {
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return { ok: false, message: 'Escolha uma nota entre 1 e 5 estrelas.' };
    }
    if ((origin.type !== 'pedido' && origin.type !== 'pagamento') || !Number.isInteger(origin.id) || origin.id <= 0) {
      return { ok: false, message: 'Esta transação não pode ser avaliada.' };
    }

    const idCliente = await this.idClienteAutenticado();
    if (!idCliente) return { ok: false, message: 'Entre na sua conta para enviar uma avaliação.' };

    let idArtista: number | null = null;
    let origemPayload: { id_pedido: number | null; id_pagamento: number | null };
    if (origin.type === 'pedido') {
      const pedido = await this.buscarPedidoElegivel(origin.id, idCliente);
      if (!pedido) return { ok: false, message: 'Este pedido ainda não está elegível para avaliação.' };
      idArtista = Number(pedido.id_artista);
      origemPayload = { id_pedido: origin.id, id_pagamento: null };
    } else {
      const { data: pagamento, error } = await supabase
        .from('pagamentos')
        .select('id_pagamento, id_pedido, id_portifolio, id_cliente, id_artista, status_pagamento')
        .eq('id_pagamento', origin.id)
        .eq('id_cliente', idCliente)
        .eq('status_pagamento', 'Pago')
        .maybeSingle();
      if (error || !pagamento) return { ok: false, message: 'O pagamento não está confirmado ou não pertence à sua conta.' };

      const portfolioPurchase = pagamento.id_portifolio != null && pagamento.id_pedido == null;
      const legacyPurchase = pagamento.id_pedido != null && await this.pedidoEhCompra(Number(pagamento.id_pedido), idCliente);
      if (!portfolioPurchase && !legacyPurchase) return { ok: false, message: 'Somente compras confirmadas podem ser avaliadas.' };
      idArtista = Number(pagamento.id_artista);
      origemPayload = { id_pedido: null, id_pagamento: Number(pagamento.id_pagamento) };
    }

    const originKey = origin.type === 'pedido' ? { id_pedido: origin.id } : { id_pagamento: origin.id };
    const { data: existente, error: erroConsulta } = await supabase.from('review').select('id_review').match(originKey).maybeSingle();
    if (erroConsulta) return { ok: false, message: 'Não foi possível verificar se já existe uma avaliação.' };
    if (existente) return { ok: false, message: 'Esta transação já foi avaliada.' };

    const { error: erroInsert } = await supabase.from('review').insert({
      ...origemPayload,
      id_cliente: idCliente,
      id_artista: idArtista,
      nota,
      comentario: comentario.trim() || null,
    });
    if (erroInsert) {
      if (erroInsert.code === '23505') return { ok: false, message: 'Esta transação já foi avaliada.' };
      console.error('Falha ao registrar avaliação:', erroInsert);
      return { ok: false, message: 'Não foi possível salvar sua avaliação. Tente novamente.' };
    }

    this.criadaSubject.next();
    return { ok: true };
  }

  private async idClienteAutenticado(): Promise<number | null> {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return null;
    const { data } = await supabase.from('usuario').select('id_usuario').eq('id_auth', auth.user.id).maybeSingle();
    return data?.id_usuario ? Number(data.id_usuario) : null;
  }

  private async buscarPedidoElegivel(idPedido: number, idCliente: number): Promise<any | null> {
    const { data: pedido, error } = await supabase
      .from('pedidos_principal')
      .select('id_pedido, id_cliente, id_artista, titulo, status_pedido, concluida_em')
      .eq('id_pedido', idPedido)
      .eq('id_cliente', idCliente)
      .eq('status_pedido', 'Entregue')
      .not('concluida_em', 'is', null)
      .maybeSingle();
    if (error || !pedido) return null;

    const { data: pagamento } = await supabase.from('pagamentos')
      .select('id_pagamento, id_cliente, id_artista')
      .eq('id_pedido', idPedido)
      .eq('id_cliente', idCliente)
      .eq('status_pagamento', 'Pago')
      .limit(1)
      .maybeSingle();
    return pagamento && Number(pagamento.id_cliente) === idCliente && Number(pagamento.id_artista) === Number(pedido.id_artista)
      ? pedido
      : null;
  }

  private async pedidoEhCompra(idPedido: number, idCliente: number): Promise<boolean> {
    const { data } = await supabase.from('pedidos_principal').select('id_cliente, titulo')
      .eq('id_pedido', idPedido).eq('id_cliente', idCliente).maybeSingle();
    return Boolean(data && String(data.titulo || '').startsWith('Aquisição:'));
  }

  private async jaExisteAvaliacao(origin: ReviewOrigin): Promise<boolean> {
    const column = origin.type === 'pedido' ? 'id_pedido' : 'id_pagamento';
    const { data } = await supabase.from('review').select('id_review').eq(column, origin.id).maybeSingle();
    return Boolean(data);
  }

  private async buscarReviewsExistentes(pagamentos: any[]): Promise<{ pedidos: Set<number>; pagamentos: Set<number> }> {
    const idsPagamentos = pagamentos.map((item) => Number(item.id_pagamento)).filter(Number.isFinite);
    const idsPedidos = pagamentos.map((item) => Number(item.id_pedido)).filter(Number.isFinite);
    const consultas = await Promise.all([
      idsPagamentos.length ? supabase.from('review').select('id_pagamento').in('id_pagamento', idsPagamentos) : Promise.resolve({ data: [] as any[] }),
      idsPedidos.length ? supabase.from('review').select('id_pedido').in('id_pedido', idsPedidos) : Promise.resolve({ data: [] as any[] }),
    ]);
    return {
      pagamentos: new Set((consultas[0].data ?? []).map((row: any) => Number(row.id_pagamento))),
      pedidos: new Set((consultas[1].data ?? []).map((row: any) => Number(row.id_pedido))),
    };
  }
}
