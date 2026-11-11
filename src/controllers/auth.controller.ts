import { BadRequestException, Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../core/auth/auth";
import { PIX_SCOPES } from "../core/auth/scopes";
import { TokenResponse, ValidateInput } from "./auth.models";

const EXPIRES_IN = 300; //5 min

@Controller("auth")
@ApiTags("auth")
export class AuthController {
    constructor(private readonly authService: Auth) { }

    /** OAuth2 client_credentials (RFC 6749 §4.4). Credenciais via body ou header `Authorization: Basic`. */
    @Post()
    @HttpCode(200)
    async validate(@Body() credentials: ValidateInput, @Headers('authorization') authorization?: string): Promise<TokenResponse> {
        if (credentials?.grant_type != 'client_credentials') {
            throw new BadRequestException({ error: 'unsupported_grant_type', error_description: 'Apenas o grant_type client_credentials é suportado.' });
        }

        let { client_id, client_secret } = credentials;
        if ((!client_id || !client_secret) && /^Basic /i.test(authorization || '')) {
            [client_id, client_secret] = Buffer.from(authorization.substring(6), 'base64').toString().split(':');
        }

        const requested = (credentials.scope || '').split(' ').filter(Boolean);
        const invalid = requested.filter(s => !PIX_SCOPES[s]);
        if (invalid.length) {
            throw new BadRequestException({ error: 'invalid_scope', error_description: `Escopo(s) inválido(s): ${invalid.join(' ')}` });
        }

        let access_token: string;
        try {
            access_token = await this.authService.validate(client_id, client_secret);
        }
        catch {
            throw new UnauthorizedException({ error: 'invalid_client', error_description: 'Credenciais inválidas.' });
        }

        return {
            access_token,
            token_type: 'Bearer',
            expires_in: EXPIRES_IN,
            scope: (requested.length ? requested : Object.keys(PIX_SCOPES)).join(' ')
        };
    }
}
