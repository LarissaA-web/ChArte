import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';
import { PerfilService } from '../../../services/perfil.service';
import { PinService } from '../../../services/pinService';
import { Post } from '../../models/post';
import { CATEGORIAS, ESTILOS } from '../../models/catalog-options';

@Component({
  selector: 'app-post-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './post-modal.html',
  styleUrl: './post-modal.css',
})
export class PostModal {
  @Output() artePublicada = new EventEmitter<Post>();
  titulo = '';
  descricao = '';
  categoria = '';
  estilo = '';
  compravel = false;
  preco: number | null = null;
  imagemSelecionada: File | null = null;
  previewImagem = '';
  erro = '';

  categorias = CATEGORIAS.map((nome) => ({ nome }));
  estilos = ESTILOS.map((nome) => ({ nome }));

  constructor(
    private modalService: ModalService,
    private authService: AuthService,
    private perfilService: PerfilService,
    private pinService: PinService,
  ) {}

  fecharModal(): void { this.modalService.closeModal(); }

  publicarPostagem(): void {
    const usuario = this.authService.getUsuarioLogado();
    if (!usuario || usuario.tipoUsuario !== 'Artista') { this.erro = 'Entre como artista para publicar uma obra.'; return; }
    if (!this.titulo.trim() || !this.imagemSelecionada || !this.categoria) { this.erro = 'Preencha o título, a imagem e a categoria.'; return; }
    if (this.compravel && (!this.preco || this.preco <= 0)) { this.erro = 'Informe um preço válido para a obra.'; return; }
    this.perfilService.getPerfil(usuario.nomeUsuario).subscribe(async (perfil) => {
      if (!perfil) { this.erro = 'Não foi possível localizar o perfil da artista.'; return; }
      const arte = await this.pinService.adicionarArte({
        titulo: this.titulo.trim(), descricao: this.descricao.trim(), portfolio: this.previewImagem || this.imagemSelecionada!.name,
        categoria: this.categorias.find((item) => item.nome.toLowerCase() === this.categoria.toLowerCase())?.nome || this.categoria,
        estilo: this.estilos.find((item) => item.nome.toLowerCase() === this.estilo.toLowerCase())?.nome || this.estilo,
        preco: this.compravel ? Number(this.preco) : 0,
      }, perfil);
      if (arte) {
        this.artePublicada.emit(arte);
        this.limparFormulario();
        this.modalService.closeModal();
      } else {
        this.erro = 'Erro ao publicar a obra. Tente novamente.';
      }
    });
  }

  selecionarImagem(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) { this.imagemSelecionada = file; this.previewImagem = URL.createObjectURL(file); this.erro = ''; }
  }

  removerImagem(): void { this.imagemSelecionada = null; this.previewImagem = ''; }

  private limparFormulario(): void {
    this.titulo = this.descricao = this.categoria = this.estilo = '';
    this.compravel = false; this.preco = null; this.removerImagem(); this.erro = '';
  }
}
