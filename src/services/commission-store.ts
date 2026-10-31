import { InjectionToken, inject } from '@angular/core';
import { Comissao } from '../app/models/artist-area';
import { ArtistAreaService } from './artist-area.service';

/** Synchronous persistence boundary used by the commission domain service. */
export interface CommissionStore {
  load(): Comissao[];
  save(comissoes: Comissao[]): boolean;
}

/** Supabase store - delegates to ArtistAreaService for actual data. */
export class SupabaseCommissionStore implements CommissionStore {
  private artistArea: ArtistAreaService;

  constructor() {
    this.artistArea = inject(ArtistAreaService);
  }

  load(): Comissao[] {
    // Os dados reais são gerenciados de forma reativa por ArtistAreaService.
    // Retornamos o snapshot atual do subject para quem precisar do valor síncrono.
    // Nota: o subject é inicializado como []; os dados reais são carregados
    // de forma assíncrona no constructor do ArtistAreaService.
    return this.artistArea.obterComissoesAtuais();
  }

  save(comissoes: Comissao[]): boolean {
    // A persistência real ocorre em ArtistAreaService via Supabase.
    // Este método mantém compatibilidade de assinatura mas não faz nada
    // porque os dados já são gerenciados de forma reativa.
    console.warn(
      'SupabaseCommissionStore.save() é um no-op: os dados são gerenciados por ArtistAreaService.',
    );
    return true;
  }
}

export const COMMISSION_STORE = new InjectionToken<CommissionStore>('COMMISSION_STORE', {
  providedIn: 'root',
  factory: () => new SupabaseCommissionStore(),
});