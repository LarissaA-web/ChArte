import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArtistReviewService, ReviewOrigin } from '../../../services/artist-review.service';

@Component({
  selector: 'app-artist-review-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open) {
      <div class="review-overlay" (click)="fechar()">
        <section class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" (click)="$event.stopPropagation()">
          <button class="review-close" type="button" aria-label="Fechar avaliação" [disabled]="enviando" (click)="fechar()">×</button>
          @if (!enviada) {
            <span class="review-symbol" aria-hidden="true">✦</span>
            <span class="review-eyebrow">SUA OPINIÃO IMPORTA</span>
            <h2 id="review-title">Avalie sua experiência</h2>
            <p class="review-description">Como foi comprar de <strong>{{ artistName }}</strong>?</p>
            <div class="review-stars" role="group" aria-label="Escolha uma nota de uma a cinco estrelas">
              @for (star of stars; track star) {
                <button type="button" class="review-star" [class.selected]="star <= (hoverRating || rating)"
                  [attr.aria-label]="star + (star === 1 ? ' estrela' : ' estrelas')"
                  [attr.aria-pressed]="rating === star"
                  (mouseenter)="hoverRating = star" (mouseleave)="hoverRating = 0"
                  (focus)="hoverRating = star" (blur)="hoverRating = 0" (click)="rating = star">★</button>
              }
            </div>
            <p class="review-rating-label" aria-live="polite">{{ ratingLabels[hoverRating || rating] || 'Toque em uma estrela para avaliar' }}</p>
            <label class="review-comment-label" for="artist-review-comment">Comentário <span>(opcional)</span></label>
            <textarea id="artist-review-comment" [(ngModel)]="comment" maxlength="500" placeholder="Conte o que achou…"></textarea>
            @if (error) { <p class="review-error" role="alert">{{ error }}</p> }
            <button class="review-submit" type="button" [disabled]="!rating || enviando" (click)="enviar()">
              {{ enviando ? 'Enviando avaliação…' : 'Enviar avaliação' }}
            </button>
            <button class="review-later" type="button" [disabled]="enviando" (click)="fechar()">Avaliar depois</button>
          } @else {
            <span class="review-symbol success" aria-hidden="true">✓</span>
            <h2 id="review-title">Obrigado pela avaliação!</h2>
            <p class="review-description">Sua opinião foi registrada e ajuda a comunidade ChArte.</p>
            <button class="review-submit" type="button" (click)="fechar()">Concluir</button>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:contents}.review-overlay{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:18px;background:rgba(13,9,16,.78);backdrop-filter:blur(7px);animation:reviewFade .18s ease-out}
    .review-dialog{position:relative;width:min(100%,450px);box-sizing:border-box;padding:36px 32px 26px;border:1px solid #624574;border-radius:22px;background:#211b25;color:#f8f5fa;text-align:center;box-shadow:0 24px 80px #0009;animation:reviewPop .22s ease-out}
    .review-close{position:absolute;right:13px;top:13px;width:35px;height:35px;border:0;border-radius:50%;background:#33283a;color:#e6d9eb;font-size:24px;cursor:pointer}.review-close:disabled{opacity:.5}
    .review-symbol{display:grid;place-items:center;width:54px;height:54px;margin:0 auto 14px;border-radius:50%;background:#392647;color:#e5b5fa;font-size:25px}.review-symbol.success{background:#1d3d2a;color:#9fe5b4}
    .review-eyebrow{color:#ba7bd6;font-size:10px;font-weight:800;letter-spacing:.14em}.review-dialog h2{margin:9px 0;font-size:23px}.review-description{margin:0 auto 20px;max-width:350px;color:#bdb1c2;font-size:14px;line-height:1.5}.review-description strong{color:#e4c9f1}
    .review-stars{display:flex;justify-content:center;gap:8px}.review-star{width:49px;height:50px;border:0;border-radius:12px;background:#302936;color:#6b606f;font-size:32px;cursor:pointer;transition:transform .15s,color .15s,background .15s}.review-star.selected{color:#ffc857;background:#3b3020;text-shadow:0 0 15px #ffc85766}.review-star:hover,.review-star:focus-visible{transform:translateY(-3px) scale(1.07);outline:2px solid #c178e0;outline-offset:2px}
    .review-rating-label{height:20px;margin:9px 0 20px;color:#e8c5f7;font-size:13px;font-weight:700}.review-comment-label{display:block;margin-bottom:7px;text-align:left;color:#ded3e3;font-size:13px;font-weight:700}.review-comment-label span{color:#978c9c;font-weight:400}
    .review-dialog textarea{display:block;width:100%;min-height:88px;box-sizing:border-box;resize:vertical;padding:11px 12px;border:1px solid #4d4054;border-radius:10px;background:#17131a;color:#f8f5fa;font:inherit;font-size:13px}.review-dialog textarea:focus{outline:2px solid #a447d2;outline-offset:1px}
    .review-error{margin:10px 0 0;color:#ffb8bd;font-size:13px}.review-submit{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:linear-gradient(135deg,#a447d2,#7528a3);color:#fff;font-size:14px;font-weight:800;cursor:pointer}.review-submit:disabled{opacity:.5;cursor:not-allowed}.review-later{margin-top:11px;padding:8px 16px;border:0;background:transparent;color:#aaa0af;font-size:13px;cursor:pointer}.review-later:hover{color:white}
    @keyframes reviewFade{from{opacity:0}to{opacity:1}}@keyframes reviewPop{from{opacity:0;transform:translateY(9px) scale(.98)}to{opacity:1;transform:none}}
    @media(max-width:480px){.review-dialog{padding:34px 20px 23px}.review-star{width:43px;height:45px;font-size:28px}.review-dialog h2{font-size:21px}}
    :host-context(html[data-theme='claro']) .review-dialog{background:#fff;color:#2b2030;border-color:#dfc9e9;box-shadow:0 24px 70px #22112b33}
    :host-context(html[data-theme='claro']) .review-description{color:#655b6a}:host-context(html[data-theme='claro']) .review-description strong{color:#773b92}
    :host-context(html[data-theme='claro']) .review-star{background:#f2edf5;color:#aa9bb1}:host-context(html[data-theme='claro']) .review-star.selected{background:#fff3d6;color:#d18b00}
    :host-context(html[data-theme='claro']) .review-rating-label{color:#773b92}:host-context(html[data-theme='claro']) .review-comment-label{color:#44364b}
    :host-context(html[data-theme='claro']) .review-dialog textarea{background:#faf8fb;color:#2b2030;border-color:#d7cbdc}:host-context(html[data-theme='claro']) .review-close{background:#f1ebf4;color:#55455c}:host-context(html[data-theme='claro']) .review-later{color:#74677b}
  `],
})
export class ArtistReviewModal implements OnChanges {
  @Input() open = false;
  @Input() origin: ReviewOrigin | null = null;
  @Input() artistName = 'este artista';
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

  readonly stars = [1, 2, 3, 4, 5];
  readonly ratingLabels = ['', 'Não gostei', 'Poderia ser melhor', 'Foi bom', 'Gostei muito', 'Adorei!'];
  rating = 0;
  hoverRating = 0;
  comment = '';
  error = '';
  enviando = false;
  enviada = false;

  constructor(private readonly reviews: ArtistReviewService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      this.rating = 0;
      this.hoverRating = 0;
      this.comment = '';
      this.error = '';
      this.enviando = false;
      this.enviada = false;
    }
  }

  fechar(): void {
    if (this.enviando) return;
    this.open = false;
    this.closed.emit();
  }

  async enviar(): Promise<void> {
    if (!this.origin || !this.rating || this.enviando) return;
    this.enviando = true;
    this.error = '';
    try {
      const result = await this.reviews.registrar(this.origin, this.rating, this.comment);
      if (!result.ok) {
        this.error = result.message || 'Não foi possível enviar sua avaliação.';
        return;
      }
      this.enviada = true;
      this.submitted.emit();
    } catch {
      this.error = 'Não foi possível enviar sua avaliação. Confira sua conexão e tente novamente.';
    } finally {
      this.enviando = false;
    }
  }
}
