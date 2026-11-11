import { IsDateString, IsNotEmpty, IsUrl } from "class-validator"

export class WebhookPutRequest {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }, { message: 'O campo $$ não respeita o schema.' })
    webhookUrl: string
}

export interface IWebhook {
    webhookUrl: string
    chave: string
    criacao: string
}

export class WebhookGetFilter {
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    inicio?: string
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    fim?: string
    paginacao?: { paginaAtual: number, itensPorPagina: number }
}
