import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Post } from '../app/models/post';

const CARRINHO_KEY = 'charte_carrinho';

interface ItemCarrinho {
  id: number;
  addedAt: number;
  post?: Post;
}

@Injectable({
  providedIn: 'root',
})
export class CarrinhoService {
  private readonly itensSubject = new BehaviorSubject<ItemCarrinho[]>([]);
  readonly itens$: Observable<ItemCarrinho[]> = this.itensSubject.asObservable();

  constructor() {
    this.carregarDoArmazenamento();
  }

  private carregarDoArmazenamento(): void {
    try {
      const raw = localStorage.getItem(CARRINHO_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const validos = parsed
        .filter(
          (item): item is ItemCarrinho =>
            item != null &&
            typeof item === 'object' &&
            typeof (item as ItemCarrinho).id === 'number',
        )
        .map((item) => ({
          id: item.id,
          addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now(),
          post: item.post,
        }));
      this.itensSubject.next(validos);
    } catch {
      this.itensSubject.next([]);
    }
  }

  private persistir(): void {
    try {
      localStorage.setItem(CARRINHO_KEY, JSON.stringify(this.itensSubject.value));
    } catch {
      // ignora erro de quota
    }
  }

  adicionar(post: Post): boolean {
    if (!post || typeof post.id !== 'number') return false;
    const atual = this.itensSubject.value;
    if (atual.some((item) => item.id === post.id)) return false;
    const novos = [...atual, { id: post.id, addedAt: Date.now(), post }];
    this.itensSubject.next(novos);
    this.persistir();
    return true;
  }

  remover(postId: number): void {
    const atual = this.itensSubject.value;
    const novos = atual.filter((item) => item.id !== postId);
    if (novos.length === atual.length) return;
    this.itensSubject.next(novos);
    this.persistir();
  }

  listar(): Post[] {
    return this.itensSubject.value.map((item) => item.post ?? ({ id: item.id } as Post));
  }

  listarIds(): number[] {
    return this.itensSubject.value.map((item) => item.id);
  }

  limpar(): void {
    this.itensSubject.next([]);
    try {
      localStorage.removeItem(CARRINHO_KEY);
    } catch {
      // ignora erro
    }
  }

  contem(postId: number): boolean {
    return this.itensSubject.value.some((item) => item.id === postId);
  }

  totalItens(): number {
    return this.itensSubject.value.length;
  }
}
