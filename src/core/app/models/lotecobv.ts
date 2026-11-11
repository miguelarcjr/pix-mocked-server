import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, MaxLength } from "class-validator"

export enum StatusCobVLote {
    EmProcessamento = "EM_PROCESSAMENTO",
    Criada = "CRIADA",
    Negada = "NEGADA"
}

export class LoteCobVRequest {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @MaxLength(140, { message: 'O campo $$ não respeita o schema.' })
    descricao: string

    @IsArray({ message: 'O campo $$ não respeita o schema.' })
    @ArrayMinSize(1, { message: 'O campo $$ não respeita o schema.' })
    cobsv: ({ txid: string } & { [campo: string]: any })[]
}

export class LoteCobVPatchRequest {
    @MaxLength(140, { message: 'O campo $$ não respeita o schema.' })
    descricao?: string

    @IsArray({ message: 'O campo $$ não respeita o schema.' })
    cobsv?: ({ txid: string } & { [campo: string]: any })[]
}

export interface ICobVLote {
    txid: string
    status: StatusCobVLote
    problema?: { type: string, title: string, status: number, detail?: string, violacoes?: { razao: string, propriedade: string }[] }
    criacao: string
}

export interface ILoteCobV {
    id: number | string
    descricao: string
    criacao: string
    cobsv: ICobVLote[]
}

export class LoteCobVGetFilter {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    inicio: string
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    fim: string
    paginacao?: { paginaAtual: number, itensPorPagina: number }
}
