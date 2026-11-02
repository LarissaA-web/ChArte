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
export interface EventoDestaque {
  id: number;
  tag: string;
  data: string;
  titulo: string;
  descricao: string;
  imagem: string;
  acao: string;
  filtro: string;
}

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
  indiceEventoAtivo = 0;

  readonly eventosDestaque: EventoDestaque[] = [
    {
      id: 1,
      tag: 'EVENTO EM DESTAQUE',
      data: '15 a 30 Nov · Online',
      titulo: 'Semana ChArte de Ilustração & Comissões Abertas',
      descricao:
        'Descubra artistas independentes, encomende artes exclusivas com condições especiais e participe das lives criativas da comunidade.',
      imagem: '/frieren.jpeg',
      acao: 'Explorar obras em destaque',
      filtro: '',
    },
    {
      id: 2,
      tag: 'DESAFIO CRIATIVO',
      data: 'Inscrições Abertas',
      titulo: 'Festival Fantasia & Concept Art 2026',
      descricao:
        'Exposição coletiva de mundos fantásticos, criação de personagens e ilustrações autorais feitas pelos talentos do ChArte.',
      imagem: '/styles-icons/fantasy_style.jpeg',
      acao: 'Ver obras de Fantasia',
      filtro: 'Fantasia',
    },
    {
      id: 3,
      tag: 'MOSTRA DIGITAL',
      data: 'Edição Especial',
      titulo: 'Expo Estética Y2K, Pop Art & Mangá',
      descricao:
        'Uma curadoria vibrante celebrando cores intensas, traços expressivos e comissões personalizadas para colecionadores.',
      imagem: '/styles-icons/Y2K_style.jpeg',
      acao: 'Filtrar estética Y2K',
      filtro: 'Y2K',
    },
  ];

  constructor(
    private pinService: PinService,
    private cdr: ChangeDetectorRef
  ) {
    this.pinService.getArtes().subscribe(artes => {
      this.artes = artes;
      console.log('ARTES RECEBIDAS PELA HOME:', this.artes);
      this.cdr.detectChanges();
    });
  }

  get eventoAtivo(): EventoDestaque {
    return this.eventosDestaque[this.indiceEventoAtivo] ?? this.eventosDestaque[0];
  }

  selecionarEvento(indice: number): void {
    this.indiceEventoAtivo = indice;
    this.cdr.detectChanges();
  }

  explorarEvento(filtro: string): void {
    this.pinService.setTermoPesquisa(filtro);
    if (typeof document !== 'undefined') {
      document.querySelector('.pin_container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
