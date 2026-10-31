import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth.service';
import { ArtistAreaService } from '../../../../services/artist-area.service';
import { PerfilService } from '../../../../services/perfil.service';
import { ModalService } from '../../../../services/modal.service';
import { PinService } from '../../../../services/pinService';
import { AvaliacaoArtista, Comissao, DiretrizComissao, OpcaoComissao, PrivacidadeArtista, StatusComissao } from '../../../models/artist-area';
import { PerfilView } from '../../../models/perfil';
import { Post } from '../../../models/post';
import { Portfolio } from '../../../components/profile/portfolio/portfolio';
import { ArtistDashboard } from '../artist-dashboard/artist-dashboard';
import { criarDadosDashboard } from '../artist-dashboard/artist-dashboard.models';
import { PinCard } from '../../../components/pin-card/pin-card';
import { PinCardModal } from '../../../components/pin-card-modal/pin-card-modal';
import { CommissionDetailModal } from '../../../components/commission-detail-modal/commission-detail-modal';
import { DeleteAccountCard } from '../../../components/profile/delete-account-card/delete-account-card';

type SecaoArtista = 'dashboard' | 'solicitacoes' | 'comissoes' | 'opcoes-comissao' | 'historico' | 'artes' | 'adicionar' | 'portfolio' | 'avaliacoes' | 'privacidade' | 'seguranca';

@Component({
  selector: 'app-artist-area',
  standalone: true,
  imports: [ArtistDashboard, CommonModule, FormsModule, RouterLink, Portfolio, PinCard, PinCardModal, CommissionDetailModal, DeleteAccountCard],
  templateUrl: './artist-area.html',
  styleUrl: './artist-area.css',
})
export class ArtistArea {
  @Input({ required: true }) perfil!: PerfilView;
  @Input() artes: Post[] = [];
  @Output() perfilAtualizado = new EventEmitter<PerfilView>();
  @Output() artesAtualizadas = new EventEmitter<Post[]>();

  secaoAtual: SecaoArtista = 'dashboard';
  filtroComissao: 'Todas' | StatusComissao = 'Todas';
  editandoArte: Post | null = null;
  previewEdicaoArte = '';
  erroEdicaoArte = '';
  menuAberto = false;
  arquivoSelecionado: File | null = null;
  previewEntrega = '';
  erroEntrega = '';
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
    { grupo: 'COMISSÕES', itens: [{ id: 'solicitacoes', titulo: 'Solicitações' }, { id: 'comissoes', titulo: 'Minhas Comissões' }, { id: 'opcoes-comissao', titulo: 'Opções e diretrizes' }, { id: 'historico', titulo: 'Histórico' }] },
    { grupo: 'CONTEÚDO', itens: [{ id: 'artes', titulo: 'Minhas Artes' }, { id: 'adicionar', titulo: 'Adicionar Arte' }, { id: 'portfolio', titulo: 'Portfólio' }] },
    { grupo: 'AVALIAÇÕES', itens: [{ id: 'avaliacoes', titulo: 'Avaliações' }] },
    { grupo: 'CONTA', itens: [{ id: 'privacidade', titulo: 'Privacidade' }, { id: 'seguranca', titulo: 'Segurança' }] },
  ];

  constructor(
    public artistData: ArtistAreaService,
    private perfilService: PerfilService,
    private pinService: PinService,
    private auth: AuthService,
    private router: Router,
    private modal: ModalService,
  ) {}

  get comissoes(): Comissao[] { return this.artistData.listarComissoes(this.perfil.nomeUsuario); }
  get opcoesComissao(): OpcaoComissao[] { return this.artistData.listarOpcoesComissao(this.perfil.nomeUsuario, true); }
  get diretrizesComissao(): DiretrizComissao[] { return this.artistData.listarDiretrizes(this.perfil.nomeUsuario); }
  get statusTopo() { return this.dashboardData.comissoesPorStatus.filter((item) => ['Solicitada', 'Aguardando aprovação do cliente', 'Pendente', 'Em andamento', 'Entregue', 'Finalizada'].includes(item.status)); }
  get avaliacoes(): AvaliacaoArtista[] { return this.artistData.listarAvaliacoes(this.perfil.nomeUsuario); }
  get comissoesVisiveis(): Comissao[] {
    const relevantes = this.secaoAtual === 'solicitacoes'
      ? this.comissoes.filter((item) => item.status === 'Solicitada')
      : this.secaoAtual === 'historico'
        ? this.comissoes.filter((item) => ['Finalizada', 'Cancelada', 'Recusada'].includes(item.status))
        : this.comissoes.filter((item) => ['Aguardando aprovação do cliente', 'Pendente', 'Em andamento', 'Entregue'].includes(item.status));
    return this.filtroComissao === 'Todas' ? relevantes : relevantes.filter((item) => item.status === this.filtroComissao);
  }
  get avaliacaoMedia(): number {
    return this.avaliacoes.length ? this.avaliacoes.reduce((total, item) => total + item.nota, 0) / this.avaliacoes.length : 0;
  }
  get atividades(): Comissao[] { return [...this.comissoes].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)).slice(0, 5); }
  get dashboardData() { return criarDadosDashboard(this.comissoes); }

  opcaoEditando: OpcaoComissao | null = null;
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

  selecionarSecao(secao: SecaoArtista): void {
    this.secaoAtual = secao;
    this.menuAberto = false;
    if (secao === 'privacidade' || secao === 'opcoes-comissao') this.privacidade = this.artistData.obterPrivacidade(this.perfil.nomeUsuario);
  }

  aceitar(comissao: Comissao): void {
    this.artistData.enviarProposta(comissao.id, Number(comissao.propostaValor ?? comissao.valor), comissao.propostaPrazo ?? comissao.prazo);
  }
  recusar(comissao: Comissao): void {
    if (window.confirm(`Recusar a solicitação “${comissao.titulo}” de ${comissao.cliente.nome}?`)) this.artistData.atualizarStatus(comissao.id, 'Recusada');
  }
  iniciar(comissao: Comissao): void { this.artistData.atualizarStatus(comissao.id, 'Em andamento'); }
  abrirDetalhesComissao(comissao: Comissao): void { this.comissaoSelecionada = comissao; }
  iniciarComissaoSelecionada(): void {
    if (!this.comissaoSelecionada || this.comissaoSelecionada.pagamentoStatus !== 'pago') return;
    this.iniciar(this.comissaoSelecionada);
    this.comissaoSelecionada = this.artistData.obterComissao(this.comissaoSelecionada.id) ?? null;
  }
  enviarComissaoSelecionada(): void {
    if (!this.comissaoSelecionada || this.comissaoSelecionada.pagamentoStatus !== 'pago') return;
    const comissao = this.comissaoSelecionada;
    this.comissaoSelecionada = null;
    this.abrirEntrega(comissao);
  }
  finalizar(comissao: Comissao): void { this.artistData.atualizarStatus(comissao.id, 'Finalizada'); }

  abrirEntrega(comissao: Comissao): void {
    this.entregaAtual = comissao;
    this.arquivoSelecionado = null;
    this.previewEntrega = '';
    this.observacaoEntrega = '';
    this.erroEntrega = '';
  }
  selecionarArquivo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      this.arquivoSelecionado = null;
      this.previewEntrega = '';
      this.erroEntrega = 'Escolha uma imagem de até 5 MB para a entrega.';
      return;
    }
    this.arquivoSelecionado = file;
    this.erroEntrega = '';
    const reader = new FileReader();
    reader.onload = () => this.previewEntrega = typeof reader.result === 'string' ? reader.result : '';
    reader.onerror = () => this.erroEntrega = 'Não foi possível ler essa imagem. Tente outro arquivo.';
    reader.readAsDataURL(file);
  }
  enviarEntrega(): void {
    if (!this.entregaAtual || !this.arquivoSelecionado || !this.previewEntrega.startsWith('data:image')) return;
    this.artistData.registrarEntrega(this.entregaAtual.id, this.previewEntrega, this.observacaoEntrega.trim());
    this.entregaAtual = null;
  }

  abrirCriacaoArte(): void { this.modal.openModal('postModal'); }
  iniciarEdicaoArte(arte: Post): void {
    this.editandoArte = { ...arte, categoria: { ...arte.categoria }, usuario: { ...arte.usuario }, tags: arte.tags ? [...arte.tags] : undefined };
    this.previewEdicaoArte = arte.portfolio;
    this.erroEdicaoArte = '';
  }

  selecionarImagemEdicao(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo || !this.editandoArte) return;
    if (!arquivo.type.startsWith('image/') || arquivo.size > 5 * 1024 * 1024) {
      this.erroEdicaoArte = 'Escolha uma imagem de até 5 MB.';
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => {
      const imagem = typeof leitor.result === 'string' ? leitor.result : '';
      if (!imagem) { this.erroEdicaoArte = 'Não foi possível carregar a imagem.'; return; }
      this.editandoArte = { ...this.editandoArte!, portfolio: imagem };
      this.previewEdicaoArte = imagem;
      this.erroEdicaoArte = '';
    };
    leitor.onerror = () => this.erroEdicaoArte = 'Não foi possível ler a imagem. Tente outro arquivo.';
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
      window.alert('Não foi possível excluir a obra. Verifique o console para mais detalhes.');
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
