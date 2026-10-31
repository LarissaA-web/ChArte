import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TipoUsuario } from '../../mocks/usuarios.mock';
import {
  AuthService,
  SignUpResult,
} from '../../../services/auth.service';

interface SlotGaleria {
  imagem: string;
  direcao: 'up' | 'down';
  duracao: string;
  atraso: string;
  tamanho: number;
}

interface LinhaGaleria {
  itens: SlotGaleria[];
}

@Component({
  selector: 'app-cadastro',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './cadastro.html',
  styleUrl: './cadastro.css',
})
export class Cadastro {
  nome = '';
  nomeArtistico = '';
  nomeUsuario = '';
  email = '';
  senha = '';
  confirmarSenha = '';
  mostrarSenha = false;
  mostrarConfirmarSenha = false;
  tipoUsuario: TipoUsuario = 'Comum';
  dataNascimento = '';
  genero = '';
  telefone = '';
  carregando = false;
  reenviando = false;

  /** Resultado tipado da tentativa de cadastro (nulo antes de tentar). */
  resultado: SignUpResult | null = null;

  /**
   * Mensagens de erro por campo, populadas pela validação do formulário.
   * Cada chave corresponde ao `name` de um campo do formulário.
   */
  erros: Record<string, string> = {};

  /** Feedback exibido após tentar reenviar a confirmação de e-mail. */
  feedbackReenvio: { mensagem: string; ehErro: boolean } | null = null;

  readonly tipos: TipoUsuario[] = ['Comum', 'Artista'];
  readonly generos = [
    'Feminino',
    'Masculino',
    'Gênero Fluido',
    'Não Binário',
    'Não Informado',
    'Outro',
  ];

  readonly dataMaxima = new Date(
    Date.now() - 13 * 365 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .split('T')[0];

  private readonly imagensGaleria = [
    '/styles-icons/fantasy_style.jpeg',
    '/styles-icons/Manga_style.jpeg',
    '/styles-icons/pop-art_style.jpeg',
    '/styles-icons/kawaii_style.jpeg',
    '/styles-icons/realismo_style.jpeg',
    '/styles-icons/sci-fi_style.jpeg',
    '/styles-icons/cartoon_style.jpeg',
    '/styles-icons/gotico_style.jpeg',
    '/styles-icons/chibi_style.jpeg',
    '/styles-icons/noir_style.jpeg',
    '/styles-icons/Y2K_style.jpeg',
    '/styles-icons/kemonomimi_style.jpeg',
    '/styles-icons/semi-realismo_style.jpeg',
    '/styles-icons/grunge_style.jpeg',
    '/styles-icons/cute_style.jpeg',
    '/styles-icons/horror_style.jpeg',
  ];

  readonly galeria: LinhaGaleria[] = Array.from(
    { length: 4 },
    (_, coluna) => {
      const tamanhos = [
        [1.5, 0.65, 1, 1.5],
        [1, 1.5, 1, 0.65],
        [0.65, 1, 1.5, 1],
        [1.5, 1, 0.65, 1.5],
      ][coluna];

      return {
        itens: tamanhos.map((tamanho, indice) => ({
          imagem: this.imagensGaleria[
            (coluna * tamanhos.length + indice) %
            this.imagensGaleria.length
          ],
          direcao: coluna % 2 === 0 ? ('up' as const) : ('down' as const),
          duracao: `${(18 + coluna * 2.5).toFixed(2)}s`,
          atraso: `${(coluna * 1.1).toFixed(2)}s`,
          tamanho,
        })),
      };
    },
  );

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  rotuloTipo(tipo: TipoUsuario): string {
    return tipo === 'Artista' ? 'Artista' : 'Usuário';
  }

  /** Exibe a mensagem de erro de um campo, se houver. */
  erroDoCampo(campo: string): string | undefined {
    return this.erros[campo];
  }

  /** Indica se um campo deve receber destaque de erro. */
  campoInvalido(campo: string): boolean {
    return !!this.erros[campo];
  }

  /** Resgate amigável da mensagem de senha fraca a partir do resultado. */
  mensagemSenhaFraca(): string | undefined {
    const r = this.resultado;
    if (r && r.status === 'weak_password') {
      return r.message;
    }
    return undefined;
  }

  /** E-mail do resultado de confirmação (usado para reenvio). */
  emailConfirmacao(): string | undefined {
    const r = this.resultado;
    if (r && r.status === 'confirmation_required') {
      return r.email;
    }
    return undefined;
  }

  /** Mensagem curta para o banner de resultado (erro ou aviso). */
  mensagemResultado(): string | undefined {
    const r = this.resultado;
    if (!r) return undefined;

    switch (r.status) {
      case 'success':
        return 'Cadastro realizado com sucesso!';
      case 'invalid_input':
        return r.message ?? 'Verifique os dados informados e tente novamente.';
      case 'network_error':
        return r.message;
      case 'profile_creation_error':
        return r.message;
      case 'unknown_error':
        return r.message;
      case 'weak_password':
        return r.message;
      case 'username_already_registered':
        return 'Este nome de usuário já está em uso. Escolha outro para continuar.';
      case 'email_already_registered':
        return 'Este e-mail já está cadastrado. Entre na sua conta ou utilize a recuperação de senha.';
      case 'rate_limited':
        return 'Você realizou muitas tentativas de cadastro ou confirmação. Aguarde um pouco antes de tentar novamente.';
      default:
        return undefined;
    }
  }

  /** Tipo visual do banner de resultado. */
  tipoResultado(): 'erro' | 'atencao' {
    const r = this.resultado;
    if (!r) return 'erro';
    return r.status === 'rate_limited' ? 'atencao' : 'erro';
  }

  /** Ações de apoio ao lado do banner de resultado. */
  acoesResultado(): {
    label: string;
    action: () => void;
  }[] {
    const r = this.resultado;
    if (!r) return [];

    if (r.status === 'email_already_registered') {
      return [
        {
          label: 'Ir para o login',
          action: () => void this.router.navigate(['/']),
        },
      ];
    }

    if (r.status === 'rate_limited') {
      return [
        {
          label: 'Tentar novamente',
          action: () => this.limparResultado(),
        },
      ];
    }

    if (
      r.status === 'username_already_registered' ||
      r.status === 'invalid_input' ||
      r.status === 'network_error' ||
      r.status === 'profile_creation_error' ||
      r.status === 'unknown_error' ||
      r.status === 'weak_password'
    ) {
      return [
        {
          label: 'Tentar novamente',
          action: () => this.limparResultado(),
        },
      ];
    }

    return [];
  }

  limparResultado(): void {
    this.resultado = null;
    this.erros = {};
  }

  private calcularIdade(dataNascimento: string): number {
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const mesAtual = hoje.getMonth();
    const mesNascimento = nascimento.getMonth();
    if (
      mesAtual < mesNascimento ||
      (mesAtual === mesNascimento && hoje.getDate() < nascimento.getDate())
    ) {
      idade--;
    }
    return idade;
  }

  private validarTelefone(telefone: string): boolean {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    return telefoneLimpo.length >= 10 && telefoneLimpo.length <= 11;
  }

  atualizarCorData(): void {
    const input = document.querySelector(
      'input[name="dataNascimento"]',
    ) as HTMLInputElement | null;
    if (input) {
      input.style.color = input.value ? '#fff' : 'rgba(255, 255, 255, 0.4)';
    }
  }

  /**
   * Valida todos os campos do formulário, populando `erros` com mensagens
   * específicas por campo. Retorna `false` quando há erros para corrigir.
   */
  private validarFormulario(): boolean {
    this.erros = {};

    const nome = this.nome.trim();
    const nomeUsuario = this.nomeUsuario.trim().replace(/^@/, '');
    const email = this.email.trim().toLowerCase();
    const telefoneLimpo = this.telefone.replace(/\D/g, '');

    if (!nome) {
      this.erros['nome'] = 'Informe seu nome.';
    }

    if (!nomeUsuario) {
      this.erros['nomeUsuario'] = 'Informe seu nome de usuário.';
    } else if (!/^[a-zA-Z0-9_.]{3,24}$/.test(nomeUsuario)) {
      this.erros['nomeUsuario'] =
        'Nome de usuário inválido. Use de 3 a 24 caracteres: letras, números, _ ou .';
    }

    if (!email) {
      this.erros['email'] = 'Informe seu e-mail.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.erros['email'] = 'Formato de e-mail inválido.';
    }

    if (!this.dataNascimento) {
      this.erros['dataNascimento'] = 'Informe sua data de nascimento.';
    } else {
      const nascimento = new Date(`${this.dataNascimento}T00:00:00`);
      const hoje = new Date();

      if (
        !Number.isFinite(nascimento.getTime()) ||
        nascimento > hoje
      ) {
        this.erros['dataNascimento'] = 'Data de nascimento inválida.';
      } else if (this.calcularIdade(this.dataNascimento) < 13) {
        this.erros['dataNascimento'] =
          'Você deve ter pelo menos 13 anos para se cadastrar.';
      }
    }

    if (!this.genero) {
      this.erros['genero'] = 'Selecione uma opção de gênero.';
    }

    if (!telefoneLimpo) {
      this.erros['telefone'] = 'Informe seu telefone.';
    } else if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
      this.erros['telefone'] =
        'Telefone inválido. Use o formato (DD) 99999-9999 ou (DD) 9999-9999.';
    }

    if (!this.senha) {
      this.erros['senha'] = 'Informe uma senha.';
    } else if (this.senha.length < 6) {
      this.erros['senha'] = 'A senha precisa ter no mínimo 6 caracteres.';
    }

    if (!this.confirmarSenha) {
      this.erros['confirmarSenha'] = 'Confirme sua senha.';
    } else if (this.senha !== this.confirmarSenha) {
      this.erros['confirmarSenha'] = 'As senhas não conferem.';
    }

    if (this.tipoUsuario === 'Artista' && !this.nomeArtistico.trim()) {
      this.erros['nomeArtistico'] =
        'Nome artístico é obrigatório para contas de artista.';
    }

    return Object.keys(this.erros).length === 0;
  }

  /** Foca visualmente o primeiro campo com erro para acessibilidade. */
  private focarPrimeiroErro(): void {
    const ordemCampos = [
      'nome',
      'nomeUsuario',
      'email',
      'dataNascimento',
      'genero',
      'telefone',
      'nomeArtistico',
      'senha',
      'confirmarSenha',
    ];

    const campo = ordemCampos.find((c) => !!this.erros[c]);
    if (!campo) return;

    const input = document.querySelector(
      `input[name="${campo}"]`,
    ) as HTMLInputElement | null;
    input?.focus();
  }

  async criarConta(): Promise<void> {
    this.limparResultado();

    if (!this.validarFormulario()) {
      this.focarPrimeiroErro();
      return;
    }

    this.carregando = true;

    try {
      this.resultado = await this.auth.registrar({
        nome: this.nome,
        nomeArtistico: this.nomeArtistico,
        nomeUsuario: this.nomeUsuario,
        email: this.email.trim().toLowerCase(),
        senha: this.senha,
        tipoUsuario: this.tipoUsuario,
        dataNascimento: this.dataNascimento,
        genero: this.genero,
        telefone: this.telefone,
      });

    } catch (error) {
      console.error('Erro ao criar conta:', error);
      this.resultado = {
        status: 'unknown_error',
        message:
          'Não foi possível concluir seu cadastro agora. Confira sua conexão e tente novamente.',
      };
    } finally {
      this.carregando = false;

	 if (this.resultado?.status === 'confirmation_required') {
    alert(
      'E-mail de verificação enviado! Confira sua caixa de entrada para confirmar sua conta.'
    );
  }
    }
  }

  async reenviarConfirmacao(): Promise<void> {
    const email = this.emailConfirmacao();
    if (!email || this.reenviando) return;

    this.reenviando = true;
    this.feedbackReenvio = null;

    try {
      const res = await this.auth.reenviarConfirmacaoEmail(email);

      if (res.status === 'sent') {
        this.feedbackReenvio = {
          mensagem:
            'E-mail de confirmação reenviado com sucesso. Verifique sua caixa de entrada e a pasta de spam.',
          ehErro: false,
        };
      } else if (res.status === 'rate_limited') {
        this.feedbackReenvio = {
          mensagem:
            'Você realizou muitas tentativas de confirmação. Aguarde um pouco antes de tentar novamente.',
          ehErro: true,
        };
      } else {
        this.feedbackReenvio = { mensagem: res.message, ehErro: true };
      }
    } catch (error) {
      console.error('Erro ao reenviar confirmação:', error);
      this.feedbackReenvio = {
        mensagem:
          'Não foi possível reenviar a confirmação agora. Tente novamente em instantes.',
        ehErro: true,
      };
    } finally {
      this.reenviando = false;
    }
  }

  irParaLogin(): void {
    void this.router.navigate(['/']);
  }
}
