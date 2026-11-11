import { DocumentBuilder } from '@nestjs/swagger';
import { PIX_SCOPES } from './core/auth/scopes';

export const swaggerAuthConfig = new DocumentBuilder()
  .setTitle('PIX Mocked Server - Autenticação')
  .setDescription('Serviço de autenticação OAuth2 para o PIX Mocked Server')
  .setVersion('1.0')
  .addOAuth2(
    {
      type: 'oauth2',
      flows: {
        clientCredentials: {
          tokenUrl: '/auth',
          scopes: PIX_SCOPES,
        },
      },
    },
    'oauth2',
  )
  .addTag('auth', 'Emissão de token OAuth2 (client_credentials). Resposta: access_token, token_type, expires_in, scope.')
  .addServer('http://localhost:3001', 'Servidor de Autenticação')
  .build();