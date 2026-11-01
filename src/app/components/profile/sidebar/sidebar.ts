import { ChangeDetectorRef, Component, Input, Output, EventEmitter, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PerfilView } from '../../../models/perfil';
import { ModalService } from '../../../../services/modal.service';
import {
  FollowerProfile,
  FollowersService,
  FollowSummary,
} from '../../../../services/followers.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements OnInit, OnChanges, OnDestroy {
  @Input() perfil!: PerfilView;
  @Input() isOwner = false;
  @Input() editandoPerfil = false;
  @Input() exibirInformacoes = true;
  @Input() exibirRedesSociais = true;
  @Output() editarPerfil = new EventEmitter<void>();
  @Output() abrirComissoes = new EventEmitter<void>();

  resumoSeguidores: FollowSummary | null = null;
  carregandoSeguir = false;
  erroSeguir = '';

  modalListaTipo: 'seguidores' | 'seguindo' | null = null;
  listaPerfis: FollowerProfile[] = [];
  carregandoLista = false;

  private subscriptions = new Subscription();

  constructor(
    public modal: ModalService,
    private followersService: FollowersService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.followersService.summaries$.subscribe((map) => {
        const username = this.perfil?.nomeUsuario?.trim().toLowerCase();
        if (username && map[username]) {
          this.resumoSeguidores = map[username];
          this.cdr.detectChanges();
        }
      }),
    );
    if (this.perfil?.nomeUsuario) {
      void this.carregarResumoSeguidores(this.perfil.nomeUsuario);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['perfil'] && this.perfil?.nomeUsuario) {
      void this.carregarResumoSeguidores(this.perfil.nomeUsuario);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get totalSeguidores(): number {
    return this.resumoSeguidores?.followersCount ?? this.perfil?.seguidores ?? 0;
  }

  get totalSeguindo(): number {
    return this.resumoSeguidores?.followingCount ?? this.perfil?.seguindo ?? 0;
  }

  get estaSeguindo(): boolean {
    return this.resumoSeguidores?.isFollowing ?? false;
  }

  abrirEditarPerfil(): void {
    if (this.isOwner) this.editarPerfil.emit();
  }

  solicitarComissao(): void {
    this.abrirComissoes.emit();
  }

  abrirChatComArtista(): void {
    if (!this.perfil) return;
    this.modal.openChat(this.perfil.nomeUsuario, this.perfil.idUsuario);
  }

  async alternarSeguir(): Promise<void> {
    if (!this.perfil?.nomeUsuario || this.isOwner || this.carregandoSeguir) return;
    if (!this.modal.exigirLogin()) return;

    this.carregandoSeguir = true;
    this.erroSeguir = '';
    this.cdr.detectChanges();
    try {
      this.resumoSeguidores = await this.followersService.alternarSeguir(this.perfil.nomeUsuario);
      this.perfil.seguidores = this.resumoSeguidores.followersCount;
      this.perfil.seguindo = this.resumoSeguidores.followingCount;
    } catch (err: any) {
      this.erroSeguir = err?.message || 'Não foi possível atualizar o seguimento.';
    } finally {
      this.carregandoSeguir = false;
      this.cdr.detectChanges();
    }
  }

  async abrirModalSeguidores(tipo: 'seguidores' | 'seguindo'): Promise<void> {
    if (!this.perfil?.nomeUsuario) return;
    this.modalListaTipo = tipo;
    this.carregandoLista = true;
    this.listaPerfis = [];
    this.cdr.detectChanges();
    try {
      this.listaPerfis =
        tipo === 'seguidores'
          ? await this.followersService.listarSeguidores(this.perfil.nomeUsuario)
          : await this.followersService.listarSeguindo(this.perfil.nomeUsuario);
    } catch {
      this.listaPerfis = [];
    } finally {
      this.carregandoLista = false;
      this.cdr.detectChanges();
    }
  }

  fecharModalSeguidores(): void {
    this.modalListaTipo = null;
    this.listaPerfis = [];
    this.cdr.detectChanges();
  }

  formatarUrlSocial(rede: 'twitter' | 'instagram' | 'tiktok' | 'youtube', valor?: string): string {
    const raw = (valor || '').trim();
    if (!raw) return '#';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    const handle = raw.replace(/^@/, '');
    switch (rede) {
      case 'twitter':
        return `https://x.com/${handle}`;
      case 'instagram':
        return `https://instagram.com/${handle}`;
      case 'tiktok':
        return `https://tiktok.com/@${handle}`;
      case 'youtube':
        return `https://youtube.com/@${handle}`;
    }
  }

  private async carregarResumoSeguidores(username: string): Promise<void> {
    try {
      this.resumoSeguidores = await this.followersService.obterResumo(username);
    } catch {
      this.resumoSeguidores = null;
    } finally {
      this.cdr.detectChanges();
    }
  }
}
