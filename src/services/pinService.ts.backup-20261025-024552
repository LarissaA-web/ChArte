import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { Post } from '../app/models/post';
import { supabase } from '../app/core/supabase/supabase.client';
import { map, catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PinService {

  private artesCache: Post[] = [];
  private carregado = false;

  getArtes(): Observable<Post[]> {
    if (this.carregado) {
      return of(this.artesCache);
    }
    return from(this.carregarArtesDoBanco()).pipe(
      map(() => this.artesCache),
      catchError(() => of([]))
    );
  }

  buscarPorCategoria(categoria: string): Observable<Post[]> {
    const filtro = this.normalizar(categoria);
    return this.getArtes().pipe(
      map(artes => artes.filter(arte => this.normalizar(arte.categoria.nomeCategoria) === filtro))
    );
  }

  buscarPorEstilo(estilo: string): Observable<Post[]> {
    const filtro = this.normalizar(estilo);
    return this.getArtes().pipe(
      map(artes => artes.filter(arte =>
        this.normalizar(arte.estilo ?? '') === filtro ||
        (arte.tags ?? []).some(tag => this.normalizar(tag) === filtro)
      ))
    );
  }

  private normalizar(valor: string): string {
    return valor.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  }

  getArtesPorArtista(nomeUsuario: string): Observable<Post[]> {
    const nome = nomeUsuario.trim().toLowerCase();
    return this.getArtes().pipe(
      map(artes => artes.filter(arte =>
        arte.usuario.nomeUsuario?.toLowerCase() === nome
      ))
    );
  }

  async adicionarArte(dados: {
    titulo: string;
    descricao: string;
    portfolio: string;
    categoria: string;
    estilo: string;
    preco: number;
    tags?: string[];
  }, perfil: { idUsuario: string; idArtista?: number; nomeUsuario: string; nomeArtistico?: string; fotoPerfil: string }): Promise<Post | null> {
    const { data: categoriaData } = await supabase
      .from('categoria')
      .select('id_categoria')
      .ilike('nome_categoria', dados.categoria)
      .single();

    const { data, error } = await supabase
      .from('portifolio')
      .insert({
        id_artista: perfil.idArtista,
        id_categoria: categoriaData?.id_categoria,
        titulo: dados.titulo,
        descricao: dados.descricao,
        preco: dados.preco,
        imagem: dados.portfolio,
      })
      .select('id_portifolio, id_artista, id_categoria, titulo, descricao, preco, imagem, data_envio')
      .single();

    if (error || !data) {
      console.error('Erro ao adicionar arte:', error);
      return null;
    }

    await this.recarregarCache();
    return this.artesCache.find(a => a.id === data.id_portifolio) ?? null;
  }

  async atualizarArte(arte: Post): Promise<boolean> {
    const { error } = await supabase
      .from('portifolio')
      .update({
        titulo: arte.titulo,
        descricao: arte.descricao,
        preco: arte.preco,
        imagem: arte.portfolio,
        id_categoria: arte.categoria.id,
      })
      .eq('id_portifolio', arte.id);

    if (error) {
      console.error('Erro ao atualizar arte:', error);
      return false;
    }

    await this.recarregarCache();
    return true;
  }

  async excluirArte(id: number): Promise<boolean> {
    const { error } = await supabase
      .from('portifolio')
      .delete()
      .eq('id_portifolio', id);

    if (error) {
      console.error('Erro ao excluir arte:', error);
      return false;
    }

    await this.recarregarCache();
    return true;
  }

  private async carregarArtesDoBanco(): Promise<void> {
    const { data, error } = await supabase
      .from('portifolio')
      .select(`
        id_portifolio,
        id_artista,
        id_categoria,
        titulo,
        descricao,
        preco,
        imagem,
        data_envio,
        artista (
          id_artista,
          nome_artistico
        ),
        categoria (
          id_categoria,
          nome_categoria
        )
      `);

    if (error) {
      console.error('Erro ao carregar artes:', error);
      this.artesCache = [];
      this.carregado = true;
      return;
    }

    const artesBanco = data ?? [];

    if (artesBanco.length === 0) {
      this.artesCache = [];
      this.carregado = true;
      return;
    }

    const idsArtistas = [...new Set(artesBanco.map((item: any) => item.id_artista))];

    const { data: artistas } = await supabase
      .from('artista')
      .select('id_artista, id_usuario, nome_artistico')
      .in('id_artista', idsArtistas);

    const idsUsuarios = [...new Set((artistas ?? []).map((artista: any) => artista.id_usuario))];

    const { data: usuarios } = await supabase
      .from('usuario')
      .select('id_usuario, nome_usuario, foto_perfil')
      .in('id_usuario', idsUsuarios);

    const artistasPorId = new Map((artistas ?? []).map((a: any) => [a.id_artista, a]));
    const usuariosPorId = new Map((usuarios ?? []).map((u: any) => [u.id_usuario, u]));

    this.artesCache = artesBanco.map((item: any): Post => {
      const artista: any = artistasPorId.get(item.id_artista);
      const usuario: any = artista ? usuariosPorId.get(artista.id_usuario) : undefined;

      return {
        id: item.id_portifolio,
        titulo: item.titulo,
        descricao: item.descricao ?? '',
        portfolio: item.imagem,
        nomeArtistico: artista?.nome_artistico ?? item.artista?.nome_artistico ?? 'Artista',
        preco: Number(item.preco),
        estilo: undefined,
        tags: undefined,
        criadoEm: item.data_envio,
        usuario: {
          id: usuario?.id_usuario ?? 0,
          artistaId: item.id_artista,
          nomeUsuario: usuario?.nome_usuario ?? '',
          nomeArtistico: artista?.nome_artistico ?? item.artista?.nome_artistico ?? 'Artista',
          fotoPerfil: usuario?.foto_perfil ?? '/gato.jpeg',
        },
        categoria: {
          id: item.id_categoria,
          nomeCategoria: item.categoria?.nome_categoria ?? 'Sem categoria',
        },
      };
    });

    this.carregado = true;
    console.log('ARTES CONVERTIDAS PARA POST:', this.artesCache);
  }

  private async recarregarCache(): Promise<void> {
    this.carregado = false;
    await this.carregarArtesDoBanco();
  }

  async forcarRecarregamento(): Promise<void> {
    await this.recarregarCache();
  }
}