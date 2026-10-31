import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerfilView } from '../../../models/perfil';
import { PerfilService } from '../../../../services/perfil.service';
import { ModalService } from '../../../../services/modal.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-edit-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-profile-modal.html',
  styleUrl: './edit-profile-modal.css',
})
export class EditProfileModal implements OnChanges, OnDestroy {
  @Input() perfil?: PerfilView;
  @Input() isOwner = false;
  @Output() perfilAtualizado = new EventEmitter<PerfilView>();

  nome = '';
  nomeArtistico = '';
  bio = '';
  fotoPerfil = '';
  banner = '';

  twitter = '';
  instagram = '';
  tiktok = '';
  youtube = '';
  erroImagem = '';
  private modalSubscription: Subscription;

  constructor(
    public modalService: ModalService,
    private perfilService: PerfilService,
  ) {
    this.modalSubscription = this.modalService.modalOpen$.subscribe((modal) => {
      if (modal === 'editProfile' && this.isOwner && this.perfil) {
        this.carregarDados();
        this.erroImagem = '';
      }
    });
  }

  ngOnDestroy(): void { this.modalSubscription.unsubscribe(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['perfil'] && this.perfil) {
      this.carregarDados();
    }
  }

  carregarDados(): void {
    if (!this.perfil) return;
    this.nome = this.perfil.nome || '';
    this.nomeArtistico = this.perfil.nomeArtistico || '';
    this.bio = this.perfil.bio || '';
    this.fotoPerfil = this.perfil.fotoPerfil || '';
    this.banner = this.perfil.banner || '';
    this.twitter = this.perfil.redesSociais?.twitter || '';
    this.instagram = this.perfil.redesSociais?.instagram || '';
    this.tiktok = this.perfil.redesSociais?.tiktok || '';
    this.youtube = this.perfil.redesSociais?.youtube || '';
  }

  fechar(): void {
    this.modalService.closeModal();
  }

  salvar(): void {
    if (!this.perfil || !this.isOwner) return;

    const dadosAtualizados: Partial<PerfilView> = {
      nome: this.nome.trim(),
      nomeArtistico: this.nomeArtistico.trim(),
      bio: this.bio.trim(),
      fotoPerfil: this.fotoPerfil.trim() || this.perfil.fotoPerfil,
      banner: this.banner.trim() || this.perfil.banner,
      redesSociais: {
        twitter: this.twitter.trim(),
        instagram: this.instagram.trim(),
        tiktok: this.tiktok.trim(),
        youtube: this.youtube.trim(),
      },
    };

    this.perfilService.atualizarPerfil(this.perfil.nomeUsuario, dadosAtualizados).then((sucesso) => {
      if (sucesso) {
        const perfilCompleto: PerfilView = {
          ...this.perfil!,
          ...dadosAtualizados,
          redesSociais: {
            ...this.perfil!.redesSociais,
            ...dadosAtualizados.redesSociais,
          },
        };
        this.perfilAtualizado.emit(perfilCompleto);
        this.fechar();
      }
    });
  }

  selecionarImagem(event: Event, campo: 'foto' | 'banner'): void {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) {
      this.erroImagem = 'Selecione um arquivo de imagem.';
      input.value = '';
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      this.erroImagem = 'A imagem deve ter no máximo 5 MB.';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imagem = typeof reader.result === 'string' ? reader.result : '';
      if (campo === 'foto') this.fotoPerfil = imagem;
      else this.banner = imagem;
      this.erroImagem = '';
    };
    reader.onerror = () => { this.erroImagem = 'Não foi possível carregar essa imagem.'; };
    reader.readAsDataURL(arquivo);
  }
}
