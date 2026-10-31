import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Post } from '../app/models/post';

const CARRINHO_KEY = 'charte_carrinho';

interface ItemCarrinho {
  id: number;
  addedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class CarrinhoService {
  private readonly itensSubject = new BehaviorSubject<ItemCarrinho[]>([]);
  readonly itens$ = this.itensSubject.asObservable();

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
        .filter((item): item is ItemCarrinho =>
          item != null &&
          typeof item === 'object' &&
          typeof (item as ItemCarrinho).id === 'number' &&
          typeof (item as ItemCarrinho).addedAt === 'number',
        )
        .map((item) => ({ id: item.id, addedAt: item.addedAt }));
      this.itensSubject.next(validos);
    } catch (erro) {
      console.error('Falha ao carregar carrinho do localStorage:', erro);
      this.itensSubject.next([]);
    }
  }

  private persistir(): void {
    try {
      localStorage.setItem(CARRINHO_KEY, JSON.stringify(this.itensSubject.value));
    } catch (erro) {
      console.error('Falha ao persistir carrinho no localStorage:', erro);
    }
  }

  adicionar(post: Post): void {
    if (!post || typeof post.id !== 'number') return;
    const atual = this.itensSubject.value;
    if (atual.some((item) => item.id === post.id)) return;
    const novos = [...atual, { id: post.id, addedAt: Date.now() }];
    this.itensSubject.next(novos);
    this.persistir();
  }

  remover(postId: number): void {
    const atual = this.itensSubject.value;
    const novos = atual.filter((item) => item.id !== postId);
    if (novos.length === atual.length) return;
    this.itensSubject.next(novos);
    this.persistir();
  }

  listar(): Post[] {
    return this.itensSubject.value.map((item) => ({ id: item.id } as Post));
  }

  limpar(): void {
    this.itensSubject.next([]);
    try {
      localStorage.removeItem(CARRINHO_KEY);
    } catch (erro) {
      console.error('Falha ao limpar carrinho:', erro);
    }
  }

  contem(postId: number): boolean {
    return this.itensSubject.value.some((item) => item.id === postId);
  }

  totalItens(): number {
    return this.itensSubject.value.length;
  }
}