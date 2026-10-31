import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { SearchBar } from '../../components/search-bar/search-bar';
import { PinCard } from '../../components/pin-card/pin-card';
import { PinCardModal } from '../../components/pin-card-modal/pin-card-modal';
import { SubMenu } from '../../components/sub-menu/sub-menu';
import { ArtistLoginModal } from '../../components/artist-login-modal/artist-login-modal';
import { Post } from '../../models/post';
import { PinService } from '../../../services/pinService';

@Component({
  selector: 'app-styles',
  standalone: true,
  imports: [SearchBar, PinCard, PinCardModal, ArtistLoginModal, SubMenu],
  templateUrl: './styles.html',
  styleUrl: './styles.css',
})
export class Styles implements OnInit, OnDestroy {
  artes: Post[] = [];
  estilo = '';
  private routeSubscription?: Subscription;

  constructor(private route: ActivatedRoute, private pinService: PinService) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      this.estilo = params.get('estilo') ?? '';
      this.pinService.buscarPorEstilo(this.estilo).subscribe((pins) => this.artes = pins);
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }
}
