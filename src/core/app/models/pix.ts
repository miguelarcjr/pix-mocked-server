import { IsDateString, IsEnum, IsIn, IsNotEmpty, Matches, MaxLength, ValidateNested } from "class-validator"
import { Type } from "class-transformer"
import { IsCNPJValid, IsCPFValid } from "../../../validators/custom-validators"
import { Pessoa, VALOR_PATTERN } from "../models"

export enum NaturezaDevolucao {
    Original = "ORIGINAL",
    Retirada = "RETIRADA"
}

export enum StatusDevolucao {
    EmProcessamento = "EM_PROCESSAMENTO",
    Devolvido = "DEVOLVIDO",
    NaoRealizado = "NAO_REALIZADO"
}

export class DevolucaoPutRequest {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @Matches(VALOR_PATTERN, { message: 'O campo $$ não respeita o schema.' })
    valor: string
    @IsEnum(NaturezaDevolucao, { message: 'O campo $$ não respeita o schema.' })
    natureza?: NaturezaDevolucao
    @MaxLength(140, { message: 'O campo $$ não respeita o schema.' })
    descricao?: string
}

export interface IDevolucao {
    id: string
    rtrId: string
    valor: string
    natureza: NaturezaDevolucao
    descricao?: string
    horario: { solicitacao: string, liquidacao?: string }
    status: StatusDevolucao
    motivo?: string
}

export interface IPix {
    endToEndId: string
    txid?: string
    valor: string
    componentesValor: { [nome: string]: { valor: string, modalidadeAgente?: string, prestadorDoServicoDeSaque?: string } }
    chave: string
    horario: string
    infoPagador?: string
    pagador?: { nome?: string, cpf?: string, cnpj?: string }
    devolucoes: IDevolucao[]
}

export class PixGetFilter {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    inicio: string
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    fim: string
    txid?: string
    @IsIn(['true', 'false', true, false], { message: 'O campo $$ não respeita o schema.' })
    txIdPresente?: string | boolean
    @IsIn(['true', 'false', true, false], { message: 'O campo $$ não respeita o schema.' })
    devolucaoPresente?: string | boolean
    @IsCPFValid({ message: 'O campo $$ não respeita o schema.' })
    cpf?: string
    @IsCNPJValid({ message: 'O campo $$ não respeita o schema.' })
    cnpj?: string
    paginacao?: { paginaAtual: number, itensPorPagina: number }
}

/** Corpo do endpoint de simulação de pagamento (exclusivo do mock, não faz parte da spec BACEN). */
export class SimularPagamentoRequest {
    @Matches(VALOR_PATTERN, { message: 'O campo $$ não respeita o schema.' })
    valor?: string
    @MaxLength(140, { message: 'O campo $$ não respeita o schema.' })
    infoPagador?: string
    @ValidateNested()
    @Type(() => Pessoa)
    pagador?: Pessoa
}
