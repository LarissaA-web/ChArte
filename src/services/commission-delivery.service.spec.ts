import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommissionDeliveryService } from './commission-delivery.service';

describe('CommissionDeliveryService', () => {
  let service: CommissionDeliveryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CommissionDeliveryService],
    });
    service = TestBed.inject(CommissionDeliveryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('solicita URL temporária ao backend para o pedido correspondente', async () => {
    const result = service.criarPreviaAutorizada(
      33,
      '33/f33df301-8ec7-44ab-b85c-e643251edb73/550e8400-e29b-41d4-a716-446655440000.png',
    );
    const request = http.expectOne('/api/commissions/33/delivery-url');
    expect(request.request.method).toBe('GET');
    request.flush({ signedUrl: 'https://example.supabase.co/signed?token=temporary' });
    await expect(result).resolves.toContain('token=temporary');
  });

  it('não pede URL ao backend para um caminho de outro pedido', async () => {
    const result = service.criarPreviaAutorizada(
      33,
      '34/f33df301-8ec7-44ab-b85c-e643251edb73/550e8400-e29b-41d4-a716-446655440000.png',
    );
    await expect(result).resolves.toBeUndefined();
    http.expectNone(() => true);
  });
});
