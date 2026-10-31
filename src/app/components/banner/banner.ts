import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PerfilView } from '../../models/perfil';

@Component({
  selector: 'app-banner',
  standalone: true,
  imports: [],
  templateUrl: './banner.html',
  styleUrl: './banner.css',
})
export class Banner {
  @Input() perfil!: PerfilView;
  @Input() isOwner = false;
  @Output() imagemSelecionada = new EventEmitter<{ campo: 'foto' | 'banner'; arquivo: File }>();

  selecionarImagem(event: Event, campo: 'foto' | 'banner'): void {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (arquivo) this.imagemSelecionada.emit({ campo, arquivo });
    input.value = '';
  }
}
