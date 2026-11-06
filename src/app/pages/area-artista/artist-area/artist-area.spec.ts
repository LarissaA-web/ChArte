import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ArtistAreaService } from '../../../../services/artist-area.service';
import { ArtistFinanceService } from '../../../../services/artist-finance.service';

import { ArtistArea } from './artist-area';

describe('ArtistArea', () => {
  let component: ArtistArea;
  let fixture: ComponentFixture<ArtistArea>;
  const artistDataMock = {
    comissoes$: of([]),
    catalogo$: of({ opcoes: [], diretrizes: [] }),
    obterComissao: vi.fn(() => undefined),
    listarComissoes: vi.fn<() => any[]>(() => []),
    listarOpcoesComissao: vi.fn(() => []),
    listarDiretrizes: vi.fn(() => []),
    listarAvaliacoes: vi.fn(() => []),
    registrarEntrega: vi.fn().mockResolvedValue(true),
  };

  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtistArea],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ArtistAreaService, useValue: artistDataMock },
        { provide: ArtistFinanceService, useValue: {
          getSummary: vi.fn().mockResolvedValue(null),
          getMovements: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        } },
      ],
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

  it('abre o modal com o pedido e o cliente selecionados sem iniciar o envio', () => {
    const pedido = {
      id: 73,
      artistaUsername: 'artista_teste',
      titulo: 'Retrato de personagem',
      descricao: 'Retrato sob encomenda',
      referencias: [],
      valor: 80,
      criadaEm: '2026-01-01',
      prazo: '10 dias',
      status: 'Em andamento',
      pagamentoStatus: 'pago',
      opcaoTitulo: 'Retrato',
      tipoPedido: 'comissao',
      cliente: { nome: 'Cliente Real', username: 'cliente_real', foto: '' },
    } as any;
    const registrar = vi.spyOn(component.artistData, 'registrarEntrega');
    component.abrirEntrega(pedido);

    expect(fixture.nativeElement.querySelector('.delivery-dialog')?.textContent).toContain('Pedido #73');
    expect(fixture.nativeElement.querySelector('.delivery-dialog')?.textContent).toContain('Retrato de personagem');
    expect(fixture.nativeElement.querySelector('.delivery-dialog')?.textContent).toContain('Cliente Real (@cliente_real)');
    expect(registrar).not.toHaveBeenCalled();
  });

  it('cria uma pré-visualização local para uma imagem válida', () => {
    const nativeUrl = URL;
    const descriptor = Object.getOwnPropertyDescriptor(nativeUrl, 'createObjectURL');
    const createObjectURL = vi.fn(() => 'blob:commission-preview');
    Object.defineProperty(nativeUrl, 'createObjectURL', { configurable: true, value: createObjectURL });
    const file = new File(['image'], 'final.webp', { type: 'image/webp' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    try {
      component.abrirEntrega({
        id: 76,
        cliente: { nome: 'Cliente', username: 'cliente', foto: '' },
      } as any);
      component.selecionarArquivo({ target: input } as unknown as Event);

      expect(createObjectURL).toHaveBeenCalledWith(file);
      expect(component.previewEntrega).toBe('blob:commission-preview');
    } finally {
      if (descriptor) Object.defineProperty(nativeUrl, 'createObjectURL', descriptor);
      else delete (nativeUrl as unknown as { createObjectURL?: unknown }).createObjectURL;
    }
  });

  it('cancela o modal sem chamar o serviço de envio', () => {
    const pedido = { id: 74, cliente: { nome: 'Cliente', username: 'cliente', foto: '' } } as any;
    const registrar = vi.spyOn(component.artistData, 'registrarEntrega');

    component.abrirEntrega(pedido);
    component.cancelarEntrega();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.delivery-dialog')).toBeNull();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('rejeita formato não permitido sem descartar um arquivo já selecionado', () => {
    const previous = new File(['image'], 'final.png', { type: 'image/png' });
    const invalid = new File(['file'], 'final.pdf', { type: 'application/pdf' });
    component.arquivoSelecionado = previous;
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { configurable: true, value: [invalid] });

    component.selecionarArquivo({ target: input } as unknown as Event);

    expect(component.arquivoSelecionado).toBe(previous);
    expect(component.erroEntrega).toContain('PNG, JPG ou WEBP');
  });

  it('mantém o modal aberto com o erro quando o serviço falha e permite mostrar sucesso após confirmar', async () => {
    const pedido = { id: 75, cliente: { nome: 'Cliente', username: 'cliente', foto: '' } } as any;
    const arquivo = new File(['image'], 'final.webp', { type: 'image/webp' });
    component.abrirEntrega(pedido);
    component.arquivoSelecionado = arquivo;
    const registrar = vi.spyOn(component.artistData, 'registrarEntrega')
      .mockRejectedValueOnce(new Error('Falha de conexão'))
      .mockResolvedValueOnce(true);

    await component.enviarEntrega();
    expect(component.entregaAtual?.id).toBe(75);
    expect(component.erroEntrega).toBe('Falha de conexão');
    expect(component.arquivoSelecionado).toBe(arquivo);

    await component.enviarEntrega();
    expect(component.sucessoEntrega).toBe(true);
    expect(fixture.nativeElement.querySelector('.delivery-dialog')?.textContent).toContain('aguarda a avaliação do cliente');
    expect(registrar).toHaveBeenCalledTimes(2);
  });
});
