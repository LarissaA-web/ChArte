import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface MonthlyArtistRevenue {
  month: string;
  gross: number;
}

export interface ArtistFinanceSummary {
  grossRevenue: number | null;
  platformFees: number | null;
  artistNet: number | null;
  heldBalance: number;
  availableBalance: number;
  approvedPayments: number;
  readyArtSales: number;
  commissions: number;
  unclassifiedPayments: number;
  approvedPaymentsMissingMovements: number;
  movementsWithoutApprovedPayment: number;
  financialFieldDiscrepancies: number;
  monthlyRevenue: MonthlyArtistRevenue[];
}

export interface ArtistFinanceMovement {
  id: number;
  paymentId: number | null;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface ArtistFinanceMovementPage {
  items: ArtistFinanceMovement[];
  total: number;
  page: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class ArtistFinanceService {
  private readonly baseUrl = '/api/artist/finance';

  constructor(private http: HttpClient) {}

  getSummary(): Promise<ArtistFinanceSummary> {
    return firstValueFrom(this.http.get<ArtistFinanceSummary>(`${this.baseUrl}/summary`));
  }

  getMovements(page = 0, size = 20): Promise<ArtistFinanceMovementPage> {
    const params = { page, size };
    return firstValueFrom(this.http.get<ArtistFinanceMovementPage>(`${this.baseUrl}/movements`, { params }));
  }
}
