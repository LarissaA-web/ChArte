import { Injectable } from '@angular/core';
import { Observable, from, of, BehaviorSubject } from 'rxjs';
import {
  AvaliacaoArtista,
  Comissao,
  DiretrizComissao,
  OpcaoComissao,
  PrivacidadeArtista,
  StatusComissao,
} from '../app/models/artist-area';
import { supabase } from '../app/core/supabase/supabase.client';
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
  cliente: { ...item.cliente },
});

@Injectable({ providedIn: 'root' })
export class ArtistAreaService {
  private readonly comissoesSubject = new BehaviorSubject<Comissao[]>([]);
  private readonly comissoesCarregadasSubject = new BehaviorSubject<boolean>(false);
  readonly comissoesCarregadas$ = this.comissoesCarregadasSubject.asObservable();

  readonly comissoes$ = this.comissoesSubject.asObservable();

  /** Retorna o snapshot atual das comissões. */
  obterComissoesAtuais(): Comissao[] {
    return this.comissoesSubject.getValue();
  }

  private readonly catalogoSubject = new BehaviorSubject<{
    opcoes: OpcaoComissao[];
    diretrizes: DiretrizComissao[];
  }>({ opcoes: [], diretrizes: [] });
  readonly catalogo$ = this.catalogoSubject.asObservable();

  private readonly privacidadeSubject = new BehaviorSubject<Map<string, PrivacidadeArtista>>(new Map());
  private readonly avaliacoesSubject = new BehaviorSubject<AvaliacaoArtista[]>([]);

  constructor() {
    this.carregarTudo();
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
      this.comissoesCarregadasSubject.next(true);
      return;
    }

    const pedidos = data ?? [];
    const ids = pedidos.map((item: any) => item.id_pedido);
    const pagamentosPorPedido = new Map<number, any>();

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

    const mapearStatus = (
      statusComissao: string | null,
      statusPedido: string,
    ): StatusComissao => {
      if (statusComissao && statusConhecidos.includes(statusComissao as StatusComissao)) {
        return statusComissao as StatusComissao;
      }

      switch (statusPedido) {
        case 'Em Produção':
        case 'Enviado':
          return 'Em andamento';
        case 'Entregue para Avaliação do Cliente':
          return 'Entregue';
        case 'Entregue':
          return 'Finalizada';
        case 'Cancelado':
        case 'Devolvido':
        case 'Reembolso':
          return 'Cancelada';
        default:
          return 'Pendente';
      }
    };

    const mapearStatusPagamento = (
      status: string | null | undefined,
    ): 'pendente' | 'pago' | 'falhou' | undefined => {
      switch (status) {
        case 'Pago': return 'pago';
        case 'Cancelado':
        case 'Reembolso': return 'falhou';
        case 'Pendente': return 'pendente';
        default: return undefined;
      }
    };

    const mapearMetodo = (metodo: string | null | undefined): string | undefined => {
      switch (metodo) {
        case 'Pix': return 'Pix';
        case 'Cartão de Crédito':
        case 'Cartão de Débito': return 'Cartão';
        case 'Boleto': return 'Boleto';
        default: return undefined;
      }
    };

    const comissoes: Comissao[] = pedidos.map((item: any) => {
      const artista = Array.isArray(item.artista) ? item.artista[0] : item.artista;
      const cliente = Array.isArray(item.cliente) ? item.cliente[0] : item.cliente;
      const pagamento = pagamentosPorPedido.get(item.id_pedido);

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
        referencias: item.referencias ?? [],
        valor: Number(item.valor_total ?? 0),
        criadaEm: item.data_criacao,
        prazo: item.prazo ?? '',
        status: mapearStatus(item.status_comissao, item.status_pedido),
        concluidaEm: item.concluida_em ?? undefined,
        pagamento: mapearMetodo(pagamento?.metodo),
        pagamentoStatus: mapearStatusPagamento(pagamento?.status_pagamento),
        paymentId: pagamento?.gateway_payment_id ?? undefined,
        checkoutUrl: pagamento?.checkout_url ?? undefined,
        opcaoTitulo: item.opcao_titulo ?? undefined,
        propostaValor: item.proposta_valor != null
          ? Number(item.proposta_valor) : undefined,
        propostaPrazo: item.proposta_prazo ?? undefined,
      };
    });

    this.comissoesSubject.next(comissoes);
    this.comissoesCarregadasSubject.next(true);
  }

  listarComissoes(username: string): Comissao[] {
    return this.comissoesSubject.value
      .filter(item => item.artistaUsername.toLowerCase() === username.toLowerCase())
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

  async solicitarComissao(
    dados: Omit<Comissao, 'id' | 'status' | 'criadaEm'>
  ): Promise<Comissao | null> {
    const { data: artistaData, error: erroArtista } = await supabase
      .from('artista')
      .select('id_artista')
      .eq('nome_artistico', dados.artistaUsername)
      .single();

    if (erroArtista || !artistaData) {
      console.error('Artista não encontrado:', erroArtista);
      return null;
    }

    const { data: clienteData, error: erroCliente } = await supabase
      .from('usuario')
      .select('id_usuario')
      .eq('nome_usuario', dados.cliente.username)
      .single();

    if (erroCliente || !clienteData) {
      console.error('Cliente não encontrado:', erroCliente);
      return null;
    }

    const { data, error } = await supabase
      .from('pedidos_principal')
      .insert({
        id_artista: artistaData.id_artista,
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
    const atualizacoes: Record<string, unknown> = {};

    switch (status) {
      case 'Solicitada':
      case 'Pendente':
        atualizacoes['status_comissao'] = status;
        atualizacoes['status_pedido'] = 'Pendente';
        break;
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

    const { error } = await supabase
      .from('pedidos_principal')
      .update(atualizacoes)
      .eq('id_pedido', id);

    if (error) {
      console.error('Erro ao atualizar status da comissão:', error);
      return false;
    }

    await this.carregarComissoes();
    return true;
  }

  async vincularCheckout(
    id: number,
    paymentId: string,
    checkoutUrl: string,
    status: 'pendente' | 'pago' | 'falhou',
    metodo: 'pix' | 'card' | 'transfer',
  ): Promise<void> {
    // O backend é responsável pela persistência e confirmação do pagamento.
    const pagamento = metodo === 'pix'
      ? 'Pix'
      : metodo === 'card' ? 'Cartão' : 'Transferência';

    this.comissoesSubject.next(this.comissoesSubject.value.map(item =>
      item.id === id
        ? { ...item, paymentId, checkoutUrl, pagamento, pagamentoStatus: status }
        : item
    ));
  }

  async atualizarPagamento(
    id: number,
    status: 'pendente' | 'pago' | 'falhou',
  ): Promise<void> {
    // Reflete temporariamente na tela o status retornado pela API.
    this.comissoesSubject.next(this.comissoesSubject.value.map(item =>
      item.id === id ? { ...item, pagamentoStatus: status } : item
    ));
  }

  async enviarProposta(id: number, valor: number, prazo: string): Promise<void> {
    if (!Number.isFinite(valor) || valor <= 0 || !prazo.trim()) return;

    const { error } = await supabase
      .from('pedidos_principal')
      .update({
        status_comissao: 'Aguardando aprovação do cliente',
        proposta_valor: valor,
        proposta_prazo: prazo.trim(),
      })
      .eq('id_pedido', id)
      .eq('status_comissao', 'Solicitada');

    if (error) {
      console.error('Erro ao enviar proposta:', error);
      return;
    }

    await this.carregarComissoes();
  }

  async registrarEntrega(
    id: number,
    arquivoEntrega: string,
    observacaoEntrega: string,
  ): Promise<void> {
    // A tabela atual não possui colunas para persistir arquivo e observação.
    const { error } = await supabase
      .from('pedidos_principal')
      .update({
        status_comissao: 'Entregue',
        status_pedido: 'Entregue para Avaliação do Cliente',
      })
      .eq('id_pedido', id)
      .eq('status_pedido', 'Em Produção');

    if (error) {
      console.error('Erro ao registrar entrega:', error);
      return;
    }

    this.comissoesSubject.next(this.comissoesSubject.value.map(item =>
      item.id === id
        ? { ...item, status: 'Entregue', arquivoEntrega, observacaoEntrega }
        : item
    ));

    await this.carregarComissoes();
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
          item.artistaUsername.toLowerCase() === username.toLowerCase() &&
          (incluirInativas || item.ativa),
      )
      .map((item) => ({ ...item, itens: [...item.itens] }));
  }

  async salvarOpcaoComissao(opcao: Omit<OpcaoComissao, 'id'> & { id?: number }): Promise<OpcaoComissao | null> {
    const { data: artistaData } = await supabase
      .from('artista')
      .select('id_artista')
      .eq('nome_artistico', opcao.artistaUsername)
      .single();

    if (!artistaData) return null;

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
    const { data: artistaData } = await supabase
      .from('artista')
      .select('id_artista')
      .eq('nome_artistico', username)
      .single();

    if (!artistaData) return;

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
      .filter((item) => item.artistaUsername.toLowerCase() === username.toLowerCase())
      .map((item) => ({ ...item }));
  }

  async salvarDiretriz(diretriz: Omit<DiretrizComissao, 'id'> & { id?: number }): Promise<DiretrizComissao | null> {
    const { data: artistaData } = await supabase
      .from('artista')
      .select('id_artista')
      .eq('nome_artistico', diretriz.artistaUsername)
      .single();

    if (!artistaData) return null;

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
    const { data: artistaData } = await supabase
      .from('artista')
      .select('id_artista')
      .eq('nome_artistico', username)
      .single();

    if (!artistaData) return;

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
      .filter((item) => item.artistaUsername === username)
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

  private async carregarPrivacidade(): Promise<void> {
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
      return;
    }

    const mapa = new Map<string, PrivacidadeArtista>();
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
    return { ...(this.privacidadeSubject.value.get(username) ?? PRIVACIDADE_PADRAO) };
  }

  async salvarPrivacidade(username: string, dados: PrivacidadeArtista): Promise<void> {
    const { data: usuarioData } = await supabase
      .from('usuario')
      .select('id_usuario')
      .eq('nome_usuario', username)
      .single();

    if (!usuarioData) return;

    const { data: artistaData } = await supabase
      .from('artista')
      .select('id_artista')
      .eq('id_usuario', usuarioData.id_usuario)
      .single();

    if (!artistaData) return;

    const { error } = await supabase
      .from('privacidade_artista')
      .upsert({
        id_usuario: usuarioData.id_usuario,
        perfil_publico: dados.perfilPublico,
        exibir_redes_sociais: dados.exibirRedesSociais,
        exibir_informacoes: dados.exibirInformacoes,
        aceitar_comissoes: dados.aceitarComissoes,
      });

    if (error) {
      console.error('Erro ao salvar privacidade:', error);
      return;
    }

    const novaPrivacidade = new Map(this.privacidadeSubject.value);
    novaPrivacidade.set(username, { ...dados });
    this.privacidadeSubject.next(novaPrivacidade);
  }
}
