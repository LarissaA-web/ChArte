import { Component, Input, Output } from '@angular/core';
import { Post } from '../../models/post';
import { ModalService } from '../../../services/modal.service';
import { RouterLink } from '@angular/router';
import { PinService } from '../../../services/pinService';
import { FavoritesService } from '../../../services/favorites.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-pin-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './pin-card.html',
  styleUrl: './pin-card.css',
})
export class PinCard {
  @Input() post!: Post;
  @Input() apenasImagem: boolean = false;

  @Input() portfolio: string = '';
  @Input() titulo: string = '';
  @Input() nomeArtistico: string = '';
  @Input() fotoPerfil: string = '';

  constructor(
    public modal: ModalService,
    private pinService: PinService,
    public favorites: FavoritesService,
    private auth: AuthService,
  ) {}

  get imagemArte(): string { return this.resolverImagem(this.post?.portfolio, '/gato.jpeg'); }
  get fotoArtista(): string { return this.resolverImagem(this.post?.usuario?.fotoPerfil, '/gato.jpeg'); }
  get nomeArtista(): string { return this.post?.usuario?.nomeArtistico || this.post?.nomeArtistico || 'Artista'; }

  private resolverImagem(caminho: string | undefined, fallback: string): string {
    if (!caminho?.trim()) return fallback;
    if (caminho === 'assets/imagens/perfil.jpg' || caminho === '/assets/imagens/perfil.jpg') return fallback;
    if (/^(https?:|data:|blob:|\/)/i.test(caminho)) return caminho;
    return `/${caminho.replace(/^\.\//, '')}`;
  }

  abrirPinModal() {
    this.modal.selecionarPost(this.post);
    this.modal.openModal('pinModal');
  }

  alternarFavorito(event: Event): void {
    event.stopPropagation();
    if (!this.auth.estaLogado()) {
      this.modal.openModal('login');
      return;
    }
    this.favorites.alternar(this.post.id);
  }
}
