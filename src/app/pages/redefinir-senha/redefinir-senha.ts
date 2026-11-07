import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ModalService } from '../../../services/modal.service';

@Component({
  selector: 'app-redefinir-senha',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './redefinir-senha.html',
  styleUrl: './recuperacao-senha.css',
})
export class RedefinirSenha implements OnInit {
  novaSenha = '';
  confirmarSenha = '';
  carregandoValidacao = true;
  contextoValido = false;
  enviando = false;
  sucesso = false;
  erro = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly modal: ModalService,
  ) {}

  ngOnInit(): void {
    void this.validarLink();
  }

  private async validarLink(): Promise<void> {
    try {
      this.contextoValido = await this.auth.validarFluxoRecuperacaoSenha();
      if (!this.contextoValido) {
        this.erro = 'Este link é inválido, expirou ou já foi utilizado. Solicite um novo e-mail de recuperação.';
      }
    } catch {
      this.contextoValido = false;
      this.erro = 'Não foi possível validar o link. Solicite um novo e-mail de recuperação.';
    } finally {
      this.carregandoValidacao = false;
    }
  }

  async redefinir(): Promise<void> {
    this.erro = '';
    if (!this.validacaoConcluida) {
      this.erro = 'Aguarde a confirmação do link de recuperação.';
      return;
    }
    if (!this.contextoValido) {
      this.erro = 'O link de recuperação não é válido. Solicite outro e-mail.';
      return;
    }
    if (!this.novaSenha || !this.confirmarSenha) {
      this.erro = 'Preencha os dois campos de senha.';
      return;
    }
    if (this.novaSenha.length < 6) {
      this.erro = 'A senha precisa ter pelo menos 6 caracteres.';
      return;
    }
    if (this.novaSenha !== this.confirmarSenha) {
      this.erro = 'As senhas não coincidem.';
      return;
    }
    if (this.enviando) return;

    this.enviando = true;
    try {
      const resultado = await this.auth.concluirRecuperacaoSenha(this.novaSenha);
      if (resultado.status !== 'success') {
        if (resultado.status === 'invalid_flow') {
          this.contextoValido = false;
          this.erro = 'A recuperação não é mais válida. Solicite outro e-mail.';
        } else if (resultado.status === 'weak_password') {
          this.erro = 'A senha não atende aos requisitos de segurança. Escolha outra senha.';
        } else if (resultado.status === 'network_error') {
          this.erro = 'Falha de conexão. Verifique sua internet e tente novamente.';
        } else {
          this.erro = 'Não foi possível redefinir a senha. Solicite outro e-mail.';
        }
        return;
      }
      this.sucesso = true;
      this.contextoValido = false;
      this.novaSenha = '';
      this.confirmarSenha = '';
    } catch {
      this.erro = 'Não foi possível concluir a alteração. Tente novamente ou solicite outro e-mail.';
    } finally {
      this.enviando = false;
    }
  }

  get validacaoConcluida(): boolean {
    return !this.carregandoValidacao;
  }

  async voltarAoLogin(): Promise<void> {
    await this.router.navigate(['/']);
    this.modal.openModal('login');
  }
}
