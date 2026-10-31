import { Component } from '@angular/core';
import { Card } from '../card/card';
import { CardSm } from '../card-sm/card-sm';
import { CATEGORIAS, ESTILOS } from '../../models/catalog-options';

@Component({
  selector: 'app-swipeables-cards',
  imports: [Card, CardSm],
  templateUrl: './swipeables-cards.html',
  styleUrl: './swipeables-cards.css',
})
export class SwipeablesCards {
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
  categorias = CATEGORIAS.map((nome) => ({ nome, categoria: nome }));
  estilos = ESTILOS.map((nome) => ({
    nome,
    imagem: this.imagensPorEstilo[nome]
      ? `/styles-icons/${this.imagensPorEstilo[nome]}`
      : '/gato.jpeg',
  }));
}
