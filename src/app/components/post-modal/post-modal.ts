import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';
import { PerfilService } from '../../../services/perfil.service';
import { PinService } from '../../../services/pinService';
import { Post } from '../../models/post';
import { CategoriaCatalogo, EstiloCatalogo } from '../../models/catalog-options';

@Component({
  selector: 'app-post-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './post-modal.html',
  styleUrl: './post-modal.css',
})
export class PostModal implements OnInit {
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
  publicando = false;

  categorias: CategoriaCatalogo[] = [];
  estilos: EstiloCatalogo[] = [];
  carregandoCatalogos = true;
  erroCatalogo = '';
  private readonly subscriptions = new Subscription();

  constructor(
    private modalService: ModalService,
    private authService: AuthService,
    private perfilService: PerfilService,
    private pinService: PinService,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.pinService.obterCategorias().subscribe({
      next: categorias => { this.categorias = categorias; this.finalizarCarregamentoCatalogos(); },
      error: erro => { console.error('Erro ao carregar categorias:', erro); this.erroCatalogo = 'Não foi possível carregar as categorias. Tente novamente.'; this.finalizarCarregamentoCatalogos(); },
    }));
    this.subscriptions.add(this.pinService.obterEstilos().subscribe({
      next: estilos => { this.estilos = estilos; this.finalizarCarregamentoCatalogos(); },
      error: erro => { console.error('Erro ao carregar estilos:', erro); this.erroCatalogo = 'Não foi possível carregar os estilos. Tente novamente.'; this.finalizarCarregamentoCatalogos(); },
    }));
  }

  private catalogosPendentes = 2;
  private finalizarCarregamentoCatalogos(): void {
    this.catalogosPendentes -= 1;
    if (this.catalogosPendentes === 0) this.carregandoCatalogos = false;
  }

  fecharModal(): void { this.modalService.closeModal(); }

  async publicarPostagem(): Promise<void> {
    if (this.publicando) return;

    const usuario = this.authService.getUsuarioLogado();

    if (!usuario || usuario.tipoUsuario !== 'Artista') {
      this.erro = 'Entre como artista para publicar uma obra.';
      return;
    }

    if (!this.titulo.trim() || !this.imagemSelecionada || !this.categoria || !this.estilo) {
      this.erro = 'Preencha o título, a imagem, a categoria e o estilo.';
      return;
    }

    if (this.carregandoCatalogos || !this.categorias.length || !this.estilos.length) {
      this.erro = this.erroCatalogo || 'Categorias e estilos ainda não estão disponíveis.';
      return;
    }

    if (this.compravel && (!this.preco || this.preco <= 0)) {
      this.erro = 'Informe um preço válido para a obra.';
      return;
    }

    this.publicando = true;
    this.erro = '';

    try {
      const perfil = await new Promise<any>((resolve, reject) => {
        this.perfilService.getPerfil(usuario.nomeUsuario).subscribe({
          next: resolve,
          error: reject,
        });
      });

      if (!perfil) {
        this.erro = 'Não foi possível localizar o perfil da artista.';
        return;
      }

      const arquivo = this.imagemSelecionada;

      const arte = await this.pinService.adicionarArte({
        titulo: this.titulo.trim(),
        descricao: this.descricao.trim(),
        portfolio: '',
        arquivo,
        categoria: this.categorias.find(item => item.nome_categoria === this.categoria)?.nome_categoria ?? this.categoria,
        estilo: this.estilos.find(item => item.nome_estilo === this.estilo)?.nome_estilo ?? this.estilo,
        preco: this.compravel ? Number(this.preco) : 0,
      }, perfil);

      if (arte) {
        this.artePublicada.emit(arte);
        this.limparFormulario();
        this.modalService.closeModal();
      } else {
        this.erro = 'Erro ao publicar a obra. Confira sua conexão e tente novamente.';
      }
    } catch (erro) {
      console.error('Erro ao publicar obra:', erro);
      this.erro = 'Ocorreu um erro ao publicar a obra. Tente novamente.';
    } finally {
      this.publicando = false;
    }
  }

  selecionarImagem(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.erro = 'Selecione um arquivo de imagem válido.';
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.erro = 'A imagem deve ter no máximo 5 MB.';
      input.value = '';
      return;
    }

    if (this.previewImagem.startsWith('blob:')) {
      URL.revokeObjectURL(this.previewImagem);
    }

    this.imagemSelecionada = file;
    this.previewImagem = URL.createObjectURL(file);
    this.erro = '';
  }

  removerImagem(): void {
    if (this.previewImagem.startsWith('blob:')) {
      URL.revokeObjectURL(this.previewImagem);
    }

    this.imagemSelecionada = null;
    this.previewImagem = '';
  }

  private limparFormulario(): void {
    this.titulo = this.descricao = this.categoria = this.estilo = '';
    this.compravel = false; this.preco = null; this.removerImagem(); this.erro = '';
  }
}
