import { DocumentBuilder } from '@nestjs/swagger';

export const swaggerAppConfig = new DocumentBuilder()
  .setTitle('PIX Mocked Server - API Principal')
  .setDescription('API mockada do PIX seguindo as especificações do Banco Central do Brasil')
  .setVersion('1.0')
  .setExternalDoc('Documentação Oficial PIX', 'https://bacen.github.io/pix-api/')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
    'access-token',
  )
  .addApiKey({ type: 'apiKey', in: 'header', name: 'mocked-token', description: 'Token obtido no serviço de autenticação (access_token).' }, 'mocked-token')
  .addTag('cob', 'Cobranças imediatas. Cancelamento via PATCH com status REMOVIDA_PELO_USUARIO_RECEBEDOR.')
  .addTag('cobv', 'Cobranças com vencimento.')
  .addTag('cobr', 'Cobranças recorrentes (Pix Automático), incluindo retentativas.')
  .addTag('lotecobv', 'Lotes de cobranças com vencimento.')
  .addTag('loc', 'Gerenciamento de locations de payload.')
  .addTag('rec', 'Recorrências (Pix Automático).')
  .addTag('solicrec', 'Solicitações de confirmação de recorrência. Cancelamento via PATCH com status CANCELADA.')
  .addTag('pix', 'Consulta de Pix recebidos e devoluções.')
  .addTag('webhook', 'Configuração de webhooks por chave Pix. Notificações são enviadas via POST em {webhookUrl}/pix.')
  .addTag('payloadlocation', 'Endpoints públicos: payload JSON (GET /qr/{uuid}) e BR Code (GET /payloadlocation/{uuid}). Domínio configurável via PIX_LOCATION_DOMAIN.')
  .addTag('Mock', 'Recursos exclusivos do mock, fora da spec BACEN (ex.: simulação de pagamento).')
  .addServer('http://localhost:3000', 'Servidor de Desenvolvimento')
  .build();