import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { ArtistAreaService } from '../../../../services/artist-area.service';
import { PerfilService } from '../../../../services/perfil.service';
import { ModalService } from '../../../../services/modal.service';
import { PinService } from '../../../../services/pinService';
import { PaymentService, PaymentView } from '../../../../services/payment.service';
import { ArtistFinanceMovement, ArtistFinanceService, ArtistFinanceSummary } from '../../../../services/artist-finance.service';
import {
  AvaliacaoArtista,
  CalculoRepasseArtista,
  Comissao,
  DiretrizComissao,
  OpcaoComissao,
  PrivacidadeArtista,
  StatusComissao,
  calcularRepasseArtista,
  calcularRepasseComissao,
  pagamentoLiberadoParaArtista,
} from '../../../models/artist-area';
import { PerfilView } from '../../../models/perfil';
import { Post } from '../../../models/post';
import { Portfolio } from '../../../components/profile/portfolio/portfolio';
import { ArtistDashboard } from '../artist-dashboard/artist-dashboard';
import { criarDadosDashboard } from '../artist-dashboard/artist-dashboard.models';
import { PinCard } from '../../../components/pin-card/pin-card';
import { PinCardModal } from '../../../components/pin-card-modal/pin-card-modal';
import { CommissionDetailModal } from '../../../components/commission-detail-modal/commission-detail-modal';
import { DeleteAccountCard } from '../../../components/profile/delete-account-card/delete-account-card';

type SecaoArtista = 'dashboard' | 'comissoes' | 'opcoes-comissao' | 'historico' | 'vendas' | 'artes' | 'portfolio' | 'avaliacoes' | 'privacidade' | 'seguranca';

@Component({
  selector: 'app-artist-area',
  standalone: true,
  imports: [ArtistDashboard, CommonModule, FormsModule, RouterLink, Portfolio, PinCard, PinCardModal, CommissionDetailModal, DeleteAccountCard],
  templateUrl: './artist-area.html',
  styleUrl: './artist-area.css',
})
export class ArtistArea implements OnInit, OnDestroy {
  @Input({ required: true }) perfil!: PerfilView;
  @Input() artes: Post[] = [];
  @Output() perfilAtualizado = new EventEmitter<PerfilView>();
  @Output() artesAtualizadas = new EventEmitter<Post[]>();

  @ViewChild('inputArquivosComissao') inputArquivosComissao?: ElementRef<HTMLInputElement>;

  secaoAtual: SecaoArtista = 'dashboard';
  filtroComissao: 'Todas' | StatusComissao = 'Todas';
  editandoArte: Post | null = null;
  previewEdicaoArte = '';
  erroEdicaoArte = '';
  menuAberto = false;
  arquivoSelecionado: File | null = null;
  previewEntrega = '';
  erroEntrega = '';
  sucessoEntrega = false;
  enviandoEntrega = false;
  entregaAtual: Comissao | null = null;
  comissaoSelecionada: Comissao | null = null;
  observacaoEntrega = '';
  privacidade: PrivacidadeArtista = { perfilPublico: true, exibirRedesSociais: true, exibirInformacoes: true, aceitarComissoes: true };
  emailNovo = '';
  senhaAtual = '';
  senhaNova = '';
  senhaConfirmacao = '';
  mostrarSenhaAtual = false;
  mostrarSenhaNova = false;
  mostrarSenhaConfirmacao = false;
  usernameNovo = '';
  mensagemSeguranca = '';
  readonly filtrosComissao: ('Todas' | StatusComissao)[] = ['Todas', 'Solicitada', 'Aguardando aprovação do cliente', 'Pendente', 'Em andamento', 'Entregue', 'Finalizada', 'Recusada', 'Cancelada'];
  readonly secoes: { grupo: string; itens: { id: SecaoArtista; titulo: string }[] }[] = [
    { grupo: 'PAINEL', itens: [{ id: 'dashboard', titulo: 'Dashboard' }] },
    { grupo: 'COMISSÕES', itens: [{ id: 'comissoes', titulo: 'Minhas Comissões' }, { id: 'opcoes-comissao', titulo: 'Opções e diretrizes' }, { id: 'historico', titulo: 'Histórico' }, { id: 'vendas', titulo: 'Vendas e Pagamentos' }] },
    { grupo: 'CONTEÚDO', itens: [{ id: 'artes', titulo: 'Minhas Artes' }, { id: 'portfolio', titulo: 'Portfólio' }] },
    { grupo: 'AVALIAÇÕES', itens: [{ id: 'avaliacoes', titulo: 'Avaliações' }] },
    { grupo: 'CONTA', itens: [{ id: 'privacidade', titulo: 'Privacidade' }, { id: 'seguranca', titulo: 'Segurança' }] },
  ];

  vendasArtista: PaymentView[] = [];
  carregandoVendas = false;
  resumoFinanceiro: ArtistFinanceSummary | null = null;
  movimentacoesFinanceiras: ArtistFinanceMovement[] = [];
  totalMovimentacoesFinanceiras = 0;
  paginaMovimentacoesFinanceiras = 0;
  carregandoFinanceiro = false;
  carregandoMovimentacoes = false;
  erroFinanceiro = '';
  erroMovimentacoes = '';
  private subscriptions = new Subscription();

  constructor(
    public artistData: ArtistAreaService,
    private perfilService: PerfilService,
    private pinService: PinService,
    private auth: AuthService,
    private router: Router,
    private modal: ModalService,
    private paymentService: PaymentService,
    private artistFinance: ArtistFinanceService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.carregarDashboardFinanceiro();
    this.subscriptions.add(
      this.artistData.comissoes$.subscribe(() => {
        if (this.comissaoSelecionada) {
          this.comissaoSelecionada =
            this.artistData.obterComissao(this.comissaoSelecionada.id) ?? null;
        }
        this.cdr.detectChanges();
      }),
    );
    this.subscriptions.add(
      this.artistData.catalogo$.subscribe(() => {
        this.cdr.detectChanges();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.limparPreviewEntrega();
  }

  get receitaTotalAprovada(): number {
    return this.vendasArtista
      .filter((v) => (v.status === 'APPROVED' || v.status === 'PAID') && this.vendaLiberadaParaArtista(v))
      .reduce((acc, v) => acc + this.calcularRepasseDaVenda(v).valorLiquido, 0);
  }

  calcularRepasse(valor: number): CalculoRepasseArtista {
    return calcularRepasseArtista(valor);
  }

  calcularRepasseDaVenda(venda: PaymentView): CalculoRepasseArtista {
    const comissao = this.artistData.obterComissao(venda.orderId);
    if (comissao) {
      return calcularRepasseComissao(comissao);
    }
    return calcularRepasseArtista(Number(venda.amount || 0));
  }

  repasseDaComissao(comissao: Comissao): CalculoRepasseArtista {
    return calcularRepasseComissao(comissao);
  }

  pagamentoLiberado(comissao: Comissao): boolean {
    return pagamentoLiberadoParaArtista(comissao);
  }

  vendaLiberadaParaArtista(venda: PaymentView): boolean {
    const comissao = this.artistData.obterComissao(venda.orderId);
    if (!comissao) return true;
    return pagamentoLiberadoParaArtista(comissao);
  }

  get comissoes(): Comissao[] { return this.artistData.listarComissoes(this.perfil.nomeUsuario); }
  get opcoesComissao(): OpcaoComissao[] { return this.artistData.listarOpcoesComissao(this.perfil.nomeUsuario, true); }
  get diretrizesComissao(): DiretrizComissao[] { return this.artistData.listarDiretrizes(this.perfil.nomeUsuario); }
  get statusTopo() { return this.dashboardData.comissoesPorStatus.filter((item) => ['Solicitada', 'Aguardando aprovação do cliente', 'Pendente', 'Em andamento', 'Entregue', 'Finalizada'].includes(item.status)); }
  get avaliacoes(): AvaliacaoArtista[] { return this.artistData.listarAvaliacoes(this.perfil.nomeUsuario); }
  get comissoesVisiveis(): Comissao[] {
    const relevantes = this.secaoAtual === 'historico'
      ? this.comissoes.filter((item) => ['Finalizada', 'Cancelada', 'Recusada'].includes(item.status))
      : this.comissoes.filter((item) => ['Solicitada', 'Aguardando aprovação do cliente', 'Pendente', 'Em andamento', 'Entregue'].includes(item.status));
    return this.filtroComissao === 'Todas' ? relevantes : relevantes.filter((item) => item.status === this.filtroComissao);
  }
  get avaliacaoMedia(): number {
    if (this.avaliacoes.length) {
      return this.avaliacoes.reduce((total, item) => total + item.nota, 0) / this.avaliacoes.length;
    }
    return Number(this.perfil?.avaliacaoMedia ?? 0);
  }
  get atividades(): Comissao[] { return [...this.comissoes].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)).slice(0, 5); }
  get dashboardData() { return criarDadosDashboard(this.comissoes); }

  filtrarPeloDashboard(status: StatusComissao): void {
    if (status === 'Finalizada' || status === 'Cancelada' || status === 'Recusada') {
      this.secaoAtual = 'historico';
      this.filtroComissao = status;
    } else {
      this.secaoAtual = 'comissoes';
      this.filtroComissao = status;
    }
    this.cdr.detectChanges();
  }

  abrirComissaoDaAtividade(comissao: Comissao): void {
    if (['Finalizada', 'Cancelada', 'Recusada'].includes(comissao.status)) {
      this.secaoAtual = 'historico';
      this.filtroComissao = 'Todas';
    } else {
      this.secaoAtual = 'comissoes';
      this.filtroComissao = 'Todas';
      if (comissao.status !== 'Solicitada') {
        this.comissaoSelecionada = comissao;
      }
    }
    this.cdr.detectChanges();
  }

  opcaoEditando: OpcaoComissao | null = null;
  valoresProposta: Record<number, number | undefined> = {};
  prazosProposta: Record<number, string | undefined> = {};
  diretrizEditando: DiretrizComissao | null = null;
  itensOfertaTexto = '';
  erroCatalogo = '';

  novaOpcaoComissao(): void {
    this.opcaoEditando = { id: 0, artistaUsername: this.perfil.nomeUsuario, titulo: '', descricao: '', precoInicial: 0, prazo: '', itens: [], destaque: false, ativa: true };
    this.itensOfertaTexto = '';
    this.erroCatalogo = '';
  }
  editarOpcaoComissao(opcao: OpcaoComissao): void { this.opcaoEditando = { ...opcao, itens: [...opcao.itens] }; this.itensOfertaTexto = opcao.itens.join('\n'); this.erroCatalogo = ''; }
  salvarOpcaoComissao(): void {
    if (!this.opcaoEditando) return;
    if (!this.opcaoEditando.titulo.trim() || !this.opcaoEditando.descricao.trim() || !this.opcaoEditando.prazo.trim() || this.opcaoEditando.precoInicial < 0) { this.erroCatalogo = 'Preencha título, descrição, prazo e um preço válido.'; return; }
    this.artistData.salvarOpcaoComissao({ ...this.opcaoEditando, titulo: this.opcaoEditando.titulo.trim(), descricao: this.opcaoEditando.descricao.trim(), prazo: this.opcaoEditando.prazo.trim(), itens: this.itensOfertaTexto.split('\n').map((item) => item.trim()).filter(Boolean), artistaUsername: this.perfil.nomeUsuario, id: this.opcaoEditando.id || undefined });
    this.opcaoEditando = null;
  }
  excluirOpcaoComissao(opcao: OpcaoComissao): void { if (window.confirm(`Excluir a opção “${opcao.titulo}”?`)) this.artistData.excluirOpcaoComissao(opcao.id, this.perfil.nomeUsuario); }
  alternarOpcaoComissao(opcao: OpcaoComissao): void { this.artistData.salvarOpcaoComissao({ ...opcao, ativa: !opcao.ativa }); }
  novaDiretriz(): void { this.diretrizEditando = { id: 0, artistaUsername: this.perfil.nomeUsuario, titulo: '', descricao: '' }; this.erroCatalogo = ''; }
  editarDiretriz(diretriz: DiretrizComissao): void { this.diretrizEditando = { ...diretriz }; this.erroCatalogo = ''; }
  salvarDiretriz(): void {
    if (!this.diretrizEditando) return;
    if (!this.diretrizEditando.titulo.trim() || !this.diretrizEditando.descricao.trim()) { this.erroCatalogo = 'Preencha o título e a descrição da diretriz.'; return; }
    this.artistData.salvarDiretriz({ ...this.diretrizEditando, titulo: this.diretrizEditando.titulo.trim(), descricao: this.diretrizEditando.descricao.trim(), artistaUsername: this.perfil.nomeUsuario, id: this.diretrizEditando.id || undefined });
    this.diretrizEditando = null;
  }
  excluirDiretriz(diretriz: DiretrizComissao): void { if (window.confirm(`Excluir a diretriz “${diretriz.titulo}”?`)) this.artistData.excluirDiretriz(diretriz.id, this.perfil.nomeUsuario); }

  private async carregarVendasArtista(): Promise<void> {
    this.carregandoVendas = true;
    this.cdr.detectChanges();
    try {
      this.vendasArtista = await this.paymentService.listarVendasArtista();
    } catch {
      this.vendasArtista = [];
    } finally {
      this.carregandoVendas = false;
      this.cdr.detectChanges();
    }
  }

  async carregarDashboardFinanceiro(): Promise<void> {
    this.carregandoFinanceiro = true;
    this.carregandoMovimentacoes = true;
    this.erroFinanceiro = '';
    this.erroMovimentacoes = '';
    this.cdr.detectChanges();

    const [resumo, movimentos] = await Promise.allSettled([
      this.artistFinance.getSummary(),
      this.artistFinance.getMovements(this.paginaMovimentacoesFinanceiras),
    ]);

    if (resumo.status === 'fulfilled') {
      this.resumoFinanceiro = resumo.value;
    } else {
      this.resumoFinanceiro = null;
      this.erroFinanceiro = 'Não foi possível carregar os dados financeiros. Tente novamente.';
    }
    this.carregandoFinanceiro = false;

    if (movimentos.status === 'fulfilled') {
      this.movimentacoesFinanceiras = movimentos.value.items;
      this.totalMovimentacoesFinanceiras = movimentos.value.total;
    } else {
      this.movimentacoesFinanceiras = [];
      this.totalMovimentacoesFinanceiras = 0;
      this.erroMovimentacoes = 'Não foi possível carregar o histórico de movimentações. Tente novamente.';
    }
    this.carregandoMovimentacoes = false;
    this.cdr.detectChanges();
  }

  async mudarPaginaMovimentacoes(page: number): Promise<void> {
    if (page < 0 || page * 20 >= this.totalMovimentacoesFinanceiras) return;
    this.paginaMovimentacoesFinanceiras = page;
    this.carregandoMovimentacoes = true;
    this.erroMovimentacoes = '';
    this.cdr.detectChanges();
    try {
      const result = await this.artistFinance.getMovements(page);
      this.movimentacoesFinanceiras = result.items;
      this.totalMovimentacoesFinanceiras = result.total;
    } catch {
      this.movimentacoesFinanceiras = [];
      this.erroMovimentacoes = 'Não foi possível carregar o histórico de movimentações. Tente novamente.';
    } finally {
      this.carregandoMovimentacoes = false;
      this.cdr.detectChanges();
    }
  }

  selecionarSecao(secao: SecaoArtista): void {
    this.secaoAtual = secao;
    this.menuAberto = false;
    if (secao === 'privacidade' || secao === 'opcoes-comissao') this.privacidade = this.artistData.obterPrivacidade(this.perfil.nomeUsuario);
    if (secao === 'vendas') void this.carregarVendasArtista();
    if (secao === 'dashboard') void this.carregarDashboardFinanceiro();
  }

  async aceitar(comissao: Comissao): Promise<void> {
    const valor = this.valoresProposta[comissao.id]
      ?? comissao.propostaValor
      ?? comissao.valor;

    const prazo = this.prazosProposta[comissao.id]
      ?? comissao.propostaPrazo
      ?? comissao.prazo;

    await this.artistData.enviarProposta(
      comissao.id,
      Number(valor),
      prazo
    );
    this.cdr.detectChanges();
  }
  recusar(comissao: Comissao): void {
    if (window.confirm(`Recusar a solicitação “${comissao.titulo}” de ${comissao.cliente.nome}?`)) {
      void this.artistData.atualizarStatus(comissao.id, 'Recusada').then(() => this.cdr.detectChanges());
    }
  }
  iniciar(comissao: Comissao): void {
    void this.artistData.atualizarStatus(comissao.id, 'Em andamento').then(() => this.cdr.detectChanges());
  }
  abrirDetalhesComissao(comissao: Comissao): void {
    this.comissaoSelecionada = comissao;
    this.cdr.detectChanges();
  }
  iniciarComissaoSelecionada(): void {
    if (!this.comissaoSelecionada || this.comissaoSelecionada.pagamentoStatus !== 'pago') return;
    this.iniciar(this.comissaoSelecionada);
    this.comissaoSelecionada = this.artistData.obterComissao(this.comissaoSelecionada.id) ?? null;
    this.cdr.detectChanges();
  }
  enviarComissaoSelecionada(): void {
    if (
      !this.comissaoSelecionada ||
      this.comissaoSelecionada.status === 'Entregue' ||
      (this.comissaoSelecionada.pagamentoStatus !== 'pago' &&
        this.comissaoSelecionada.status !== 'Em andamento')
    ) {
      return;
    }
    const comissao = this.comissaoSelecionada;
    this.comissaoSelecionada = null;
    this.abrirEntrega(comissao);
    this.cdr.detectChanges();
  }
  finalizar(comissao: Comissao): void {
    void this.artistData.atualizarStatus(comissao.id, 'Finalizada').then(() => this.cdr.detectChanges());
  }

  abrirEntrega(comissao: Comissao, abrirSeletorArquivos = false): void {
    this.limparPreviewEntrega();
    this.entregaAtual = comissao;
    this.arquivoSelecionado = null;
    this.previewEntrega = '';
    this.observacaoEntrega = '';
    this.erroEntrega = '';
    this.sucessoEntrega = false;
    this.cdr.detectChanges();

    if (abrirSeletorArquivos) {
      setTimeout(() => {
        const input = this.inputArquivosComissao?.nativeElement;
        if (input) {
          input.value = '';
          input.click();
        }
      }, 0);
    }
  }

  acionarSeletorArquivosEntrega(): void {
    const input = this.inputArquivosComissao?.nativeElement;
    if (input) {
      input.value = '';
      input.click();
    }
  }

  cancelarEntrega(): void {
    if (this.enviandoEntrega) return;
    this.entregaAtual = null;
    this.arquivoSelecionado = null;
    this.observacaoEntrega = '';
    this.erroEntrega = '';
    this.sucessoEntrega = false;
    this.limparPreviewEntrega();
    this.cdr.detectChanges();
  }

  private limparPreviewEntrega(): void {
    if (this.previewEntrega.startsWith('blob:')) URL.revokeObjectURL(this.previewEntrega);
    this.previewEntrega = '';
  }

  selecionarArquivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    const formatosPermitidos = ['image/png', 'image/jpeg', 'image/webp'];
    if (!formatosPermitidos.includes(arquivo.type.toLowerCase())) {
      this.erroEntrega = 'Selecione uma imagem PNG, JPG ou WEBP.';
      input.value = '';
      this.cdr.detectChanges();
      return;
    }
    if (arquivo.size <= 0 || arquivo.size > 10 * 1024 * 1024) {
      this.erroEntrega = 'A imagem deve ter até 10 MB e não pode estar vazia.';
      input.value = '';
      this.cdr.detectChanges();
      return;
    }

    this.limparPreviewEntrega();
    this.arquivoSelecionado = arquivo;
    this.previewEntrega = URL.createObjectURL(arquivo);
    this.erroEntrega = '';
    this.cdr.detectChanges();
  }

  async enviarEntrega(): Promise<void> {
    if (this.enviandoEntrega || this.sucessoEntrega || !this.entregaAtual) return;
    if (!this.arquivoSelecionado) {
      this.erroEntrega = 'Selecione a imagem final da comissão antes de confirmar.';
      return;
    }
    const pedidoId = this.entregaAtual.id;
    const arquivo = this.arquivoSelecionado;
    this.enviandoEntrega = true;
    this.erroEntrega = '';
    this.cdr.detectChanges();
    try {
      await this.artistData.registrarEntrega(
        pedidoId,
        arquivo,
        this.observacaoEntrega.trim(),
      );
      this.sucessoEntrega = true;
    } catch (error) {
      this.erroEntrega = error instanceof Error
        ? error.message
        : 'Não foi possível enviar a comissão. Verifique a conexão e tente novamente.';
    } finally {
      this.enviandoEntrega = false;
      this.cdr.detectChanges();
    }
  }

  abrirCriacaoArte(): void { this.modal.openModal('postModal'); }
  iniciarEdicaoArte(arte: Post): void {
    this.editandoArte = { ...arte, categoria: { ...arte.categoria }, usuario: { ...arte.usuario }, tags: arte.tags ? [...arte.tags] : undefined };
    this.previewEdicaoArte = arte.portfolio;
    this.erroEdicaoArte = '';
    this.cdr.detectChanges();
  }

  selecionarImagemEdicao(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo || !this.editandoArte) return;
    if (!arquivo.type.startsWith('image/') || arquivo.size > 5 * 1024 * 1024) {
      this.erroEdicaoArte = 'Escolha uma imagem de até 5 MB.';
      this.cdr.detectChanges();
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => {
      const imagem = typeof leitor.result === 'string' ? leitor.result : '';
      if (!imagem) { this.erroEdicaoArte = 'Não foi possível carregar a imagem.'; this.cdr.detectChanges(); return; }
      this.editandoArte = { ...this.editandoArte!, portfolio: imagem };
      this.previewEdicaoArte = imagem;
      this.erroEdicaoArte = '';
      this.cdr.detectChanges();
    };
    leitor.onerror = () => {
      this.erroEdicaoArte = 'Não foi possível ler a imagem. Tente outro arquivo.';
      this.cdr.detectChanges();
    };
    leitor.readAsDataURL(arquivo);
  }

  salvarArte(): void {
    if (!this.editandoArte) return;
    const titulo = this.editandoArte.titulo.trim();
    const categoria = this.editandoArte.categoria.nomeCategoria.trim();
    const preco = Number(this.editandoArte.preco);
    if (!titulo || !categoria || !Number.isFinite(preco) || preco < 0) {
      this.erroEdicaoArte = 'Informe título, categoria e um preço válido.';
      return;
    }
    const arteAtualizada: Post = { ...this.editandoArte, titulo, descricao: this.editandoArte.descricao.trim(), preco, categoria: { ...this.editandoArte.categoria, nomeCategoria: categoria }, usuario: { ...this.editandoArte.usuario } };
    this.pinService.atualizarArte(arteAtualizada);
    this.artes = this.artes.map((item) => item.id === arteAtualizada.id ? arteAtualizada : item);
    this.artesAtualizadas.emit(this.artes);
    this.editandoArte = null;
    this.previewEdicaoArte = '';
    this.erroEdicaoArte = '';
  }
  async excluirArte(arte: Post): Promise<void> {
    if (!window.confirm(`Excluir “${arte.titulo}” do portfólio?`)) return;

    const excluida = await this.pinService.excluirArte(arte.id);

    if (!excluida) {
      this.erroEdicaoArte = 'Não foi possível excluir a obra no momento.';
      return;
    }

    this.artes = this.artes.filter((item) => item.id !== arte.id);
    this.artesAtualizadas.emit(this.artes);
  }

  salvarPrivacidade(): void { this.artistData.salvarPrivacidade(this.perfil.nomeUsuario, this.privacidade); }
  alterarUsername(): void {
    const anterior = this.perfil.nomeUsuario;
    const novo = this.usernameNovo.trim().replace(/^@/, '');
    if (!this.perfilService.nomeUsuarioDisponivel(novo, anterior)) {
      this.mensagemSeguranca = 'Username inválido ou já utilizado.';
      return;
    }
    this.auth.atualizarUsername(novo).then((ok) => {
      if (!ok) {
        this.mensagemSeguranca = 'Não foi possível atualizar o username.';
        return;
      }
      this.perfilService.atualizarPerfil(anterior, { nomeUsuario: novo });
      this.artistData.renomearArtista(anterior, novo);
      this.perfil = { ...this.perfil, nomeUsuario: novo };
      this.usernameNovo = '';
      this.mensagemSeguranca = 'Username atualizado.';
      this.perfilAtualizado.emit(this.perfil);
    });
  }
  alterarEmail(): void {
    this.auth.atualizarEmail(this.emailNovo).then((ok) => {
      this.mensagemSeguranca = ok ? 'E-mail atualizado.' : 'Informe um e-mail válido.';
      if (ok) this.emailNovo = '';
    });
  }
  async alterarSenha(): Promise<void> {
    if (this.senhaNova !== this.senhaConfirmacao || this.senhaNova.length < 6) { this.mensagemSeguranca = 'Confira a confirmação e use ao menos 6 caracteres.'; return; }
    const ok = await this.auth.atualizarSenha(this.senhaNova);
    this.mensagemSeguranca = ok ? 'Senha atualizada.' : 'Não foi possível atualizar a senha.';
    if (ok) this.senhaAtual = this.senhaNova = this.senhaConfirmacao = '';
  }
  sair(): void { this.auth.logout(); void this.router.navigate(['/']); }
  acessarPerfil(): void { void this.router.navigate(['/perfil', this.perfil.nomeUsuario]); }
  statusDaObra(preco: number): string { return preco > 0 ? 'À venda' : 'No portfólio'; }
  abrirPin(arte: Post): void { this.modal.selecionarPost(arte); this.modal.openModal('pinModal'); }
}
