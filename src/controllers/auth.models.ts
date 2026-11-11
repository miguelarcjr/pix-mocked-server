import { ApiProperty } from "@nestjs/swagger"

export class ValidateInput {
    @ApiProperty({ description: 'Tipo de autenticação', example: 'client_credentials' })
    grant_type: string
    @ApiProperty({ description: 'Id do assinante (alternativamente via header Authorization: Basic)', example: '123', required: false })
    client_id?: string
    @ApiProperty({ description: 'Senha do assinante (alternativamente via header Authorization: Basic)', example: 'abc', required: false })
    client_secret?: string
    @ApiProperty({ description: 'Escopos solicitados, separados por espaço. Se omitido, todos os escopos são concedidos.', example: 'cob.write cob.read pix.read', required: false })
    scope?: string
}

export class TokenResponse {
    @ApiProperty({ description: 'Token de acesso. Neste mock deve ser enviado no header `mocked-token`.', example: '123-abc' })
    access_token: string
    @ApiProperty({ example: 'Bearer' })
    token_type: 'Bearer'
    @ApiProperty({ description: 'Validade do token em segundos', example: 300 })
    expires_in: number
    @ApiProperty({ description: 'Escopos concedidos, separados por espaço', example: 'cob.write cob.read' })
    scope: string
}
