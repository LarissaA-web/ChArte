import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ModalService } from '../../../services/modal.service';
import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Post } from '../../models/post';
import { CarrinhoService } from '../../../services/buy.service';
import { Router, RouterLink } from '@angular/router';
import { ArtistAreaService } from '../../../services/artist-area.service';
import { AuthService } from '../../../services/auth.service';
import { FollowersService, FollowSummary } from '../../../services/followers.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pin-card-modal',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, RouterLink],
  templateUrl: './pin-card-modal.html',
  styleUrl: './pin-card-modal.css',
})
export class PinCardModal implements OnInit, OnDestroy {
  post: Post | null = null;
  comprando = false;
  feedbackCompra = '';
  erroCompra = false;
  resumoSeguidor: FollowSummary | null = null;
  carregandoSeguir = false;

  private subscriptions = new Subscription();

  constructor(
    public modal: ModalService,
    public carrinho: CarrinhoService,
    private artistArea: ArtistAreaService,
    private auth: AuthService,
    private followers: FollowersService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.modal.postSelecionado$.subscribe((post) => {
        this.post = post;
        this.feedbackCompra = '';
        this.erroCompra = false;
        this.comprando = false;
        const username = post?.usuario?.nomeUsuario || post?.nomeArtistico;
        if (username) {
          void this.carregarSeguidoresArtista(username);
        } else {
          this.resumoSeguidor = null;
        }
        this.cdr.detectChanges();
      }),
    );

    this.subscriptions.add(
      this.followers.summaries$.subscribe((map) => {
        const username = this.usernameArtista;
        if (username && map[username.toLowerCase()]) {
          this.resumoSeguidor = map[username.toLowerCase()];
          this.cdr.detectChanges();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get usernameArtista(): string {
    return (this.post?.usuario?.nomeUsuario || this.post?.nomeArtistico || '').trim();
  }

  get ehProprioArtista(): boolean {
    const logado = this.auth.getUsuarioLogado();
    if (!logado || !this.usernameArtista) return false;
    return (
      logado.nomeUsuario.toLowerCase() === this.usernameArtista.toLowerCase() ||
      (logado.nomeArtistico || '').toLowerCase() === this.usernameArtista.toLowerCase()
    );
  }

  get jaNoCarrinho(): boolean {
    return this.post ? this.carrinho.contem(this.post.id) : false;
  }

  openPin(): void {
    this.modal.openModal('pinModal');
  }

  abrirChatDoArtista(): void {
    const artista = this.post?.usuario;
    this.modal.openChat(artista?.nomeUsuario, artista?.id);
  }

  adicionarAoCarrinho(): void {
    if (!this.post) return;
    if (!this.modal.exigirLogin()) return;

    if (this.carrinho.contem(this.post.id)) {
      this.modal.closeModal();
      void this.router.navigate(['/carrinho'], { queryParams: { aba: 'carrinho' } });
      return;
    }

    this.carrinho.adicionar(this.post);
    this.erroCompra = false;
    this.feedbackCompra = 'Obra adicionada ao seu carrinho!';
    this.cdr.detectChanges();
  }

  async comprarAgora(): Promise<void> {
    if (!this.post || this.comprando) return;
    if (!this.modal.exigirLogin()) return;

    const usuario = this.auth.getUsuarioLogado();
    if (!usuario) return;

    this.comprando = true;
    this.erroCompra = false;
    this.feedbackCompra = '';
    this.cdr.detectChanges();

    try {
      const pedido = await this.artistArea.criarPedidoDeArte(this.post, usuario.nomeUsuario);
      if (!pedido) {
        this.erroCompra = true;
        this.feedbackCompra = 'Não foi possível iniciar a compra desta obra.';
        return;
      }
      this.carrinho.remover(this.post.id);
      this.modal.closeModal();
      await this.router.navigate(['/checkout', pedido.id]);
    } catch {
      this.erroCompra = true;
      this.feedbackCompra = 'Ocorreu um erro ao iniciar a contratação.';
    } finally {
      this.comprando = false;
      this.cdr.detectChanges();
    }
  }

  async alternarSeguirArtista(): Promise<void> {
    if (!this.usernameArtista || this.carregandoSeguir) return;
    if (!this.modal.exigirLogin()) return;

    this.carregandoSeguir = true;
    this.cdr.detectChanges();
    try {
      this.resumoSeguidor = await this.followers.alternarSeguir(this.usernameArtista);
    } catch (err: any) {
      this.erroCompra = true;
      this.feedbackCompra = err?.message || 'Não foi possível atualizar seguimento.';
    } finally {
      this.carregandoSeguir = false;
      this.cdr.detectChanges();
    }
  }

  private async carregarSeguidoresArtista(username: string): Promise<void> {
    try {
      this.resumoSeguidor = await this.followers.obterResumo(username);
    } catch {
      this.resumoSeguidor = null;
    } finally {
      this.cdr.detectChanges();
    }
  }
}
