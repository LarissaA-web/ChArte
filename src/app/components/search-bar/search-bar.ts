import { Component, Input } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';
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

  constructor(
    public auth: AuthService,
    public modal: ModalService,
    private router: Router,
  ) {}

  abrirCarrinho(): void {
    if (this.modal.exigirLogin()) void this.router.navigate(['/carrinho']);
  }
}
