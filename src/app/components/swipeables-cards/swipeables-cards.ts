import { Component, OnInit } from '@angular/core';
import { Card } from '../card/card';
import { CardSm } from '../card-sm/card-sm';
import { PinService } from '../../../services/pinService';
import { CategoriaCatalogo, EstiloCatalogo } from '../../models/catalog-options';

@Component({
  selector: 'app-swipeables-cards',
  imports: [Card, CardSm],
  templateUrl: './swipeables-cards.html',
  styleUrl: './swipeables-cards.css',
})
export class SwipeablesCards implements OnInit {
  constructor(private readonly pinService: PinService) {}

  categorias: CategoriaCatalogo[] = [];
  estilos: EstiloCatalogo[] = [];
  erroCategorias = '';
  erroEstilos = '';

  private readonly imagensPorEstilo: Record<string, string> = {
    'Mangá': 'Manga_style.jpeg',
    'Cartoon': 'cartoon_style.jpeg',
    'Realista': 'realismo_style.jpeg',
    'Semi realista': 'semi-realismo_style.jpeg',
    'Chibi': 'chibi_style.jpeg',
    'Kawaii': 'kawaii_style.jpeg',
    'Cute': 'cute_style.jpeg',
    'Gótico': 'gotico_style.jpeg',
    'Dark': 'dark_style.jpeg',
    'Horror': 'horror_style.jpeg',
    'Gothic horror': 'horror-gothic_style.jpeg',
    'Fantasia': 'fantasy_style.jpeg',
    'Sci-fi': 'sci-fi_style.jpeg',
    'Furry': 'kemonomimi_style.jpeg',
    'Kemonomimi': 'kemonomimi_style.jpeg',
    'Moe': 'Moe_style.jpeg',
    'Y2K': 'Y2K_style.jpeg',
    'Pop art': 'pop-art_style.jpeg',
    'Noir': 'noir_style.jpeg',
    'Grunge': 'grunge_style.jpeg',
    'Punk': 'punk_style.jpeg',
  };
  ngOnInit(): void {
    this.pinService.obterCategorias().subscribe({
      next: categorias => this.categorias = categorias,
      error: erro => { console.error('Erro ao carregar categorias:', erro); this.erroCategorias = 'Não foi possível carregar as categorias.'; },
    });
    this.pinService.obterEstilos().subscribe({
      next: estilos => this.estilos = estilos,
      error: erro => { console.error('Erro ao carregar estilos:', erro); this.erroEstilos = 'Não foi possível carregar os estilos.'; },
    });
  }

  imagemDoEstilo(estilo: EstiloCatalogo): string {
    const imagem = this.imagensPorEstilo[estilo.nome_estilo];
    return imagem ? `/styles-icons/${imagem}` : '/gato.jpeg';
  }
}
