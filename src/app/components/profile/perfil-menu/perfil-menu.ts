import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-perfil-menu',
  standalone: true,
  templateUrl: './perfil-menu.html',
  styleUrl: './perfil-menu.css',
})
export class PerfilMenuComponent {
  @Input() mostrarAreaArtista: boolean = false;
  @Input() mostrarAbasArtista: boolean = true;
  @Input() mostrarConfiguracoes: boolean = false;
  @Input() abaAtiva: string = 'colecao';
  @Output() abaSelecionada = new EventEmitter<string>();

  constructor(private router: Router) {}

  selecionarAba(aba: string): void {
    if (aba === 'artista') {
      void this.router.navigate(['/artista']);
      this.abaSelecionada.emit(aba);
      return;
    }
    if (aba === 'configuracoes') {
      void this.router.navigate(['/configuracoes']);
      this.abaSelecionada.emit(aba);
      return;
    }
    this.abaAtiva = aba;
    this.abaSelecionada.emit(aba);
  }
}
