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

  async adicionarArte(
    dados: {
      titulo: string;
      descricao: string;
      portfolio: string;
      categoria: string;
      estilo: string;
      preco: number;
      arquivo?: File;
      tags?: string[];
    },
    perfil: {
      idUsuario: string;
      idArtista?: number;
      nomeUsuario: string;
      nomeArtistico?: string;
      fotoPerfil: string;
    }
  ): Promise<Post | null> {
    if (!perfil.idArtista) {
      console.error('Não foi encontrado o cadastro de artista.');
      return null;
    }

    const { data: categoriaData, error: erroCategoria } = await supabase
      .from('categoria')
      .select('id_categoria')
      .ilike('nome_categoria', dados.categoria)
      .single();

    if (erroCategoria || !categoriaData) {
      console.error('Erro ao localizar categoria:', erroCategoria);
      return null;
    }

    let caminhoImagem = dados.portfolio;

    if (dados.arquivo) {
      const { data: authData, error: erroAuth } =
        await supabase.auth.getUser();

      const usuarioAuth = authData.user;

      if (erroAuth || !usuarioAuth) {
        console.error('É necessário estar autenticado para enviar imagens.');
        return null;
      }

      const extensao =
        dados.arquivo.name.split('.').pop()?.toLowerCase() || 'bin';

      const nomeArquivo = `${crypto.randomUUID()}.${extensao}`;
      caminhoImagem = `artes/${usuarioAuth.id}/${nomeArquivo}`;

      const { error: erroUpload } = await supabase.storage
        .from('uploads')
        .upload(caminhoImagem, dados.arquivo, {
          upsert: false,
          contentType: dados.arquivo.type || undefined,
        });

      if (erroUpload) {
        console.error('Erro ao enviar imagem:', erroUpload);
        return null;
      }
    }

    const { data, error } = await supabase
      .from('portifolio')
      .insert({
        id_artista: perfil.idArtista,
        id_categoria: categoriaData.id_categoria,
        titulo: dados.titulo,
        descricao: dados.descricao,
        preco: dados.preco,
        imagem: caminhoImagem,
      })
      .select(
        'id_portifolio, id_artista, id_categoria, titulo, descricao, preco, imagem, data_envio'
      )
      .single();

    if (error || !data) {
      console.error('Erro ao adicionar arte:', error);

      if (dados.arquivo) {
        const { error: erroRemocao } = await supabase.storage
          .from('uploads')
          .remove([caminhoImagem]);

        if (erroRemocao) {
          console.error(
            'Não foi possível remover a imagem enviada:',
            erroRemocao
          );
        }
      }

      return null;
    }

    await this.recarregarCache();

    return this.artesCache.find(
      arte => arte.id === data.id_portifolio
    ) ?? null;
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
    const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
    console.log('[Exclusão] Usuário autenticado:', sessao.user?.id, sessao.user?.email);
    if (erroSessao || !sessao.user) {
      console.error('[Exclusão] Não há usuário autenticado:', erroSessao);
      return false;
    }

    // Localiza a imagem associada à obra.
    const { data: arte, error: erroBusca } = await supabase
      .from('portifolio')
      .select('imagem')
      .eq('id_portifolio', id)
      .single();

    if (erroBusca || !arte) {
      console.error('Erro ao localizar obra para exclusão:', erroBusca);
      return false;
    }

    const imagem = arte.imagem as string | null;

    // Remove primeiro a imagem enviada ao Storage.
    // Imagens externas não são arquivos do bucket e não devem ser removidas daqui.
    if (imagem && !imagem.startsWith('http://') &&
        !imagem.startsWith('https://') && !imagem.startsWith('data:')) {

      if (!imagem.startsWith('artes/')) {
        console.error('Caminho de imagem inesperado; exclusão cancelada:', imagem);
        return false;
      }

      const { data: arquivosRemovidos, error: erroStorage } =
        await supabase.storage.from('uploads').remove([imagem]);

      if (erroStorage) {
        console.error('Erro ao remover imagem do Storage:', erroStorage);
        return false;
      }

      if (!arquivosRemovidos || arquivosRemovidos.length === 0) {
        console.error(
          'O Storage não confirmou a remoção da imagem. O registro foi mantido.',
          imagem
        );
        return false;
      }

      console.log('Imagem removida do Storage:', imagem);
    }

    // Só exclui o registro depois de tratar a imagem.
    const { data: registroExcluido, error: erroExclusao } = await supabase
      .from('portifolio')
      .delete()
      .eq('id_portifolio', id)
      .select('id_portifolio');

    if (erroExclusao) {
      console.error(
        'A imagem pode ter sido removida, mas houve erro ao excluir a obra do banco:',
        erroExclusao
      );
      return false;
    }

    if (!registroExcluido || registroExcluido.length === 0) {
      console.error(
        'Nenhum registro foi excluído. Verifique as permissões RLS e se a obra pertence à conta atual.'
      );
      return false;
    }

    await this.recarregarCache();
    console.log('Obra excluída do banco:', id);
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
        portfolio: this.obterUrlImagem(item.imagem),
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

  private obterUrlImagem(imagem: string | null): string {
    if (!imagem) {
      return '/gato.jpeg';
    }

    if (
      imagem.startsWith('http://') ||
      imagem.startsWith('https://') ||
      imagem.startsWith('data:')
    ) {
      return imagem;
    }

    const { data } = supabase.storage
      .from('uploads')
      .getPublicUrl(imagem);

    return data.publicUrl;
  }

  private async recarregarCache(): Promise<void> {
    this.carregado = false;
    await this.carregarArtesDoBanco();
  }

  async forcarRecarregamento(): Promise<void> {
    await this.recarregarCache();
  }
}