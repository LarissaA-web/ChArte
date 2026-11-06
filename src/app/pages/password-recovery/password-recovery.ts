import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';

@Component({
  selector: 'app-password-recovery',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="recovery-page">
      <section class="recovery-card" aria-labelledby="recovery-title">
        <h1 class="recovery-logo">ChArte</h1>
        @if (validando) {
          <h2 id="recovery-title">Validando link</h2>
          <p>Aguarde enquanto verificamos sua solicitação.</p>
        } @else if (sucesso) {
          <h2 id="recovery-title">Senha redefinida</h2>
          <p>Sua senha foi atualizada. Você já pode entrar novamente.</p>
          <button type="button" class="primary-button" (click)="voltarAoLogin()">Voltar ao login</button>
        } @else if (!fluxoValido) {
          <h2 id="recovery-title">Link inválido ou expirado</h2>
          <p>{{ erro || 'Solicite um novo link de recuperação e tente novamente.' }}</p>
          <button type="button" class="primary-button" (click)="voltarAoLogin()">Ir para o login</button>
        } @else {
          <h2 id="recovery-title">Criar nova senha</h2>
          <p>Escolha uma nova senha para sua conta.</p>
          <form (submit)="$event.preventDefault(); redefinirSenha()">
            <input [(ngModel)]="novaSenha" name="novaSenha" type="password" autocomplete="new-password" placeholder="Nova senha" required minlength="6" />
            <input [(ngModel)]="confirmacaoSenha" name="confirmacaoSenha" type="password" autocomplete="new-password" placeholder="Confirme a nova senha" required minlength="6" />
            @if (erro) { <p class="error-message" role="alert">{{ erro }}</p> }
            <button type="submit" class="primary-button" [disabled]="salvando">{{ salvando ? 'Salvando...' : 'Redefinir senha' }}</button>
          </form>
        }
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .recovery-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: #1b1b2e; color: #fff; }
    .recovery-card { width: min(100%, 430px); box-sizing: border-box; padding: 35px 38px 30px; border: 1px solid rgba(255,255,255,.08); border-radius: 28px; background: linear-gradient(145deg,#303052,#24243d); box-shadow: 0 25px 70px rgba(0,0,0,.45); text-align: center; }
    .recovery-logo { margin: 0 0 25px; font-size: 42px; font-weight: 800; letter-spacing: -1px; background: linear-gradient(135deg,#fff,#c875ff,#8b0be0); color: transparent; background-clip: text; }
    h2 { margin: 0 0 12px; }
    p { color: rgba(255,255,255,.72); line-height: 1.5; }
    form { display: grid; gap: 14px; margin-top: 22px; }
    input { width: 100%; height: 52px; box-sizing: border-box; padding: 0 17px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; outline: none; background: rgba(255,255,255,.07); color: #fff; font-size: 15px; }
    input:focus { border-color: #9b24e8; background: rgba(255,255,255,.1); box-shadow: 0 0 0 3px rgba(139,11,224,.15); }
    input::placeholder { color: rgba(255,255,255,.48); }
    .primary-button { width: 100%; min-height: 52px; border: 0; border-radius: 14px; background: linear-gradient(135deg,#8b0be0,#b22cff); color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
    .primary-button:disabled { opacity: .65; cursor: wait; }
    .error-message { margin: 0; color: #ffb3ba; font-size: 13px; }
    @media (max-width: 600px) { .recovery-card { padding: 30px 22px 25px; border-radius: 22px; } }
  `],
})
export class PasswordRecovery implements OnInit {
  validando = true;
  fluxoValido = false;
  sucesso = false;
  salvando = false;
  novaSenha = '';
  confirmacaoSenha = '';
  erro = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly modal: ModalService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.fluxoValido = await this.auth.validarFluxoRecuperacaoSenha();
    } catch {
      this.fluxoValido = false;
    } finally {
      this.validando = false;
    }
  }

  async redefinirSenha(): Promise<void> {
    if (this.salvando) return;
    if (this.novaSenha !== this.confirmacaoSenha) {
      this.erro = 'As senhas não coincidem.';
      return;
    }
    if (this.novaSenha.length < 6) {
      this.erro = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    this.salvando = true;
    this.erro = '';
    try {
      const resultado = await this.auth.concluirRecuperacaoSenha(this.novaSenha);
      if (resultado.status === 'success') {
        this.sucesso = true;
        this.fluxoValido = false;
      } else if (resultado.status === 'invalid_flow') {
        this.fluxoValido = false;
        this.erro = 'Este link não é mais válido. Solicite uma nova recuperação de senha.';
      } else if (resultado.status === 'weak_password') {
        this.erro = 'A senha não atende aos requisitos de segurança. Escolha outra senha.';
      } else if (resultado.status === 'network_error') {
        this.erro = 'Falha de conexão. Verifique sua internet e tente novamente.';
      } else {
        this.erro = 'Não foi possível atualizar a senha. Tente novamente.';
      }
    } catch {
      this.erro = 'Falha de conexão. Verifique sua internet e tente novamente.';
    } finally {
      this.salvando = false;
    }
  }

  voltarAoLogin(): void {
    void this.router.navigate(['/']).then(() => this.modal.openModal('login'));
  }
}
