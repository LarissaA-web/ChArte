import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { ArtistArea } from './artist-area';

describe('ArtistArea', () => {
  let component: ArtistArea;
  let fixture: ComponentFixture<ArtistArea>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtistArea],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(ArtistArea);
    component = fixture.componentInstance;
    component.perfil = {
      idUsuario: '1',
      idArtista: 1,
      nome: 'Artista Teste',
      nomeUsuario: 'artista_teste',
      nomeArtistico: 'Artista Teste',
      tipoUsuario: 'Artista',
      fotoPerfil: 'assets/imagens/perfil.jpg',
      banner: 'assets/imagens/banner.jpg',
      bio: 'Bio de teste',
      seguidores: 0,
      seguindo: 0,
      avaliacaoMedia: 5,
      totalReviews: 1,
      redesSociais: {},
    };
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
