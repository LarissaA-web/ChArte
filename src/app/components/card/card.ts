import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORIAS } from '../../models/catalog-options';
@Component({
  selector: 'app-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './card.html',
  styleUrl: './card.css',
})
export class Card {
  private readonly imagensCategoria = [
    '/IMG_3462.jpeg',
    '/IMG_3463.jpeg',
    '/IMG_3465.jpeg',
    '/IMG_3466.jpeg',
    '/IMG_3467.jpeg',
    '/IMG_3468.jpeg',
    '/IMG_3469.jpeg',
    '/IMG_3470.jpeg',
    '/IMG_3471.jpeg',
    '/IMG_3473.jpeg',
    '/IMG_3474.jpeg',
    '/IMG_3475.jpeg',
  ];

  @Input() titulo!: string;
  @Input() categoria!: string;

  get imagemCategoria(): string {
    const indice = CATEGORIAS.indexOf(this.categoria);
    return this.imagensCategoria[(indice < 0 ? 0 : indice) % this.imagensCategoria.length];
  }

  get abreviacao(): string {
    const palavras = (this.categoria || '').trim().split(/\s+/).filter(Boolean);
    if (palavras.length > 1) return palavras.map((palavra) => palavra[0]).join('').slice(0, 3).toLocaleUpperCase('pt-BR');
    return (palavras[0] || '').slice(0, 3).toLocaleUpperCase('pt-BR');
  }
}
