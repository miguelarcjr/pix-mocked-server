import { IsDateString, IsDefined, IsIn, IsNotEmpty, IsNotEmptyObject, Matches, MaxLength, ValidateNested } from "class-validator"
import { Type } from "class-transformer"
import { IsCNPJValid, IsCPFValid, NotPast } from "../../../validators/custom-validators"

export enum StatusSolicRec {
    Criada = "CRIADA",
    Enviada = "ENVIADA",
    Recebida = "RECEBIDA",
    Rejeitada = "REJEITADA",
    Aceita = "ACEITA",
    Expirada = "EXPIRADA",
    Cancelada = "CANCELADA"
}

export class SolicRecCalendario {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    @NotPast({ message: 'O campo $$ é anterior à data de criação da solicitação.' })
    dataExpiracaoSolicitacao: string
}

export class SolicRecDestinatario {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @MaxLength(20, { message: 'O campo $$ não respeita o schema.' })
    conta: string
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @Matches(/^[0-9]{8}$/, { message: 'O campo $$ não respeita o schema.' })
    ispbParticipante: string
    @MaxLength(4, { message: 'O campo $$ não respeita o schema.' })
    agencia?: string
    @IsCPFValid({ message: 'O campo $$ não respeita o schema.' })
    cpf?: string
    @IsCNPJValid({ message: 'O campo $$ não respeita o schema.' })
    cnpj?: string
}

export class SolicRecPostRequest {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @Matches(/^[RC][RN]\w{8}\d{8}\w{11}$/, { message: 'O campo $$ não respeita o schema.' })
    idRec: string

    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested()
    @Type(() => SolicRecCalendario)
    calendario: SolicRecCalendario

    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested()
    @Type(() => SolicRecDestinatario)
    destinatario: SolicRecDestinatario
}

export class SolicRecPatchRequest {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsIn([StatusSolicRec.Cancelada], { message: 'O campo $$ não respeita o schema.' })
    status: StatusSolicRec.Cancelada
}
