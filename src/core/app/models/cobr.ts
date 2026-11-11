import { IsBoolean, IsIn, IsNotEmpty, IsNotEmptyObject, IsNumberString, Matches, MaxLength, ValidateNested } from "class-validator"
import { VALOR_PATTERN, RetiradaPix, Chave, ICriacao, Expiracao, IInfoAdicional, Pessoa, PixID, ModalidadeAlteracao, Situacao, PixRevisao, Vencimento, DadosPessoa, DadosConta } from "../models"
import { Type } from "class-transformer"
import { IntersectionType } from '@nestjs/swagger';
import { IsCNPJValid, IsCPFValid, IsDICTExists, IsDICTValid, MinStringNumber } from "../../../validators/custom-validators";
import { LocID, LocGetRequest } from "./loc";
import { PoliticaRetentativa } from "./rec";

/** 	
Todos os campos que indicam valores monetários obedecem ao pattern \d{1,10}.\d{2}. O separador decimal é o caractere ponto. Não é aplicável utilizar separador de milhar. Exemplos de valores aderentes ao padrão: “1.00”, “123.99”, “123456789.23" */
export class Valor {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsNumberString({}, { message: 'O campo $$ não respeita o schema.' })
    @MinStringNumber(0.01, { message: 'O campo $$ é zero.' })
    original: string
}

export class Alteracao {
    /** Trata-se de um campo que determina se o valor final do documento pode ser alterado pelo pagador. Na ausência desse campo, assume-se que não se pode alterar o valor do documento de cobrança, ou seja, assume-se o valor 0. Se o campo estiver presente e com valor 1, então está determinado que o valor final da cobrança pode ter seu valor alterado pelo pagador. */
    modalidadeAlteracao?: ModalidadeAlteracao
}

export class Retirada {
    @ValidateNested()
    @Type(() => RetiradaPix)
    retirada?: RetiradaPix
}


export enum StatusCobR {
    Criada = "CRIADA",
    Ativa = "ATIVA",
    Concluida = "CONCLUIDA",
    Expirada = "EXPIRADA",
    Rejeitada = "REJEITADA",
    Cancelada = "CANCELADA"
}

export enum TipoTentativa {
    Agendada = "AGND",
    NaoAgendada = "NTAG",
    RetentativaIntradia = "RIFL"
}

export enum StatusTentativa {
    Solicitada = "SOLICITADA",
    Agendada = "AGENDADA",
    Paga = "PAGA",
    Cancelada = "CANCELADA",
    Rejeitada = "REJEITADA",
    Expirada = "EXPIRADA"
}

export class CobRValorOriginal {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @Matches(VALOR_PATTERN, { message: 'O campo $$ não respeita o schema.' })
    @MinStringNumber(0.01, { message: 'O campo $$ é zero.' })
    original: string
}


export class CobRGetResponse implements  PixID {
    idrec: string
    txid: string

    calendario: {
        dataCriacao: string,
        dataVencimento: string
    }
    valor:string
    status: StatusCobR
    politicaRetentativa: PoliticaRetentativa
    
    loc: LocGetRequest
    location: string
    devedor: Pessoa
    solicitacaoPagador: string
    infoAdicionais: IInfoAdicional[]
}

export class CobRValor extends IntersectionType(Valor, Alteracao, Retirada)
{

}



export class CobRPutRequest {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    idRec: string
    @MaxLength(140, { message: 'O campo $$ não respeita o schema.' })
    infoAdicional: string
    @ValidateNested({})
    @Type(() => Vencimento)
    calendario: Vencimento

    @ValidateNested({})
    @Type(() => DadosPessoa)
    dadosDevedor: DadosPessoa
    @ValidateNested({})
    @Type(() => DadosConta)
    contaRecebedor: DadosConta

    @ValidateNested({})
    @Type(() => CobRValorOriginal)
    valor?: CobRValorOriginal

    @IsBoolean({ message: 'O campo $$ não respeita o schema.' })
    ajusteDiaUtil?: boolean

    @ValidateNested({})
    @Type(() => Pessoa)
    devedor?: Pessoa
}

export class CobRPatchRequest {
    @ValidateNested({})
    @Type(() => LocID)
    loc?: LocID
    @ValidateNested({})
    @Type(() => CobRValor)
    valor?: CobRValor
    @ValidateNested()
    @Type(() => Expiracao)
    calendario?: Expiracao
    @ValidateNested({})
    @Type(() => Pessoa)
    devedor?: Pessoa
    solicitacaoPagador?: string
    @IsIn([StatusCobR.Cancelada], { message: 'O campo $$ não respeita o schema.' })
    status?: StatusCobR.Cancelada
}

export class CobRPatchResponse extends CobRGetResponse {

}


export class CobRPutResponse extends CobRGetResponse {

}

export interface ICobRPatchResponse extends CobRGetResponse {

}


export interface ICobRQueryRequest {
    inicio: string,
    fim: string,
    cpf?: string,
    cnpj?: string,
    locationPresente?: boolean,
    status: string,
    paginacao: {
        paginaAtual: number,
        itensPorPagina: number
    }
}

export interface ICobRQueryResponse {
    parametros: {
        inicio: string,
        fim: string,
        paginacao: {
            paginaAtual: number,
            itensPorPagina: number,
            quantidadeDePaginas: number,
            quantidadeTotalDeItens: number
        }
    },
    cobsr: { $ref: string }[]
}

export class CobRGetFilter {
    inicio: string
    fim: string
    @IsCPFValid({ message: 'O campo $$ não respeita o schema.' })
    cpf?: string
    @IsCNPJValid({ message: 'O campo $$ não respeita o schema.' })
    cnpj?: string
    paginacao?: { paginaAtual: number, itensPorPagina: number }
    status?: StatusCobR
    idRec?: string
    convenio?: string
}