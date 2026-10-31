import { Component, Output, EventEmitter, Input } from '@angular/core';
import { ModalService } from '../../../services/modal.service';
import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Post } from '../../models/post';
import { CarrinhoService } from '../../../services/buy.service';
import { PinCard } from '../pin-card/pin-card';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-pin-card-modal',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, RouterLink],
  templateUrl: './pin-card-modal.html',
  styleUrl: './pin-card-modal.css',
})
export class PinCardModal {
  /**/
  /*@Input() post: Post | null = null;*/
  post: Post | null = null;

  ngOnInit() {
    this.modal.postSelecionado$.subscribe((post) => {
      console.log('POST NO MODAL:', post);
      this.post = post;
    });
  }

  constructor(
    public modal: ModalService,
    private carrinho: CarrinhoService,
  ) {}

  /*
  ngOnInit() {
    this.modal.postSelecionado$.subscribe((post) => {
      if (post) {
        this.post = post;
      }
    });
  }
    */

  openPin() {
    this.modal.openModal('pinModal');
  }

  abrirChatDoArtista(): void {
    const artista = this.post?.usuario;
    this.modal.openChat(artista?.nomeUsuario, artista?.id);
  }
  /*
  adicionarCarrinho() {
    this.carrinho.adicionar(this.Post);
  }
    */

  /*
  ngOnInit() {
    this.pinService.buscarTodos().subscribe((posts) => {
      this.artes = posts;
    });*/
}
