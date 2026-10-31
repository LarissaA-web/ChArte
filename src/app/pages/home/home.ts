import { Component, ChangeDetectorRef } from '@angular/core';
import { SearchBar } from '../../components/search-bar/search-bar';
import { Card } from '../../components/card/card';
import { CardSm } from '../../components/card-sm/card-sm';
import { SwipeablesCards } from '../../components/swipeables-cards/swipeables-cards';
import { PinCard } from '../../components/pin-card/pin-card';
import { Post } from '../../models/post';
import { SubMenu } from '../../components/sub-menu/sub-menu';
import { ArtistLoginModal } from '../../components/artist-login-modal/artist-login-modal';
import { PinCardModal } from '../../components/pin-card-modal/pin-card-modal';
import { PinService } from '../../../services/pinService';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    SearchBar,
    Card,
    CardSm,
    SwipeablesCards,
    PinCard,
    SubMenu,
    ArtistLoginModal,
    PinCardModal,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  artes: Post[] = [];
  postSelecionado!: Post;

  constructor(
  private pinService: PinService,
  private cdr: ChangeDetectorRef
) {
  this.pinService.getArtes().subscribe(artes => {
    this.artes = artes;
    console.log('ARTES RECEBIDAS PELA HOME:', this.artes);
    this.cdr.markForCheck();
  });
}
}
