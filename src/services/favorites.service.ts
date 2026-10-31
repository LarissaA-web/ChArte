import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { Post } from '../app/models/post';
import { PinService } from './pinService';
import { AuthService } from './auth.service';
import { supabase } from '../app/core/supabase/supabase.client';
import { map, catchError, switchMap, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private usuarioId: string | null = null;
  private versaoCarregamento = 0;
  private readonly idsSubject = new BehaviorSubject<number[]>([]);
  readonly ids$ = this.idsSubject.asObservable();

  constructor(private pins: PinService, private auth: AuthService) {
    this.definirUsuario(this.auth.getUsuarioLogado()?.idUsuario ?? null);
    this.auth.usuarioLogado$.subscribe((usuario) => this.definirUsuario(usuario?.idUsuario ?? null));
  }

  private async carregarIdsDoBanco(usuarioId: string): Promise<number[]> {
    try {
      const { data, error } = await supabase
        .from('favorito')
        .select('id_portifolio')
        .eq('id_usuario', usuarioId);

      if (error) {
        console.error('Erro ao carregar favoritos:', error);
        return [];
      }

      return (data ?? []).map((item: any) => item.id_portifolio);
    } catch {
      return [];
    }
  }

  private definirUsuario(usuarioId: string | null): void {
    if (this.usuarioId === usuarioId) return;

    this.usuarioId = usuarioId;
    const versao = ++this.versaoCarregamento;

    if (usuarioId) {
      this.carregarIdsDoBanco(usuarioId).then(ids => {
        if (
          versao !== this.versaoCarregamento ||
          this.usuarioId !== usuarioId
        ) {
          return;
        }
        this.idsSubject.next(ids);
      });
    } else {
      this.idsSubject.next([]);
    }
  }

  listar(): Observable<Post[]> {
    return this.ids$.pipe(
      switchMap(ids => {
        if (ids.length === 0) {
          return of([] as Post[]);
        }

        const idsSet = new Set(ids);
        return this.pins.getArtes().pipe(
          map(artes => artes.filter((arte: Post) => idsSet.has(arte.id)))
        );
      })
    );
  }

  listarIds(): number[] {
    return this.idsSubject.value;
  }

  contem(id: number): boolean { return this.idsSubject.value.includes(id); }

  async alternar(id: number): Promise<void> {
    const usuarioId = this.usuarioId;
    if (!usuarioId) return;

    const isFavorito = this.idsSubject.value.includes(id);

    // Invalida carregamentos antigos para que não restaurem IDs removidos.
    ++this.versaoCarregamento;

    if (isFavorito) {
      const { error } = await supabase
        .from('favorito')
        .delete()
        .eq('id_usuario', usuarioId)
        .eq('id_portifolio', id);

      if (error) {
        console.error('Erro ao remover favorito:', error);
        return;
      }

      this.idsSubject.next(
        this.idsSubject.value.filter(atual => atual !== id)
      );
    } else {
      const { error } = await supabase
        .from('favorito')
        .insert({
          id_usuario: usuarioId,
          id_portifolio: id,
        });

      if (error) {
        console.error('Erro ao adicionar favorito:', error);
        return;
      }

      const idsAtuais = this.idsSubject.value;
      if (!idsAtuais.includes(id)) {
        this.idsSubject.next([...idsAtuais, id]);
      }
    }
  }
}