import type { BetaUser, UserSession } from '../domain/beta';

export class LocalDevAuthProvider {
  private currentUser: BetaUser = {
    id: 'local_dev_user',
    email: 'dev@artecheck.local',
    displayName: 'Engenheiro Gráfico',
    companyName: 'Gráfica Modelo',
    role: 'developer',
  };

  async getCurrentUser(): Promise<BetaUser | null> {
    return this.currentUser;
  }

  async getSession(): Promise<UserSession | null> {
    return {
      user: this.currentUser,
      accessToken: 'local_dev_token',
    };
  }

  async signIn(email: string, _password?: string): Promise<UserSession> {
    this.currentUser = {
      id: `user_${Date.now()}`,
      email,
      displayName: email.split('@')[0],
      role: 'authenticated',
    };
    return {
      user: this.currentUser,
      accessToken: 'local_dev_token',
    };
  }

  async signUp(
    email: string,
    _password?: string,
    displayName?: string,
    companyName?: string
  ): Promise<UserSession> {
    this.currentUser = {
      id: `user_${Date.now()}`,
      email,
      displayName: displayName || email.split('@')[0],
      companyName,
      role: 'authenticated',
    };
    return {
      user: this.currentUser,
      accessToken: 'local_dev_token',
    };
  }

  async signOut(): Promise<void> {
    this.currentUser = {
      id: 'local_dev_user',
      email: 'dev@artecheck.local',
      displayName: 'Engenheiro Gráfico',
      role: 'developer',
    };
  }
}
