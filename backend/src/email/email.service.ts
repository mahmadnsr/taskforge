import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {}

  async send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const portValue = this.config.get<string>('SMTP_PORT');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM');

    if (!host || !portValue || !user || !pass || !from) {
      throw new Error(
        'Email provider is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.',
      );
    }

    const port = Number(portValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(
        'SMTP_PORT must be an integer between 1 and 65535',
      );
    }

    this.transporter ??= nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await this.transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    });
  }
}
