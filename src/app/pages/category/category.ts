import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { SearchBar } from '../../components/search-bar/search-bar';
import { PinCard } from '../../components/pin-card/pin-card';
import { Post } from '../../models/post';
import { PinCardModal } from '../../components/pin-card-modal/pin-card-modal';
import { SubMenu } from '../../components/sub-menu/sub-menu';
import { ArtistLoginModal } from '../../components/artist-login-modal/artist-login-modal';
import { PinService } from '../../../services/pinService';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [SearchBar, PinCard, PinCardModal, ArtistLoginModal, SubMenu],
  templateUrl: './category.html',
  styleUrl: './category.css',
})
export class Category implements OnInit, OnDestroy {
  artes: Post[] = [];
  categoria = '';
  private routeSubscription?: Subscription;

  constructor(private route: ActivatedRoute, private pinService: PinService) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      this.categoria = params.get('categoria') ?? '';
      this.pinService.buscarPorCategoria(this.categoria).subscribe((pins) => this.artes = pins);
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }
}
