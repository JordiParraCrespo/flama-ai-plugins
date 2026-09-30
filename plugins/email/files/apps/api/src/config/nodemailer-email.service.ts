import {
  EmailService,
  type EmailVerificationEmailParams,
  type InvitationEmailParams,
  type PasswordResetEmailParams,
  renderEmailVerificationEmail,
  renderInvitationEmail,
  renderPasswordResetEmail,
  renderWelcomeEmail,
  type WelcomeEmailParams,
} from '@flama/backend-email';
import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NodemailerEmailService extends EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    super();
    const port = this.configService.get<number>('smtp.port');
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('smtp.host'),
      port,
      // 465 speaks TLS from the first byte; other ports upgrade with STARTTLS
      // when the server offers it.
      secure: port === 465,
      // A relay that trusts the sender's network takes no credentials, and
      // blank ones would make nodemailer try to log in anyway.
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async sendPasswordReset(to: string, params: PasswordResetEmailParams): Promise<void> {
    const html = await renderPasswordResetEmail(params);
    await this.transporter.sendMail({
      from: this.configService.get('email.from'),
      to,
      subject: params.subject,
      html,
    });
  }

  async sendEmailVerification(to: string, params: EmailVerificationEmailParams): Promise<void> {
    const html = await renderEmailVerificationEmail(params);
    await this.transporter.sendMail({
      from: this.configService.get('email.from'),
      to,
      subject: params.subject,
      html,
    });
  }

  async sendWelcome(to: string, params: WelcomeEmailParams): Promise<void> {
    const html = await renderWelcomeEmail(params);
    await this.transporter.sendMail({
      from: this.configService.get('email.from'),
      to,
      subject: params.subject,
      html,
    });
  }

  async sendInvitation(to: string, params: InvitationEmailParams): Promise<void> {
    const html = await renderInvitationEmail(params);
    await this.transporter.sendMail({
      from: this.configService.get('email.from'),
      to,
      subject: params.subject,
      html,
    });
  }
}
