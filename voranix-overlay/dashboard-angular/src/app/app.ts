import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type OverlayCommand = {
  trigger: string;
  type: string;
  title: string;
  message: string;
  durationMs: number;
};

type Sponsor = {
  name: string;
  message: string;
  logoUrl: string;
};

type ChannelPayload = {
  channelId: string;
  twitchChannel: string;
  branding: {
    communityName: string;
    logoText: string;
    accent: string;
    secondaryAccent: string;
    logoUrl: string;
    persistentMessage: string;
    tickerText: string;
  };
  sponsors: Sponsor[];
  commands: OverlayCommand[];
};

type SessionPayload = {
  authenticated: boolean;
  user?: {
    id: number;
    login: string;
    displayName: string;
    email: string;
    profileImageUrl: string;
    role: 'admin' | 'streamer';
  };
  channels?: ChannelPayload[];
};

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly http = inject(HttpClient);

  apiBase = this.getInitialApiBase();
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly sessionLoading = signal(false);
  readonly message = signal('API lista para configurar overlays Voranix.');
  readonly session = signal<SessionPayload>({ authenticated: false });

  channel: ChannelPayload = this.createEmptyChannel();

  constructor() {
    this.loadSession();
  }

  createEmptyChannel(): ChannelPayload {
    return {
      channelId: 'voranix',
      twitchChannel: 'voranix',
      branding: {
        communityName: 'Comunidad Voranix',
        logoText: 'VORANIX',
        accent: '#f97316',
        secondaryAccent: '#22c55e',
        logoUrl: '',
        persistentMessage: 'Patrocinadores, eventos y anuncios oficiales de la comunidad.',
        tickerText: 'Sigue las novedades de Voranix en directo.'
      },
      sponsors: [
        {
          name: 'Patrocinador Principal',
          message: 'Apoya a quienes impulsan la comunidad Voranix.',
          logoUrl: ''
        }
      ],
      commands: [
        {
          trigger: '!promo',
          type: 'promo',
          title: 'Promo Voranix',
          message: 'Visita a nuestros patrocinadores oficiales y apoya la comunidad.',
          durationMs: 7000
        }
      ]
    };
  }

  loadChannel(): void {
    if (!this.session().authenticated) {
      this.message.set('Inicia sesion con Twitch para administrar un canal.');
      return;
    }

    this.loading.set(true);
    this.persistApiBase();
    const url = `${this.baseUrl()}/api/channels/${encodeURIComponent(this.channel.channelId)}`;

    this.http.get<ChannelPayload>(url, { withCredentials: true }).subscribe({
      next: (response) => {
        this.channel = response;
        this.loading.set(false);
        this.message.set('Canal cargado correctamente.');
      },
      error: () => {
        this.loading.set(false);
        this.message.set('No se pudo cargar el canal. Revisa la API y el channelId.');
      }
    });
  }

  saveChannel(): void {
    if (!this.session().authenticated) {
      this.message.set('Debes iniciar sesion antes de guardar.');
      return;
    }

    this.saving.set(true);
    this.persistApiBase();
    const url = `${this.baseUrl()}/api/channels/${encodeURIComponent(this.channel.channelId)}`;

    this.http.put<ChannelPayload>(url, this.channel, { withCredentials: true }).subscribe({
      next: (response) => {
        this.channel = response;
        this.saving.set(false);
        this.message.set('Configuracion guardada y enviada al overlay.');
      },
      error: () => {
        this.saving.set(false);
        this.message.set('No se pudo guardar la configuracion.');
      }
    });
  }

  trigger(type: string): void {
    const command =
      this.channel.commands.find((item) => item.type === type) || this.channel.commands[0];

    if (!command) {
      this.message.set('Agrega al menos un comando antes de probar.');
      return;
    }

    const url = `${this.baseUrl()}/api/channels/${encodeURIComponent(this.channel.channelId)}/trigger`;
    this.http
      .post(url, {
        type,
        title: command.title,
        message: command.message,
        durationMs: command.durationMs
      }, {
        withCredentials: true
      })
      .subscribe({
        next: () => {
          this.message.set(`Prueba ${type} enviada al overlay.`);
        },
        error: () => {
          this.message.set('No se pudo disparar la prueba.');
        }
      });
  }

  addCommand(): void {
    this.channel.commands.push({
      trigger: '!nuevo',
      type: 'promo',
      title: 'Nuevo comando',
      message: 'Mensaje para el overlay',
      durationMs: 7000
    });
  }

  removeCommand(index: number): void {
    this.channel.commands.splice(index, 1);
  }

  addSponsor(): void {
    this.channel.sponsors.push({
      name: 'Nuevo sponsor',
      message: 'Mensaje destacado para sponsor.',
      logoUrl: ''
    });
  }

  removeSponsor(index: number): void {
    this.channel.sponsors.splice(index, 1);
  }

  loadSession(): void {
    this.sessionLoading.set(true);
    this.persistApiBase();
    this.http
      .get<SessionPayload>(`${this.baseUrl()}/api/auth/me`, { withCredentials: true })
      .subscribe({
        next: (response) => {
          this.session.set(response);
          this.sessionLoading.set(false);

          if (response.authenticated && response.channels?.length) {
            this.channel = response.channels[0];
            this.message.set(`Sesion activa como ${response.user?.displayName}.`);
          } else {
            this.message.set('Inicia sesion con Twitch para continuar.');
          }
        },
        error: () => {
          this.sessionLoading.set(false);
          this.message.set('No se pudo validar la sesion actual.');
        }
      });
  }

  loginUrl(): string {
    this.persistApiBase();
    return `${this.baseUrl()}/api/auth/twitch/start`;
  }

  logout(): void {
    this.http
      .post(`${this.baseUrl()}/api/auth/logout`, {}, { withCredentials: true })
      .subscribe(() => {
        this.session.set({ authenticated: false });
        this.channel = this.createEmptyChannel();
        this.message.set('Sesion cerrada.');
      });
  }

  setActiveChannel(channelId: string): void {
    this.channel.channelId = channelId;
    this.loadChannel();
  }

  isAdmin(): boolean {
    return this.session().user?.role === 'admin';
  }

  overlayUrl(): string {
    return `${this.baseUrl()}/overlay/?channel=${encodeURIComponent(this.channel.channelId)}`;
  }

  saveApiBase(): void {
    this.persistApiBase();
    this.message.set('URL de la API guardada en este navegador.');
    this.loadSession();
  }

  private getInitialApiBase(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:3000';
    }

    const saved = window.localStorage.getItem('voranix_api_base');
    if (saved) {
      return saved;
    }

    const currentOrigin = window.location.origin;
    return currentOrigin.includes('localhost') ? 'http://localhost:3000' : currentOrigin;
  }

  private persistApiBase(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('voranix_api_base', this.baseUrl());
    }
  }

  private baseUrl(): string {
    return this.apiBase.replace(/\/$/, '');
  }
}
