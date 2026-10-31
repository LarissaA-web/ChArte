import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-card-sm',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './card-sm.html',
  styleUrl: './card-sm.css',
})
export class CardSm {
  @Input() imagem!: string;
  @Input() estilo!: string;
  @Input() link!: string;
}
