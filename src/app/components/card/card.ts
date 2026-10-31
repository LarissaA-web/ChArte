import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './card.html',
  styleUrl: './card.css',
})
export class Card {
  @Input() titulo!: string;
  @Input() categoria!: string;

  get abreviacao(): string {
    const palavras = (this.categoria || '').trim().split(/\s+/).filter(Boolean);
    if (palavras.length > 1) return palavras.map((palavra) => palavra[0]).join('').slice(0, 3).toLocaleUpperCase('pt-BR');
    return (palavras[0] || '').slice(0, 3).toLocaleUpperCase('pt-BR');
  }
}
