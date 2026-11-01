import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';
import { PinService } from '../../../services/pinService';
import { RouterLink } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [RouterLink, AsyncPipe],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.css',
})
export class SearchBar {
  @Input() showSearchCard = false;
  @Output() pesquisaAlterada = new EventEmitter<string>();

  constructor(
    public auth: AuthService,
    public modal: ModalService,
    public pinService: PinService,
    private router: Router,
  ) {}

  get termoPesquisa(): string {
    return this.pinService.getTermoPesquisa();
  }

  aoPesquisar(event: Event): void {
    const valor = (event.target as HTMLInputElement | null)?.value ?? '';
    this.pinService.setTermoPesquisa(valor);
    this.pesquisaAlterada.emit(valor);
  }

  abrirCarrinho(): void {
    if (this.modal.exigirLogin()) void this.router.navigate(['/carrinho']);
  }
}
