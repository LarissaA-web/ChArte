import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, BehaviorSubject, firstValueFrom } from 'rxjs';
import {
  ArquivoEntregaComissao,
  AvaliacaoArtista,
  Comissao,
  DiretrizComissao,
  OpcaoComissao,
  PrivacidadeArtista,
  StatusComissao,
  ehCompraDiretaArte,
} from '../app/models/artist-area';
import { supabase } from '../app/core/supabase/supabase.client';
import { CommissionDeliveryService } from './commission-delivery.service';
import { ArtistReviewService } from './artist-review.service';
import { map, catchError, tap, switchMap } from 'rxjs/operators';

const PRIVACIDADE_PADRAO: PrivacidadeArtista = {
  perfilPublico: true,
  exibirRedesSociais: true,
  exibirInformacoes: true,
  aceitarComissoes: true,
};

const CLONAR_COMISSAO = (item: Comissao): Comissao => ({
  ...item,
  referencias: [...item.referencias],
  arquivosEntrega: item.arquivosEntrega ? item.arquivosEntrega.map((a) => ({ ...a })) : undefined,
  cliente: { ...item.cliente },
});

@Injectable({ providedIn: 'root' })
export class ArtistAreaService {
  private carregamentoComissoesVersao = 0;
  private ultimoErroAtualizacao = '';
  private readonly comissoesSubject = new BehaviorSubject<Comissao[]>([]);
  private readonly comissoesCarregadasSubject = new BehaviorSubject<boolean>(false);
  readonly comissoesCarregadas$ = this.comissoesCarregadasSubject.asObservable();

  readonly comissoes$ = this.comissoesSubject.asObservable();

  /** Retorna o snapshot atual das comissões. */
  obterComissoesAtuais(): Comissao[] {
    return this.comissoesSubject.getValue();
  }

  obterUltimoErroAtualizacao(): string {
    return this.ultimoErroAtualizacao;
  }

  private readonly catalogoSubject = new BehaviorSubject<{
    opcoes: OpcaoComissao[];
    diretrizes: DiretrizComissao[];
  }>({ opcoes: [], diretrizes: [] });
  readonly catalogo$ = this.catalogoSubject.asObservable();

  private readonly privacidadeSubject = new BehaviorSubject<Map<string, PrivacidadeArtista>>(new Map());
  private readonly avaliacoesSubject = new BehaviorSubject<AvaliacaoArtista[]>([]);
  private readonly artistaAliases = new Map<string, Set<string>>();

<<<<<<< Updated upstream
  private readonly PAGAMENTOS_STORAGE_KEY = 'charte_pagamentos_comissao_v1';
  private readonly ENTREGAS_STORAGE_KEY = 'charte_entregas_comissao_v1';

  constructor(
    private readonly commissionDelivery: CommissionDeliveryService,
    private readonly artistReviews: ArtistReviewService,
  ) {
    this.artistReviews.avaliacaoCriada$.subscribe(() => void this.carregarAvaliacoes());
=======
  private readonly ENTREGAS_STORAGE_KEY = 'charte_entregas_comissao_v1';

  constructor(private http: HttpClient) {
>>>>>>> Stashed changes
    this.carregarTudo();
  }

  private lerMapaLocal<T>(chave: string): Record<string, T> {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(chave);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private salvarMapaLocal<T>(chave: string, mapa: Record<string, T>): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(chave, JSON.stringify(mapa));
    } catch {
      // ignora erro de quota
    }
  }

  private registrarAliasArtista(nomeArtistico?: string | null, nomeUsuario?: string | null): void {
    const a = (nomeArtistico || '').trim().toLowerCase();
    const u = (nomeUsuario || '').trim().toLowerCase();
    if (!a && !u) return;
    const grupo = new Set<string>();
    if (a) {
      grupo.add(a);
      this.artistaAliases.get(a)?.forEach((x) => grupo.add(x));
    }
    if (u) {
      grupo.add(u);
      this.artistaAliases.get(u)?.forEach((x) => grupo.add(x));
    }
    grupo.forEach((k) => this.artistaAliases.set(k, grupo));
  }

  correspondeAoArtista(itemUsername: string, filtroUsername: string): boolean {
    const a = (itemUsername || '').trim().replace(/^@/, '').toLowerCase();
    const b = (filtroUsername || '').trim().replace(/^@/, '').toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    const aliases = this.artistaAliases.get(a) || this.artistaAliases.get(b);
    return !!(aliases && aliases.has(a) && aliases.has(b));
  }

  private async carregarTudo(): Promise<void> {
    await Promise.all([
      this.carregarComissoes(),
      this.carregarCatalogo(),
      this.carregarPrivacidade(),
      this.carregarAvaliacoes(),
    ]);
  }

  // ============================================================================
    // COMISSÕES
// ============================================================================

  private async carregarComissoes(): Promise<void> {
    const versao = ++this.carregamentoComissoesVersao;
    const { data, error } = await supabase
      .from('pedidos_principal')
      .select(`
        id_pedido, id_cliente, id_artista, valor_total, status_pedido,
        status_comissao, data_criacao, titulo, descricao, referencias,
        prazo, opcao_titulo, proposta_valor, proposta_prazo, concluida_em,
        artista:artista!fk_pedido_artista (id_artista, nome_artistico),
        cliente:usuario!fk_pedido_cliente (
          id_usuario, nome_usuario, nome, foto_perfil
        )
      `)
      .order('data_criacao', { ascending: false });

    if (error) {
      console.error('Erro ao carregar pedidos:', error);
      if (versao === this.carregamentoComissoesVersao) {
        this.comissoesCarregadasSubject.next(true);
      }
      return;
    }

    const pedidos = data ?? [];
    const ids = pedidos.map((item: any) => item.id_pedido);
    const pagamentosPorPedido = new Map<number, any>();

    // Carrega mapa de artistas -> usuario.nome_usuario para parear nome_artistico e nome_usuario
    const { data: listaArtistas } = await supabase
      .from('artista')
      .select('id_artista, id_usuario, nome_artistico');
    if (listaArtistas?.length) {
      const idsUsuariosArtistas = Array.from(
        new Set(listaArtistas.map((a: any) => a.id_usuario).filter(Boolean)),
      );
      const { data: usuariosArtistas } = idsUsuariosArtistas.length
        ? await supabase
            .from('usuario')
            .select('id_usuario, nome_usuario')
            .in('id_usuario', idsUsuariosArtistas)
        : { data: [] as any[] };
      const mapaUser = new Map<number, string>();
      (usuariosArtistas ?? []).forEach((u: any) => mapaUser.set(u.id_usuario, u.nome_usuario));
      listaArtistas.forEach((a: any) => {
        this.registrarAliasArtista(a.nome_artistico, mapaUser.get(a.id_usuario));
      });
    }

    if (ids.length > 0) {
      const { data: pagamentos, error: erroPagamentos } = await supabase
        .from('pagamentos')
        .select(`
          id_pagamento, id_pedido, metodo, status_pagamento,
          gateway_payment_id, checkout_url, gateway_status
        `)
        .in('id_pedido', ids)
        .order('id_pagamento', { ascending: false });

      if (erroPagamentos) {
        console.error('Erro ao carregar pagamentos:', erroPagamentos);
      } else {
        for (const pagamento of pagamentos ?? []) {
          if (!pagamentosPorPedido.has(pagamento.id_pedido)) {
            pagamentosPorPedido.set(pagamento.id_pedido, pagamento);
          }
        }
      }
    }

<<<<<<< Updated upstream
    // Dados legados permanecem no localStorage, mas não são fonte de status.
    // Os pedidos e sua conclusão sempre refletem a resposta persistida do Supabase.
=======
    // Status financeiros e de pedido são lidos apenas dos registros persistidos.
>>>>>>> Stashed changes
    const entregasLocais = this.lerMapaLocal<{
      arquivoEntrega: string;
      observacaoEntrega: string;
      arquivosEntrega?: ArquivoEntregaComissao[];
    }>(this.ENTREGAS_STORAGE_KEY);

    const previewsEntregaPrivada = new Map<number, string>();
    await Promise.all(pedidos.map(async (item: any) => {
      const refs = Array.isArray(item.referencias) ? item.referencias as string[] : [];
      const marcador = refs.find((ref) => typeof ref === 'string' && ref.startsWith('ENTREGA_ARQUIVO::'));
      const caminho = marcador?.slice('ENTREGA_ARQUIVO::'.length);
      if (!caminho || /^(https?:|data:|blob:|\/)/i.test(caminho)) return;
      const preview = await this.commissionDelivery.criarPreviaAutorizada(Number(item.id_pedido), caminho);
      if (preview) previewsEntregaPrivada.set(Number(item.id_pedido), preview);
    }));

    const statusConhecidos: StatusComissao[] = [
      'Solicitada',
      'Aguardando aprovação do cliente',
      'Pendente',
      'Em andamento',
      'Entregue',
      'Finalizada',
      'Recusada',
      'Cancelada',
    ];

    const mapearStatus = (statusComissao: string | null): StatusComissao => {
      if (statusComissao && statusConhecidos.includes(statusComissao as StatusComissao)) {
        return statusComissao as StatusComissao;
      }
      return 'Pendente';
    };

    const mapearStatusPagamento = (
      status: string | null | undefined,
      gatewayStatus?: string | null,
    ): 'pendente' | 'pago' | 'falhou' | undefined => {
      const gw = String(gatewayStatus || '').toUpperCase();
      if (status === 'Pago' || gw === 'APPROVED' || gw === 'PAID') return 'pago';
      if (
        status === 'Cancelado' ||
        status === 'Reembolso' ||
        gw === 'DECLINED' ||
        gw === 'FAILED' ||
        gw === 'CANCELLED' ||
        gw === 'REFUNDED'
      ) {
        return 'falhou';
      }
      if (status === 'Pendente' || gw === 'PENDING' || gw === 'PROCESSING') return 'pendente';
      return undefined;
    };

    const mapearMetodo = (metodo: string | null | undefined): string | undefined => {
      switch (metodo) {
        case 'Pix':
        case 'PIX':
          return 'Pix';
        case 'Cartão de Crédito':
        case 'Cartão de Débito':
        case 'Cartao':
          return 'Cartão';
        case 'Boleto':
        case 'Transferencia':
        case 'Transferência bancária':
          return 'Transferência / Boleto';
        default:
          return metodo || undefined;
      }
    };

    const comissoes: Comissao[] = pedidos.map((item: any) => {
      const artista = Array.isArray(item.artista) ? item.artista[0] : item.artista;
      const cliente = Array.isArray(item.cliente) ? item.cliente[0] : item.cliente;
      const pagamento = pagamentosPorPedido.get(item.id_pedido);
      const entregaLocal = entregasLocais[String(item.id_pedido)];

<<<<<<< Updated upstream
      const statusFinal = mapearStatus(item.status_comissao);
=======
      let statusFinal = mapearStatus(item.status_comissao, item.status_pedido);
>>>>>>> Stashed changes

      let pagStatusFinal =
        mapearStatusPagamento(pagamento?.status_pagamento, pagamento?.gateway_status);

      const refsBrutas: string[] = Array.isArray(item.referencias) ? item.referencias : [];
      const refArquivo = refsBrutas.find(
        (r) => typeof r === 'string' && r.startsWith('ENTREGA_ARQUIVO::'),
      );
      const refObs = refsBrutas.find(
        (r) => typeof r === 'string' && r.startsWith('ENTREGA_OBS::'),
      );
      const refArquivosJson = refsBrutas.find(
        (r) => typeof r === 'string' && r.startsWith('ENTREGA_ARQUIVOS_JSON::'),
      );
      const arquivoEntregaPersistido = refArquivo
        ? refArquivo.slice('ENTREGA_ARQUIVO::'.length)
        : undefined;
      const arquivoEntregaRemoto = arquivoEntregaPersistido && !/^(https?:|data:|blob:|\/)/i.test(arquivoEntregaPersistido)
        ? previewsEntregaPrivada.get(Number(item.id_pedido))
        : arquivoEntregaPersistido;
      const observacaoEntregaRemota = refObs
        ? refObs.slice('ENTREGA_OBS::'.length)
        : undefined;
      let arquivosEntregaRemotos: ArquivoEntregaComissao[] | undefined;
      if (refArquivosJson) {
        try {
          arquivosEntregaRemotos = JSON.parse(
            refArquivosJson.slice('ENTREGA_ARQUIVOS_JSON::'.length),
          );
        } catch {
          arquivosEntregaRemotos = undefined;
        }
      }
      const referenciasLimpas = refsBrutas.filter(
        (r) =>
          typeof r === 'string' &&
          !r.startsWith('ENTREGA_ARQUIVO::') &&
          !r.startsWith('ENTREGA_OBS::') &&
          !r.startsWith('ENTREGA_ARQUIVOS_JSON::'),
      );

      const compraDireta = ehCompraDiretaArte({
        titulo: item.titulo,
        prazo: item.prazo,
        opcaoTitulo: item.opcao_titulo,
      });

      let arquivoEntregaFinal = arquivoEntregaRemoto || entregaLocal?.arquivoEntrega;
      const observacaoEntregaFinal = observacaoEntregaRemota ?? entregaLocal?.observacaoEntrega;
      const arquivosEntregaFinais: ArquivoEntregaComissao[] | undefined =
        arquivosEntregaRemotos ||
        entregaLocal?.arquivosEntrega ||
        (arquivoEntregaFinal ? [{ nome: 'Arquivo da comissão', url: arquivoEntregaFinal }] : undefined);

<<<<<<< Updated upstream
      if (compraDireta && !arquivoEntregaFinal && statusFinal === 'Finalizada' && referenciasLimpas.length > 0) {
        arquivoEntregaFinal = referenciasLimpas[0];
=======
      if (arquivoEntregaFinal && statusFinal === 'Em andamento') {
        statusFinal = 'Entregue';
>>>>>>> Stashed changes
      }

      const pagamentoLiberado =
        (statusFinal === 'Finalizada' ||
          (statusFinal === 'Recusada' && Boolean(arquivoEntregaFinal))) &&
        pagStatusFinal === 'pago';

      return {
        id: item.id_pedido,
        artistaUsername: artista?.nome_artistico ?? '',
        cliente: {
          nome: cliente?.nome ?? '',
          username: cliente?.nome_usuario ?? '',
          foto: cliente?.foto_perfil ?? '/gato.jpeg',
        },
        titulo: item.titulo ?? `Pedido #${item.id_pedido}`,
        descricao: item.descricao ?? '',
        referencias: referenciasLimpas,
        valor: Number(item.valor_total ?? 0),
        criadaEm: item.data_criacao,
        prazo: item.prazo ?? '',
        status: statusFinal,
<<<<<<< Updated upstream
        statusPedido: item.status_pedido ?? undefined,
=======
>>>>>>> Stashed changes
        concluidaEm: item.concluida_em ?? undefined,
        pagamento: mapearMetodo(pagamento?.metodo),
        pagamentoStatus: pagStatusFinal,
        pagamentoLiberado,
        paymentId: pagamento?.gateway_payment_id ?? undefined,
        checkoutUrl: pagamento?.checkout_url ?? undefined,
        opcaoTitulo: item.opcao_titulo ?? undefined,
        propostaValor: item.proposta_valor != null
          ? Number(item.proposta_valor) : undefined,
        propostaPrazo: item.proposta_prazo ?? undefined,
        arquivoEntrega: arquivoEntregaFinal,
        arquivosEntrega: arquivosEntregaFinais,
        observacaoEntrega: observacaoEntregaFinal,
        tipoPedido: compraDireta ? 'compra_arte' : 'comissao',
      };
    });

    if (versao === this.carregamentoComissoesVersao) {
      this.comissoesSubject.next(comissoes);
      this.comissoesCarregadasSubject.next(true);
    }
  }

  async recarregarComissoes(): Promise<void> {
    await this.carregarComissoes();
  }

  private async localizarIdArtista(identificador: string, idArtistaHint?: number): Promise<number | null> {
    if (idArtistaHint && idArtistaHint > 0) {
      return idArtistaHint;
    }
    const limpo = (identificador || '').trim().replace(/^@/, '');
    if (!limpo) return null;

    const { data: usuarioData } = await supabase
      .from('usuario')
      .select('id_usuario')
      .ilike('nome_usuario', limpo)
      .maybeSingle();

    if (usuarioData?.id_usuario) {
      const { data: porUsuario } = await supabase
        .from('artista')
        .select('id_artista')
        .eq('id_usuario', usuarioData.id_usuario)
        .maybeSingle();
      if (porUsuario?.id_artista) {
        return porUsuario.id_artista;
      }
    }

    const { data: porNomeArtistico } = await supabase
      .from('artista')
      .select('id_artista')
      .ilike('nome_artistico', limpo)
      .maybeSingle();

    return porNomeArtistico?.id_artista ?? null;
  }

  listarComissoes(username: string): Comissao[] {
    return this.comissoesSubject.value
      .filter(item => this.correspondeAoArtista(item.artistaUsername, username))
      .map(CLONAR_COMISSAO);
  }

  listarPedidosCliente(username: string): Comissao[] {
    return this.comissoesSubject.value
      .filter(item => item.cliente.username.toLowerCase() === username.toLowerCase())
      .map(CLONAR_COMISSAO);
  }

  obterComissao(id: number): Comissao | undefined {
    const item = this.comissoesSubject.value.find(comissao => comissao.id === id);
    return item ? CLONAR_COMISSAO(item) : undefined;
  }

  async criarPedidoDeArte(
    arte: {
      id: number;
      titulo: string;
      descricao: string;
      portfolio: string;
      preco: number;
      nomeArtistico: string;
      usuario?: { artistaId?: number; nomeUsuario?: string };
      categoria?: { nomeCategoria?: string };
    },
    clienteUsername: string,
  ): Promise<Comissao | null> {
    const idArtista = await this.localizarIdArtista(
      arte.usuario?.nomeUsuario || arte.nomeArtistico,
      arte.usuario?.artistaId,
    );
    if (!idArtista) {
      console.error('Artista da obra não encontrado.');
      return null;
    }

    const { data: clienteData, error: erroCliente } = await supabase
      .from('usuario')
      .select('id_usuario')
      .ilike('nome_usuario', clienteUsername.trim())
      .maybeSingle();

    if (erroCliente || !clienteData) {
      console.error('Cliente não encontrado:', erroCliente);
      return null;
    }

    const { data, error } = await supabase
      .from('pedidos_principal')
      .insert({
        id_artista: idArtista,
        id_cliente: clienteData.id_usuario,
        titulo: `Aquisição: ${arte.titulo}`,
        descricao: arte.descricao || `Compra da obra "${arte.titulo}" de ${arte.nomeArtistico}.`,
        referencias: arte.portfolio ? [arte.portfolio] : [],
        valor_total: Number(arte.preco || 0),
        prazo: 'Entrega imediata após confirmação do pagamento',
        opcao_titulo: arte.categoria?.nomeCategoria
          ? `Obra Digital · ${arte.categoria.nomeCategoria}`
          : 'Obra de Portfólio',
        status_pedido: 'Pendente',
        status_comissao: 'Pendente',
      })
      .select('id_pedido')
      .single();

    if (error || !data) {
      console.error('Erro ao criar pedido de arte:', error);
      return null;
    }

    await this.carregarComissoes();
    return this.obterComissao(data.id_pedido) ?? null;
  }

  async solicitarComissao(
    dados: Omit<Comissao, 'id' | 'status' | 'criadaEm'>
  ): Promise<Comissao | null> {
    const idArtista = await this.localizarIdArtista(dados.artistaUsername);

    if (!idArtista) {
      console.error('Artista não encontrado:', dados.artistaUsername);
      return null;
    }

    const { data: clienteData, error: erroCliente } = await supabase
      .from('usuario')
      .select('id_usuario')
      .ilike('nome_usuario', dados.cliente.username)
      .maybeSingle();

    if (erroCliente || !clienteData) {
      console.error('Cliente não encontrado:', erroCliente);
      return null;
    }

    const { data, error } = await supabase
      .from('pedidos_principal')
      .insert({
        id_artista: idArtista,
        id_cliente: clienteData.id_usuario,
        titulo: dados.titulo,
        descricao: dados.descricao,
        referencias: dados.referencias ?? [],
        valor_total: dados.valor,
        prazo: dados.prazo,
        opcao_titulo: dados.opcaoTitulo ?? '',
        status_pedido: 'Pendente',
        status_comissao: 'Solicitada',
      })
      .select('id_pedido')
      .single();

    if (error || !data) {
      console.error('Erro ao solicitar comissão:', error);
      return null;
    }

    await this.carregarComissoes();
    return this.obterComissao(data.id_pedido) ?? null;
  }

  async atualizarStatus(id: number, status: StatusComissao): Promise<boolean> {
<<<<<<< Updated upstream
    this.ultimoErroAtualizacao = '';
    const atual = this.comissoesSubject.value.find((item) => item.id === id);
    if (!atual) {
      this.ultimoErroAtualizacao = 'Pedido não carregado. Atualize a página e tente novamente.';
      return false;
    }
    const atualizacoes: Record<string, unknown> = {};
=======
    const { data: atual, error: erroLeitura } = await supabase
      .from('pedidos_principal')
      .select('status_comissao')
      .eq('id_pedido', id)
      .maybeSingle();
    if (erroLeitura || !atual) return false;
    const transicoesPermitidas: Record<string, StatusComissao[]> = {
      Solicitada: ['Pendente', 'Aguardando aprovação do cliente', 'Recusada', 'Cancelada'],
      Pendente: ['Em andamento', 'Recusada', 'Cancelada'],
      'Aguardando aprovação do cliente': ['Pendente', 'Recusada', 'Cancelada'],
      'Em andamento': ['Entregue', 'Recusada', 'Cancelada'],
      Entregue: ['Finalizada', 'Recusada', 'Em andamento'],
    };
    if (!transicoesPermitidas[atual.status_comissao]?.includes(status)) return false;
>>>>>>> Stashed changes

    const atualizacoes: Record<string, unknown> = {};
    switch (status) {
      case 'Solicitada':
      case 'Pendente':
      case 'Aguardando aprovação do cliente':
        atualizacoes['status_comissao'] = status;
        atualizacoes['status_pedido'] = 'Pendente';
        break;
      case 'Em andamento':
        atualizacoes['status_comissao'] = status;
        atualizacoes['status_pedido'] = 'Em Produção';
        break;
      case 'Entregue':
        atualizacoes['status_comissao'] = status;
        atualizacoes['status_pedido'] = 'Entregue para Avaliação do Cliente';
        break;
      case 'Finalizada':
        atualizacoes['status_comissao'] = status;
        atualizacoes['status_pedido'] = 'Entregue';
        atualizacoes['concluida_em'] = new Date().toISOString();
        break;
      case 'Recusada':
      case 'Cancelada':
        atualizacoes['status_comissao'] = status;
        atualizacoes['status_pedido'] = 'Cancelado';
        break;
    }
<<<<<<< Updated upstream

    if (status === 'Finalizada') atualizacoes['concluida_em'] = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('pedidos_principal')
        .update(atualizacoes)
        .eq('id_pedido', id)
        .select('id_pedido, status_comissao, status_pedido, concluida_em')
        .maybeSingle();

      if (error || !data) {
        console.error('Supabase recusou a atualização do pedido:', error);
        this.ultimoErroAtualizacao = error?.code === '42501'
          ? 'O Supabase recusou esta transição por falta de permissão. Ela precisa ser processada pelo backend.'
          : error?.message || 'O Supabase não confirmou a gravação do pedido.';
        return false;
      }

      if (data.status_comissao !== status) {
        console.error('O Supabase confirmou uma atualização com status inesperado:', data);
        this.ultimoErroAtualizacao = 'O status salvo não corresponde à transição solicitada.';
        return false;
      }

      // Confirma a leitura após gravar: só então o BehaviorSubject muda.
      await this.carregarComissoes();
      return true;
    } catch (error) {
      console.error('Falha ao atualizar pedido no Supabase:', error);
      this.ultimoErroAtualizacao = 'Falha de conexão ao salvar o pedido. Nenhuma alteração foi confirmada.';
      return false;
    }
=======
    const { data, error } = await supabase.from('pedidos_principal')
      .update(atualizacoes).eq('id_pedido', id).eq('status_comissao', atual.status_comissao)
      .select('id_pedido, status_comissao, status_pedido, concluida_em').maybeSingle();
    if (error || !data || data.status_comissao !== status) {
      console.error('Não foi possível confirmar a atualização do pedido no Supabase:', error);
      return false;
    }
    await this.carregarComissoes();
    return true;
>>>>>>> Stashed changes
  }

  async vincularCheckout(
    _id: number,
    _paymentId: string,
    _checkoutUrl: string,
    _status: 'pendente' | 'pago' | 'falhou',
    _metodo: 'pix' | 'card' | 'transfer',
  ): Promise<void> {
<<<<<<< Updated upstream
    const pagamento = metodo === 'pix'
      ? 'Pix'
      : metodo === 'card' ? 'Cartão' : 'Transferência / Boleto';

    const pagamentosLocais = this.lerMapaLocal<any>(this.PAGAMENTOS_STORAGE_KEY);
    pagamentosLocais[String(id)] = {
      ...(pagamentosLocais[String(id)] || {}),
      paymentId,
      checkoutUrl,
      pagamento,
    };
    this.salvarMapaLocal(this.PAGAMENTOS_STORAGE_KEY, pagamentosLocais);

    this.comissoesSubject.next(this.comissoesSubject.value.map(item =>
      item.id === id
        ? { ...item, paymentId, checkoutUrl, pagamento }
        : item
    ));
=======
    // O backend já gravou o checkout; a atualização da tela vem da releitura do banco.
    await this.carregarComissoes();
>>>>>>> Stashed changes
  }

  async atualizarPagamento(
    _id: number,
    _status: 'pendente' | 'pago' | 'falhou',
    _opcoes?: { paymentId?: string; metodo?: string; checkoutUrl?: string; reembolso?: boolean },
  ): Promise<void> {
<<<<<<< Updated upstream
    // O backend é responsável por persistir pagamentos e, quando aplicável,
    // atualizar o pedido. Não duplicar a regra financeira nem simular status local.
    void status;
    void opcoes;
=======
    // Status de pagamento e pedido só são alterados pelo backend e recarregados do Supabase.
>>>>>>> Stashed changes
    await this.carregarComissoes();
  }

  async enviarProposta(id: number, valor: number, prazo: string): Promise<boolean> {
    this.ultimoErroAtualizacao = '';
    if (!Number.isFinite(valor) || valor <= 0 || !prazo.trim()) {
      this.ultimoErroAtualizacao = 'Informe um valor e um prazo válidos para a proposta.';
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('pedidos_principal')
        .update({
          status_comissao: 'Aguardando aprovação do cliente',
          proposta_valor: valor,
          proposta_prazo: prazo.trim(),
        })
        .eq('id_pedido', id)
        .eq('status_comissao', 'Solicitada')
        .select('id_pedido, status_comissao')
        .maybeSingle();

      if (error || !data || data.status_comissao !== 'Aguardando aprovação do cliente') {
        console.error('Erro ao enviar proposta:', error);
        this.ultimoErroAtualizacao = error?.code === '42501'
          ? 'O Supabase recusou o envio da proposta por falta de permissão.'
          : error?.message || 'A proposta não foi gravada. O pedido pode ter mudado de estado.';
        return false;
      }

      await this.carregarComissoes();
      return true;
    } catch (error) {
      console.error('Falha de conexão ao enviar proposta:', error);
      this.ultimoErroAtualizacao = 'Falha de conexão. A proposta não foi confirmada.';
      return false;
    }
  }

  async registrarEntrega(
    id: number,
    arquivoFile: File,
    observacaoEntrega: string,
  ): Promise<boolean> {
    try {
      await this.commissionDelivery.registrarEntrega(id, arquivoFile, observacaoEntrega);
      await this.carregarComissoes();
      return this.comissoesSubject.value.some((item) => item.id === id && item.status === 'Entregue');
    } catch (error) {
      console.error('Não foi possível registrar a entrega no backend:', error);
      this.ultimoErroAtualizacao = error instanceof Error
        ? error.message
        : 'Não foi possível confirmar a entrega no backend.';
      return false;
    }
<<<<<<< Updated upstream
  }

  async aprovarEntregaCliente(id: number): Promise<boolean> {
    return this.atualizarStatus(id, 'Finalizada');
  }

  async recusarEntregaCliente(id: number): Promise<boolean> {
    return this.atualizarStatus(id, 'Recusada');
=======

    const listaArquivos: ArquivoEntregaComissao[] =
      arquivosExtras && arquivosExtras.length > 0
        ? arquivosExtras.map((arq, idx) => (idx === 0 ? { ...arq, url: urlFinal || arq.url } : arq))
        : [{ nome: arquivoFile?.name || 'Arquivo da comissão', url: urlFinal, tipo: arquivoFile?.type }];

    const comissaoAtual = this.obterComissao(id);
    const refsCliente = (comissaoAtual?.referencias ?? []).filter(
      (r) =>
        typeof r === 'string' &&
        !r.startsWith('ENTREGA_ARQUIVO::') &&
        !r.startsWith('ENTREGA_OBS::') &&
        !r.startsWith('ENTREGA_ARQUIVOS_JSON::'),
    );
    const referenciasComEntrega = [
      ...refsCliente,
      `ENTREGA_ARQUIVO::${urlFinal}`,
      `ENTREGA_ARQUIVOS_JSON::${JSON.stringify(listaArquivos)}`,
      ...(observacaoEntrega ? [`ENTREGA_OBS::${observacaoEntrega}`] : []),
    ];

    const { data, error } = await supabase
      .from('pedidos_principal')
      .update({
        status_comissao: 'Entregue',
        status_pedido: 'Entregue para Avaliação do Cliente',
        referencias: referenciasComEntrega,
      })
      .eq('id_pedido', id)
      .select('id_pedido, status_comissao')
      .maybeSingle();
    if (error || !data || data.status_comissao !== 'Entregue') {
      console.error('O Supabase não confirmou o envio da entrega:', error);
      return false;
    }

    const entregasLocais = this.lerMapaLocal<{
      arquivoEntrega: string;
      observacaoEntrega: string;
      arquivosEntrega?: ArquivoEntregaComissao[];
    }>(this.ENTREGAS_STORAGE_KEY);
    entregasLocais[String(id)] = { arquivoEntrega: urlFinal, observacaoEntrega, arquivosEntrega: listaArquivos };
    this.salvarMapaLocal(this.ENTREGAS_STORAGE_KEY, entregasLocais);

    await this.carregarComissoes();
    return true;
  }

  async aprovarEntregaCliente(id: number): Promise<boolean> {
    try {
      const response = await firstValueFrom(this.http.post<{ orderId: number; status: string }>(
        `/api/commissions/${id}/accept`, {},
      ));
      if (response?.orderId !== id || response.status !== 'Finalizada') return false;
      await this.carregarComissoes();
      return this.obterComissao(id)?.status === 'Finalizada';
    } catch (error) {
      console.error('Não foi possível confirmar o aceite da entrega no backend:', error);
      return false;
    }
  }

  async recusarEntregaCliente(id: number): Promise<boolean> {
    const ok = await this.atualizarStatus(id, 'Recusada');
    return ok;
>>>>>>> Stashed changes
  }

  async solicitarRevisaoEntrega(id: number): Promise<boolean> {
    return this.atualizarStatus(id, 'Em andamento');
  }

  // CATÁLOGO (OPÇÕES E DIRETRIZES)
  // ============================================================================

  private async carregarCatalogo(): Promise<void> {
    const { data: opcoes } = await supabase
      .from('opcao_comissao')
      .select(`
        id_opcao,
        id_artista,
        titulo,
        descricao,
        preco_inicial,
        prazo,
        itens,
        destaque,
        ativa,
        artista (
          id_artista,
          nome_artistico
        )
      `);

    const { data: diretrizes } = await supabase
      .from('diretriz_comissao')
      .select(`
        id_diretriz,
        id_artista,
        titulo,
        descricao,
        artista (
          id_artista,
          nome_artistico
        )
      `);

    const opcoesMapeadas: OpcaoComissao[] = (opcoes ?? []).map((item: any): OpcaoComissao => ({
      id: item.id_opcao,
      artistaUsername: item.artista?.nome_artistico ?? '',
      titulo: item.titulo,
      descricao: item.descricao,
      precoInicial: Number(item.preco_inicial),
      prazo: item.prazo,
      itens: item.itens ?? [],
      destaque: item.destaque,
      ativa: item.ativa,
    }));

    const diretrizesMapeadas: DiretrizComissao[] = (diretrizes ?? []).map((item: any): DiretrizComissao => ({
      id: item.id_diretriz,
      artistaUsername: item.artista?.nome_artistico ?? '',
      titulo: item.titulo,
      descricao: item.descricao,
    }));

    this.catalogoSubject.next({ opcoes: opcoesMapeadas, diretrizes: diretrizesMapeadas });
  }

  listarOpcoesComissao(username: string, incluirInativas = false): OpcaoComissao[] {
    return this.catalogoSubject.value.opcoes
      .filter(
        (item) =>
          this.correspondeAoArtista(item.artistaUsername, username) &&
          (incluirInativas || item.ativa),
      )
      .map((item) => ({ ...item, itens: [...item.itens] }));
  }

  async salvarOpcaoComissao(opcao: Omit<OpcaoComissao, 'id'> & { id?: number }): Promise<OpcaoComissao | null> {
    const idArtista = await this.localizarIdArtista(opcao.artistaUsername);
    if (!idArtista) return null;
    const artistaData = { id_artista: idArtista };

    if (opcao.id) {
      const { error } = await supabase
        .from('opcao_comissao')
        .update({
          titulo: opcao.titulo,
          descricao: opcao.descricao,
          preco_inicial: opcao.precoInicial,
          prazo: opcao.prazo,
          itens: opcao.itens,
          destaque: opcao.destaque,
          ativa: opcao.ativa,
        })
        .eq('id_opcao', opcao.id)
        .eq('id_artista', artistaData.id_artista);

      if (error) {
        console.error('Erro ao atualizar opção:', error);
        return null;
      }
    } else {
      const { data, error } = await supabase
        .from('opcao_comissao')
        .insert({
          id_artista: artistaData.id_artista,
          titulo: opcao.titulo,
          descricao: opcao.descricao,
          preco_inicial: opcao.precoInicial,
          prazo: opcao.prazo,
          itens: opcao.itens,
          destaque: opcao.destaque,
          ativa: opcao.ativa,
        })
        .select('id_opcao')
        .single();

      if (error || !data) {
        console.error('Erro ao criar opção:', error);
        return null;
      }
      opcao.id = data.id_opcao;
    }

    await this.carregarCatalogo();
    return { ...opcao, itens: [...opcao.itens] } as OpcaoComissao;
  }

  async excluirOpcaoComissao(id: number, username: string): Promise<void> {
    const idArtista = await this.localizarIdArtista(username);
    if (!idArtista) return;
    const artistaData = { id_artista: idArtista };

    const { error } = await supabase
      .from('opcao_comissao')
      .delete()
      .eq('id_opcao', id)
      .eq('id_artista', artistaData.id_artista);

    if (error) {
      console.error('Erro ao excluir opção:', error);
      return;
    }

    await this.carregarCatalogo();
  }

  listarDiretrizes(username: string): DiretrizComissao[] {
    return this.catalogoSubject.value.diretrizes
      .filter((item) => this.correspondeAoArtista(item.artistaUsername, username))
      .map((item) => ({ ...item }));
  }

  async salvarDiretriz(diretriz: Omit<DiretrizComissao, 'id'> & { id?: number }): Promise<DiretrizComissao | null> {
    const idArtista = await this.localizarIdArtista(diretriz.artistaUsername);
    if (!idArtista) return null;
    const artistaData = { id_artista: idArtista };

    if (diretriz.id) {
      const { error } = await supabase
        .from('diretriz_comissao')
        .update({
          titulo: diretriz.titulo,
          descricao: diretriz.descricao,
        })
        .eq('id_diretriz', diretriz.id)
        .eq('id_artista', artistaData.id_artista);

      if (error) {
        console.error('Erro ao atualizar diretriz:', error);
        return null;
      }
    } else {
      const { data, error } = await supabase
        .from('diretriz_comissao')
        .insert({
          id_artista: artistaData.id_artista,
          titulo: diretriz.titulo,
          descricao: diretriz.descricao,
        })
        .select('id_diretriz')
        .single();

      if (error || !data) {
        console.error('Erro ao criar diretriz:', error);
        return null;
      }
      diretriz.id = data.id_diretriz;
    }

    await this.carregarCatalogo();
    return { ...diretriz } as DiretrizComissao;
  }

  async excluirDiretriz(id: number, username: string): Promise<void> {
    const idArtista = await this.localizarIdArtista(username);
    if (!idArtista) return;
    const artistaData = { id_artista: idArtista };

    const { error } = await supabase
      .from('diretriz_comissao')
      .delete()
      .eq('id_diretriz', id)
      .eq('id_artista', artistaData.id_artista);

    if (error) {
      console.error('Erro ao excluir diretriz:', error);
      return;
    }

    await this.carregarCatalogo();
  }

  // ============================================================================
  // AVALIAÇÕES
  // ============================================================================

  
private async carregarAvaliacoes(): Promise<void> {
  const { data, error } = await supabase
    .from('review')
    .select(`
      id_review,
      id_artista,
      id_cliente,
      nota,
      comentario,
      data_review,
      artista:artista!fk_review_artista (
        id_artista,
        nome_artistico
      ),
      cliente:usuario!fk_review_cliente (
        id_usuario,
        nome_usuario
      )
    `);

  if (error) {
    console.error('Erro ao carregar avaliações:', error);
    return;
  }

  const avaliacoes: AvaliacaoArtista[] = (data ?? []).map(
    (item: any): AvaliacaoArtista => ({
      id: item.id_review,
      artistaUsername: item.artista?.nome_artistico ?? '',
      cliente: item.cliente?.nome_usuario ?? '',
      nota: item.nota,
      comentario: item.comentario ?? '',
      data: item.data_review,
    })
  );

  this.avaliacoesSubject.next(avaliacoes);
}

  listarAvaliacoes(username: string): AvaliacaoArtista[] {
    return this.avaliacoesSubject.value
      .filter((item) => this.correspondeAoArtista(item.artistaUsername, username))
      .map((item) => ({ ...item }));
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  renomearArtista(usernameAntigo: string, usernameNovo: string): void {
    this.comissoesSubject.next(
      this.comissoesSubject.value.map((item) =>
        item.artistaUsername === usernameAntigo ? { ...item, artistaUsername: usernameNovo } : item,
      ),
    );

    const avaliacoes = this.avaliacoesSubject.value.map((avaliacao) =>
      avaliacao.artistaUsername === usernameAntigo ? { ...avaliacao, artistaUsername: usernameNovo } : avaliacao,
    );
    this.avaliacoesSubject.next(avaliacoes);

    const catalogo = this.catalogoSubject.value;
    this.catalogoSubject.next({
      opcoes: catalogo.opcoes.map((item) =>
        item.artistaUsername === usernameAntigo ? { ...item, artistaUsername: usernameNovo } : item,
      ),
      diretrizes: catalogo.diretrizes.map((item) =>
        item.artistaUsername === usernameAntigo ? { ...item, artistaUsername: usernameNovo } : item,
      ),
    });

    const privacidade = this.privacidadeSubject.value;
    const preferencia = privacidade.get(usernameAntigo);
    if (preferencia) {
      const novaPrivacidade = new Map(privacidade);
      novaPrivacidade.set(usernameNovo, preferencia);
      novaPrivacidade.delete(usernameAntigo);
      this.privacidadeSubject.next(novaPrivacidade);
    }
  }

  // ============================================================================
  // PRIVACIDADE
  // ============================================================================

  private lerPrivacidadeLocal(): Record<string, PrivacidadeArtista> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {};
    }
    try {
      const raw = window.localStorage.getItem('charte_privacidade_usuarios_v1');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private salvarPrivacidadeLocal(username: string, dados: PrivacidadeArtista): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      const atual = this.lerPrivacidadeLocal();
      atual[username] = { ...dados };
      window.localStorage.setItem('charte_privacidade_usuarios_v1', JSON.stringify(atual));
    } catch {
      // Ignora erros de quota do localStorage
    }
  }

  private async carregarPrivacidade(): Promise<void> {
    const mapa = new Map<string, PrivacidadeArtista>();
    const locais = this.lerPrivacidadeLocal();
    Object.entries(locais).forEach(([username, pref]) => {
      mapa.set(username, { ...PRIVACIDADE_PADRAO, ...pref });
    });

    const { data, error } = await supabase
      .from('privacidade_artista')
      .select(`
        id_usuario,
        perfil_publico,
        exibir_redes_sociais,
        exibir_informacoes,
        aceitar_comissoes,
        usuario (
          id_usuario,
          nome_usuario
        )
      `);

    if (error) {
      console.error('Erro ao carregar privacidade:', error);
      this.privacidadeSubject.next(mapa);
      return;
    }

    (data ?? []).forEach((item: any) => {
      if (item.usuario?.nome_usuario) {
        mapa.set(item.usuario.nome_usuario, {
          perfilPublico: item.perfil_publico,
          exibirRedesSociais: item.exibir_redes_sociais,
          exibirInformacoes: item.exibir_informacoes,
          aceitarComissoes: item.aceitar_comissoes,
        });
      }
    });
    this.privacidadeSubject.next(mapa);
  }

  obterPrivacidade(username: string): PrivacidadeArtista {
    const doMapa = this.privacidadeSubject.value.get(username);
    if (doMapa) {
      return { ...doMapa };
    }
    const locais = this.lerPrivacidadeLocal();
    if (locais[username]) {
      return { ...PRIVACIDADE_PADRAO, ...locais[username] };
    }
    return { ...PRIVACIDADE_PADRAO };
  }

  async salvarPrivacidade(username: string, dados: PrivacidadeArtista): Promise<void> {
    const normalizado: PrivacidadeArtista = {
      perfilPublico: Boolean(dados.perfilPublico),
      exibirRedesSociais: Boolean(dados.exibirRedesSociais),
      exibirInformacoes: Boolean(dados.exibirInformacoes),
      aceitarComissoes: Boolean(dados.aceitarComissoes),
    };

    this.salvarPrivacidadeLocal(username, normalizado);
    const novaPrivacidade = new Map(this.privacidadeSubject.value);
    novaPrivacidade.set(username, { ...normalizado });
    this.privacidadeSubject.next(novaPrivacidade);

    const { data: usuarioData } = await supabase
      .from('usuario')
      .select('id_usuario')
      .eq('nome_usuario', username)
      .single();

    if (!usuarioData) return;

    const { error } = await supabase
      .from('privacidade_artista')
      .upsert({
        id_usuario: usuarioData.id_usuario,
        perfil_publico: normalizado.perfilPublico,
        exibir_redes_sociais: normalizado.exibirRedesSociais,
        exibir_informacoes: normalizado.exibirInformacoes,
        aceitar_comissoes: normalizado.aceitarComissoes,
      });

    if (error) {
      console.error('Erro ao salvar privacidade:', error);
    }
  }
}
