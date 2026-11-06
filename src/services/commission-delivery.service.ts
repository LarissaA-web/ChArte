import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { supabase } from '../app/core/supabase/supabase.client';

export const COMMISSION_DELIVERY_BUCKET = 'comissoes-privadas';
const MAX_DELIVERY_FILE_SIZE = 10 * 1024 * 1024;
const DELIVERY_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Injectable({ providedIn: 'root' })
export class CommissionDeliveryService {
  constructor(private readonly http: HttpClient) {}

  async criarPreviaAutorizada(pedidoId: number, objectPath: string): Promise<string | undefined> {
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !this.isPrivateDeliveryPath(pedidoId, objectPath)) {
      return undefined;
    }
    try {
      const result = await firstValueFrom(
        this.http.get<{ signedUrl?: string }>(`/api/commissions/${pedidoId}/delivery-url`),
      );
      return result.signedUrl;
    } catch {
      return undefined;
    }
  }

  async registrarEntrega(pedidoId: number, arquivo: File, mensagem: string): Promise<void> {
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      throw new Error('Número do pedido inválido.');
    }
    this.validarImagem(arquivo);

    let data: Awaited<ReturnType<typeof supabase.auth.getSession>>['data'];
    let sessionError: Awaited<ReturnType<typeof supabase.auth.getSession>>['error'];
    try {
      ({ data, error: sessionError } = await supabase.auth.getSession());
    } catch {
      throw new Error('Falha de conexão ao validar sua sessão. Tente novamente.');
    }
    const userId = data.session?.user.id;
    if (sessionError || !userId) {
      throw new Error('Entre novamente para enviar a comissão.');
    }

    const extensao = arquivo.type === 'image/jpeg' ? 'jpg' : arquivo.type.slice('image/'.length);
    const objectPath = `${pedidoId}/${userId}/${crypto.randomUUID()}.${extensao}`;
    let uploadError: { statusCode?: string; message?: string } | null;
    try {
      ({ error: uploadError } = await supabase.storage
        .from(COMMISSION_DELIVERY_BUCKET)
        .upload(objectPath, arquivo, {
          upsert: false,
          contentType: arquivo.type,
          cacheControl: '3600',
        }));
    } catch {
      throw new Error('Falha de conexão ao enviar a imagem. Os dados continuam preenchidos; tente novamente.');
    }
    if (uploadError) {
      const status = Number(uploadError.statusCode);
      const message = (uploadError.message || '').toLowerCase();
      if (status === 404 && message.includes('bucket')) {
        throw new Error('O armazenamento privado de comissões ainda não foi configurado.');
      }
      if (status === 413 || message.includes('size') || message.includes('too large')) {
        throw new Error('A imagem excede o limite de 10 MB.');
      }
      if (status === 415 || message.includes('mime') || message.includes('content type')) {
        throw new Error('O armazenamento aceita apenas imagens PNG, JPG e WEBP.');
      }
      if (status === 401) {
        throw new Error('Sua sessão expirou. Entre novamente para enviar a comissão.');
      }
      if (status === 403) {
        throw new Error('Você não tem permissão para enviar a entrega deste pedido.');
      }
      if (status === 409) {
        throw new Error('Este pedido já recebeu uma entrega ou não está disponível para envio.');
      }
      throw new Error('Não foi possível salvar a imagem privada da entrega. Tente novamente.');
    }

    try {
      await firstValueFrom(
        this.http.post(`/api/commissions/${pedidoId}/delivery`, {
          objectPath,
          message: mensagem.trim(),
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status >= 400 && error.status < 500) {
          // Resposta definitiva: backend não aceitou o registro. A policy permite
          // remover somente este upload ainda não associado a uma entrega.
          try {
            await supabase.storage.from(COMMISSION_DELIVERY_BUCKET).remove([objectPath]);
          } catch {
            // Mantém a falha original; uma limpeza bloqueada não deve ocultá-la.
          }
        }
        const detail = error.error?.detail || error.error?.message;
        if (typeof detail === 'string') throw new Error(detail);
        if (error.status === 0 || error.status >= 500) {
          throw new Error('Falha de conexão ao registrar a entrega. Os dados continuam preenchidos; tente novamente.');
        }
      }
      throw new Error('Não foi possível registrar a entrega. Confira o pedido e tente novamente.');
    }
  }

  private validarImagem(arquivo: File): void {
    if (!DELIVERY_IMAGE_TYPES.has(arquivo.type.toLowerCase())) {
      throw new Error('Selecione uma imagem PNG, JPG ou WEBP.');
    }
    if (arquivo.size <= 0 || arquivo.size > MAX_DELIVERY_FILE_SIZE) {
      throw new Error('A imagem deve ter até 10 MB e não pode estar vazia.');
    }
  }

  private isPrivateDeliveryPath(pedidoId: number, path: string): boolean {
    const match = /^(\d+)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/i.exec(path);
    return Boolean(match && Number(match[1]) === pedidoId);
  }
}
