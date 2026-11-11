import "reflect-metadata"
import { IsDateString, IsEmail, IsIn, IsNotEmpty, Matches, MaxLength, Min, ValidateNested } from "class-validator"
import { Type } from "class-transformer"
import { IsCNPJValid, IsCPFValid, IsDICTExists, IsDICTValid, NotPast } from "../../validators/custom-validators"


export class PixID {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    txid: string
}

export class PixKey extends PixID {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    IdOwner: string
}

export class PixRevisao {
    revisao: number
}


export enum ModalidadeAlteracao {
    NaoEditavel = 0,
    Editavel = 1
}

export enum TipoConta {
    Corrente = "CORRENTE",
    Poupanca = "POUPANCA",
    Pagamento = "PAGAMENTO"
}

export class DadosConta {
    @MaxLength(4, { message: 'O campo $$ não respeita o schema.' })
    agencia: string
    @MaxLength(20, { message: 'O campo $$ não respeita o schema.' })    
    conta: string
    tipoConta: TipoConta
}

export interface ICriacao {
    criacao: string
}

export class Expiracao {
    @Min(1, { message: 'O campo $$ é igual ou menor que zero.' })
    expiracao: number
}

export class Vencimento {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    @NotPast({ message: 'O campo $$ é anterior à data de criação da cobrança.' })
    dataDeVencimento: string
}

export class ValidadeVencimento extends Vencimento {
    @Min(0, { message: 'O campo $$ não respeita o schema.' })
    validadeAposVencimento: number
}

export class DadosPessoa {
    @IsEmail({}, { message: 'O campo $$ não respeita o schema.' })
    email?: string
    @MaxLength(200, { message: 'O campo $$ não respeita o schema.' })
    logradouro: string
    @MaxLength(200, { message: 'O campo $$ não respeita o schema.' })
    cidade: string
    @MaxLength(2, { message: 'O campo $$ não respeita o schema.' })
    uf: string
    @MaxLength(8, { message: 'O campo $$ não respeita o schema.' })
    cep: string
}

export class Pessoa extends DadosPessoa {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @MaxLength(200, { message: 'O campo $$ não respeita o schema.' })
    nome: string
    @IsCNPJValid({ message: 'O campo $$ não respeita o schema.' })
    cnpj?: string
    @IsCPFValid({ message: 'O campo $$ não respeita o schema.' })
    cpf?: string
}


export interface IInfoAdicional {
    nome: string,
    valor: string
}


export enum Situacao {
    Removida = "REMOVIDA_PELO_USUARIO_RECEBEDOR",
    Ativa = "ATIVA",
    Concluida = "CONCLUIDA",
    RemovidaPSP = "REMOVIDA_PELO_PSP"
}

export enum ModalidadeMulta {
    ValorFixo = 1,
    Percentual = 2
}

export enum ModalidadeJurosDiasCorridos {
    Valor = 1,
    PercentualAD = 2,
    PercentualAM = 3,
    PercentualAA = 4
}

export enum ModalidadeJurosDiasUteis {
    Valor = 5,
    PercentualAD = 6,
    PercentualAM = 7,
    PercentualAA = 8
}

export enum ModalidadeDesconto {
    ValorFixoDatas = 1,
    PercentualData = 2,
    ValorDiaCorrido = 3,
    ValorDiaUtil = 4,
    PercentualDiaCorrido = 5,
    PercentualDiaUtil = 6,
}


export enum ModalidadeAbatimento {
    ValorFixo = 1,
    Percentual = 2
}

export interface IAditivo {
    valorPerc: string
}

export interface IMulta extends IAditivo {
    modalidade: ModalidadeMulta
}

export interface IJuros extends IAditivo {
    modalidade: ModalidadeJurosDiasCorridos | ModalidadeJurosDiasUteis
}

export interface IDescontoData extends IAditivo {
    data: string
}

export interface IDesconto extends IDescontoData {
    modalidade: ModalidadeDesconto,
    descontoDataFixa?: { valorPerc: string } | IDescontoData[],

}

export interface IAbatimento extends IAditivo {
    modalidade: ModalidadeAbatimento
}


export enum TipoCob {
    imediato = "cob",
    vencimento = "cobv"
}


export class Chave {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDICTValid({ message: 'O campo $$ não respeita o schema.' })
    @IsDICTExists({ message: 'O campo $$ corresponde a uma conta que não pertence a este usuário recebedor.' })
    chave: string
}

export class PixRequest<T> extends PixKey {
    data: T
}


export interface IViolacoes {
    razao: string,
    propriedade: string,
    valor: string
}



export interface IServerError {
    type: string,
    title: string,
    status: number,
    detail: string,
    correlationId: string,
    violacoes: IViolacoes[]
}

export class WebHookResponse extends Chave {
    webhookUrl: string
    criacao: string
}

export interface IPaginator {
    parametros: {
        inicio: string,
        fim: string,
        paginacao: {
            paginaAtual: number,
            itensPorPagina: number,
            quantidadeDePaginas: number,
            quantidadeTotalDeItens: number
        }
    }
}

export enum ModalidadeAgente {
    EstabelecimentoComercial = "AGTEC",
    OutraEspeciePJ = "AGTOT",
    /** Em desuso. Utilizar AGFSS. */
    PrestadorServicoSaque = "AGPSS",
    FacilitadorServicoSaque = "AGFSS"
}

export const VALOR_PATTERN = /^\d{1,10}\.\d{2}$/;

export class DetalheRetirada {
    @Matches(VALOR_PATTERN, { message: 'O campo $$ não respeita o schema.' })
    valor: string
    @IsIn([0, 1], { message: 'O campo $$ não respeita o schema.' })
    modalidadeAlteracao?: ModalidadeAlteracao
    @IsIn(Object.values(ModalidadeAgente), { message: 'O campo $$ não respeita o schema.' })
    modalidadeAgente: ModalidadeAgente
    @Matches(/^[0-9A-Z]{8}$/, { message: 'O campo $$ não respeita o schema.' })
    prestadorDoServicoDeSaque: string
}

export class RetiradaPix {
    @ValidateNested()
    @Type(() => DetalheRetirada)
    saque?: DetalheRetirada
    @ValidateNested()
    @Type(() => DetalheRetirada)
    troco?: DetalheRetirada
}
