import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe, AsyncPipe } from '@angular/common';
import { SearchBar } from '../../components/search-bar/search-bar';
import { PinCardModal } from '../../components/pin-card-modal/pin-card-modal';
import { PinCard } from '../../components/pin-card/pin-card';
import { SubMenu } from '../../components/sub-menu/sub-menu';
import { ArtistLoginModal } from '../../components/artist-login-modal/artist-login-modal';
import { ModalService } from '../../../services/modal.service';
import { ArtistAreaService } from '../../../services/artist-area.service';
import { AuthService } from '../../../services/auth.service';
import { FavoritesService } from '../../../services/favorites.service';
import { CarrinhoService } from '../../../services/buy.service';
import { PinService } from '../../../services/pinService';
import { PaymentService, PaymentView } from '../../../services/payment.service';
import { FollowerProfile, FollowersService } from '../../../services/followers.service';
import { Observable, Subscription, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { Post } from '../../models/post';
import { Comissao } from '../../models/artist-area';

export type AbaCentralCliente = 'favoritos' | 'carrinho' | 'pedidos' | 'pagamentos' | 'seguindo';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [
    SearchBar,
    PinCard,
    PinCardModal,
    SubMenu,
    ArtistLoginModal,
    CurrencyPipe,
    DatePipe,
    RouterLink,
    AsyncPipe,
  ],
  templateUrl: './favorites-page.html',
  styleUrl: './favorites-page.css',
})
export class FavoritesPage implements OnInit, OnDestroy {
  aba: AbaCentralCliente = 'favoritos';
  username = '';
  artesFavoritas$!: Observable<Post[]>;
  itensCarrinho: Post[] = [];
  historicoPagamentos: PaymentView[] = [];
  artistasSeguidos: FollowerProfile[] = [];

  filtroStatusPagamento: 'TODOS' | 'APPROVED' | 'PENDING' | 'DECLINED' | 'REFUNDED' = 'TODOS';
  processandoCompraId: number | null = null;
  erroCarrinho = '';
  carregandoPagamentos = false;
  carregandoSeguindo = false;

  private subscriptions = new Subscription();

  constructor(
    public modal: ModalService,
    private route: ActivatedRoute,
    private router: Router,
    private artistData: ArtistAreaService,
    private auth: AuthService,
    public favorites: FavoritesService,
    public carrinho: CarrinhoService,
    private pinService: PinService,
    private paymentService: PaymentService,
    private followersService: FollowersService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.username = this.auth.getUsuarioLogado()?.nomeUsuario ?? '';
    this.artesFavoritas$ = this.favorites.listar();

    this.subscriptions.add(
      this.artistData.comissoes$.subscribe(() => {
        this.cdr.detectChanges();
      }),
    );

    this.subscriptions.add(
      combineLatest([this.carrinho.itens$, this.pinService.getArtes()])
        .pipe(
          map(([itens, todasArtes]) => {
            const mapa = new Map<number, Post>();
            todasArtes.forEach((a) => mapa.set(a.id, a));
            return itens
              .map((item) => item.post || mapa.get(item.id))
              .filter((p): p is Post => !!p && !!p.titulo);
          }),
        )
        .subscribe((posts) => {
          this.itensCarrinho = posts;
          this.cdr.detectChanges();
        }),
    );

    this.subscriptions.add(
      this.route.queryParamMap.subscribe((params) => {
        const paramAba = params.get('aba') as AbaCentralCliente | null;
        if (
          paramAba &&
          ['favoritos', 'carrinho', 'pedidos', 'pagamentos', 'seguindo'].includes(paramAba)
        ) {
          this.aba = paramAba;
        }
        if (this.aba === 'pagamentos') {
          void this.carregarPagamentos();
        } else if (this.aba === 'seguindo') {
          void this.carregarSeguindo();
        }
        this.cdr.detectChanges();
      }),
    );

    if (this.username) {
      void this.carregarPagamentos();
      void this.carregarSeguindo();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get pedidos(): Comissao[] {
    return this.username ? this.artistData.listarPedidosCliente(this.username) : [];
  }

  get totalCarrinho(): number {
    return this.itensCarrinho.reduce((acc, item) => acc + Number(item.preco || 0), 0);
  }

  get pagamentosFiltrados(): PaymentView[] {
    if (this.filtroStatusPagamento === 'TODOS') return this.historicoPagamentos;
    return this.historicoPagamentos.filter((tx) => {
      const st = String(tx.status || '').toUpperCase();
      if (this.filtroStatusPagamento === 'APPROVED') return st === 'APPROVED' || st === 'PAID';
      if (this.filtroStatusPagamento === 'DECLINED') {
        return st === 'DECLINED' || st === 'FAILED' || st === 'CANCELLED';
      }
      if (this.filtroStatusPagamento === 'PENDING') return st === 'PENDING' || st === 'PROCESSING';
      return st === this.filtroStatusPagamento;
    });
  }

  selecionarAba(aba: AbaCentralCliente): void {
    this.aba = aba;
    if (aba === 'pagamentos') {
      void this.carregarPagamentos();
    } else if (aba === 'seguindo') {
      void this.carregarSeguindo();
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba: aba === 'favoritos' ? null : aba },
      queryParamsHandling: 'merge',
    });
  }

  statusClasse(status: string): string {
    return status.toLowerCase().replaceAll(' ', '-');
  }

  statusPedido(pedido: Comissao): string {
    if (pedido.status === 'Entregue') {
      return 'Arte enviada · Aprovar entrega';
    }
    return pedido.status === 'Pendente' && pedido.pagamentoStatus === 'pendente'
      ? 'Aguardando pagamento'
      : pedido.status === 'Pendente' && pedido.pagamentoStatus === 'falhou'
        ? 'Pagamento recusado'
        : pedido.status;
  }

  abrirPin(arte: Post): void {
    this.modal.selecionarPost(arte);
    this.modal.openModal('pinModal');
  }

  removerDoCarrinho(postId: number): void {
    this.carrinho.remover(postId);
  }

  async finalizarCompraItem(arte: Post): Promise<void> {
    if (!this.username || this.processandoCompraId != null) return;
    this.processandoCompraId = arte.id;
    this.erroCarrinho = '';
    this.cdr.detectChanges();

    try {
      const pedido = await this.artistData.criarPedidoDeArte(arte, this.username);
      if (!pedido) {
        this.erroCarrinho = 'Não foi possível gerar o pedido para esta obra.';
        return;
      }
      this.carrinho.remover(arte.id);
      await this.router.navigate(['/checkout', pedido.id]);
    } catch {
      this.erroCarrinho = 'Erro ao iniciar o checkout para esta obra.';
    } finally {
      this.processandoCompraId = null;
      this.cdr.detectChanges();
    }
  }

  async deixarDeSeguir(usernameArtista: string): Promise<void> {
    try {
      await this.followersService.deixarDeSeguirArtista(usernameArtista);
      this.artistasSeguidos = this.artistasSeguidos.filter(
        (a) => a.username.toLowerCase() !== usernameArtista.toLowerCase(),
      );
      this.cdr.detectChanges();
    } catch {
      // ignora erro
    }
  }

  traduzirStatusGateway(status: string): string {
    switch (String(status || '').toUpperCase()) {
      case 'APPROVED':
      case 'PAID':
        return 'Aprovado';
      case 'DECLINED':
      case 'FAILED':
        return 'Recusado';
      case 'CANCELLED':
        return 'Cancelado';
      case 'REFUNDED':
        return 'Reembolsado';
      case 'PROCESSING':
        return 'Processando';
      default:
        return 'Pendente';
    }
  }

  private async carregarPagamentos(): Promise<void> {
    if (!this.username) return;
    this.carregandoPagamentos = true;
    this.cdr.detectChanges();
    try {
      this.historicoPagamentos = await this.paymentService.listarHistoricoCliente();
    } catch {
      this.historicoPagamentos = [];
    } finally {
      this.carregandoPagamentos = false;
      this.cdr.detectChanges();
    }
  }

  private async carregarSeguindo(): Promise<void> {
    if (!this.username) return;
    this.carregandoSeguindo = true;
    this.cdr.detectChanges();
    try {
      this.artistasSeguidos = await this.followersService.listarSeguindo(this.username);
    } catch {
      this.artistasSeguidos = [];
    } finally {
      this.carregandoSeguindo = false;
      this.cdr.detectChanges();
    }
  }
}
