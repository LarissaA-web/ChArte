import { Component, OnInit, OnDestroy } from '@angular/core';
import { Post } from '../../models/post';
import { PinCardModal } from '../../components/pin-card-modal/pin-card-modal';
import { PinCard } from '../../components/pin-card/pin-card';
import { PinService } from '../../../services/pinService';
import { SearchBar } from '../../components/search-bar/search-bar';
import { Sidebar } from '../../components/profile/sidebar/sidebar';
import { Banner } from '../../components/banner/banner';
import { SubMenu } from '../../components/sub-menu/sub-menu';
import { ArtistLoginModal } from '../../components/artist-login-modal/artist-login-modal';
import { ModalService } from '../../../services/modal.service';
import { Colecao } from '../../components/profile/colecao/colecao';
import { Comissoes } from '../../components/profile/comissoes/comissoes';
import { Portfolio } from '../../components/profile/portfolio/portfolio';
import { PerfilMenuComponent } from '../../components/profile/perfil-menu/perfil-menu';
import { PostButton } from '../../components/profile/post-button/post-button';
import { PostModal } from '../../components/post-modal/post-modal';
import { AsyncPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PerfilService } from '../../../services/perfil.service';
import { ArtistAreaService } from '../../../services/artist-area.service';
import { AuthService } from '../../../services/auth.service';
import { PerfilView } from '../../models/perfil';
import { Subscription } from 'rxjs';
import { EditProfileModal } from '../../components/profile/edit-profile-modal/edit-profile-modal';

@Component({
  selector: 'app-artist-profile',
  standalone: true,
  imports: [
    SearchBar,
    PinCard,
    PinCardModal,
    Sidebar,
    Banner,
    SubMenu,
    ArtistLoginModal,
    Colecao,
    Comissoes,
    Portfolio,
    PerfilMenuComponent,
    PostButton,
    PostModal,
    AsyncPipe,
    EditProfileModal,
  ],
  templateUrl: './artist-profile.html',
  styleUrl: './artist-profile.css',
})
export class ArtistProfile implements OnInit, OnDestroy {
  perfil: PerfilView | null = null;
  perfilNaoEncontrado = false;
  abaAtual = 'colecao';
  isOwner = false;
  artesArtista: Post[] = [];

  private subscriptions = new Subscription();

  constructor(
    public modalService: ModalService,
    private route: ActivatedRoute,
    private perfilService: PerfilService,
    private authService: AuthService,
    private pinService: PinService,
    private artistAreaService: ArtistAreaService,
  ) {}

  selecionarAba(aba: string): void {
    if (aba === 'artista' && !this.podeAcessarAreaArtista) return;
    if ((aba === 'portfolio' || aba === 'comissoes') && !this.perfilEhArtista) return;
    if (aba === 'configuracoes' && !this.podeConfigurarPerfilComum) return;
    this.abaAtual = aba;
  }

  get perfilEhArtista(): boolean { return this.perfil?.tipoUsuario === 'Artista'; }

  get podeConfigurarPerfilComum(): boolean {
    return this.isOwner && this.perfil?.tipoUsuario === 'Comum';
  }

  get podeAcessarAreaArtista(): boolean {
    const usuario = this.authService.getUsuarioLogado();
    return !!(
      this.isOwner &&
      this.perfil?.tipoUsuario === 'Artista' &&
      usuario?.tipoUsuario === 'Artista'
    );
  }

  get perfilPublico(): boolean {
    return !this.perfil || this.isOwner || this.artistAreaService.obterPrivacidade(this.perfil.nomeUsuario).perfilPublico;
  }
  get exibirInformacoesPublicas(): boolean {
    return !this.perfil || this.isOwner || this.artistAreaService.obterPrivacidade(this.perfil.nomeUsuario).exibirInformacoes;
  }
  get exibirRedesSociaisPublicas(): boolean {
    return !this.perfil || this.isOwner || this.artistAreaService.obterPrivacidade(this.perfil.nomeUsuario).exibirRedesSociais;
  }

  iniciarEdicaoPerfil(): void {
    if (!this.isOwner || !this.perfil) return;
    this.modalService.openModal('editProfile');
  }

  salvarImagemPerfil(evento: { campo: 'foto' | 'banner'; arquivo: File }): void {
    if (!this.isOwner || !this.perfil || !evento.arquivo.type.startsWith('image/') || evento.arquivo.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imagem = typeof reader.result === 'string' ? reader.result : '';
      if (!imagem || !this.perfil) return;
      const dados = evento.campo === 'foto' ? { fotoPerfil: imagem } : { banner: imagem };
      this.perfilService.atualizarPerfil(this.perfil.nomeUsuario, dados).then((ok) => {
        if (ok && this.perfil) {
          this.perfil = { ...this.perfil, ...dados } as PerfilView;
          if (evento.campo === 'foto') this.authService.atualizarFotoPerfil(imagem);
        }
      });
    };
    reader.readAsDataURL(evento.arquivo);
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.paramMap.subscribe((params) => {
        let nomeUsuario = params.get('nomeUsuario');

        if (!nomeUsuario) {
          const usuarioLogado = this.authService.getUsuarioLogado();
          if (usuarioLogado) {
            nomeUsuario = usuarioLogado.nomeUsuario;
          }
        }

        if (nomeUsuario) {
          this.carregarPerfil(nomeUsuario);
        } else {
          this.perfil = null;
          this.perfilNaoEncontrado = true;
        }
      }),
    );

    this.subscriptions.add(
      this.authService.usuarioLogado$.subscribe(() => {
        this.verificarOwner();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  carregarPerfil(nomeUsuario: string): void {
    this.perfilService.getPerfil(nomeUsuario).subscribe((perfil) => {
      if (perfil) {
        this.perfil = perfil;
        this.abaAtual = 'colecao';
        this.perfilNaoEncontrado = false;
        this.pinService.getArtesPorArtista(perfil.nomeUsuario).subscribe(artes => this.artesArtista = artes);
        this.verificarOwner();
      } else {
        this.perfil = null;
        this.perfilNaoEncontrado = true;
        this.artesArtista = [];
        this.isOwner = false;
      }
    });
  }

  atualizarPerfilNaTela(perfil: PerfilView): void {
    this.perfil = perfil;
    this.verificarOwner();
  }

  atualizarArtes(): void {
    if (this.perfil) this.pinService.getArtesPorArtista(this.perfil.nomeUsuario).subscribe(artes => this.artesArtista = artes);
  }

  verificarOwner(): void {
    const usuarioLogado = this.authService.getUsuarioLogado();
    if (usuarioLogado && this.perfil) {
      this.isOwner =
        usuarioLogado.nomeUsuario.toLowerCase() === this.perfil.nomeUsuario.toLowerCase();
    } else {
      this.isOwner = false;
    }
  }

}
