import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';
import { PaymentService } from '../services/payment.service';
import { FollowersService } from '../services/followers.service';
import { CarrinhoService } from '../services/buy.service';

describe('App & Core Services', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app and render router-outlet', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(app).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('should generate simulated PIX code in PaymentService', () => {
    const paymentService = TestBed.inject(PaymentService);
    const pixCode = paymentService.gerarCodigoPixSimulado(42, 'pay_12345678', 180.5);
    expect(pixCode).toContain('BR.GOV.BCB.PIX');
    expect(pixCode).toContain('CHARTE-SIM-42-12345678');
    expect(pixCode).toContain('180.50');
  });

  it('should manage cart items reactively in CarrinhoService', () => {
    const carrinho = TestBed.inject(CarrinhoService);
    carrinho.limpar();
    const post = {
      id: 999,
      titulo: 'Arte Teste',
      descricao: 'Descrição',
      imagem: 'assets/imagens/arte1.jpg',
      tags: ['Digital'],
      portfolio: 'Digital',
      nomeArtistico: 'Artista Teste',
      preco: 150,
      categoria: { id: 1, nomeCategoria: 'Digital' },
      usuario: {
        id: 1,
        artistaId: 1,
        nomeUsuario: 'artista_teste',
        nomeArtistico: 'Artista Teste',
        fotoPerfil: '',
      },
    };
    expect(carrinho.adicionar(post)).toBe(true);
    expect(carrinho.adicionar(post)).toBe(false); // Previne duplicata
    expect(carrinho.contem(999)).toBe(true);
    expect(carrinho.totalItens()).toBe(1);
    carrinho.remover(999);
    expect(carrinho.contem(999)).toBe(false);
  });

  it('should expose reactive summaries$ and prevent unauthenticated follow in FollowersService', async () => {
    const followers = TestBed.inject(FollowersService);
    expect(followers).toBeTruthy();
    expect(followers.getSnapshot('artista_teste')).toBeNull();
    await expect(followers.seguirArtista('artista_teste')).rejects.toThrow(
      'Faça login para seguir artistas.',
    );
  });
});
