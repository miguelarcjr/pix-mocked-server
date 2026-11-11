import { CallHandler, ExecutionContext, Injectable, NestInterceptor, HttpException, UnauthorizedException, InternalServerErrorException, BadRequestException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { catchError, Observable, tap } from "rxjs";
import { owners } from './data/db.json'


@Injectable()
export class HttpInterceptor implements NestInterceptor {


    private handleError = (type: string, title: string, detail: string, status: number, violacoes: { razao: string, propriedade: string }[]) => (
        {
            type,
            title,
            status,
            detail,
            violacoes
        }
    )



    private ServerErrorTypes = {
        400: (prefix: string, detail: string, violacoes: { razao: string, propriedade: string }[]) => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/${prefix}OperacaoInvalida`, 'Payload Inválido', detail, 400, violacoes)),
        401: () => this.handleError("https://pix.bcb.gov.br/api/v2/error/AcessoNegado", "Acesso Negado", "Access Token inválido.", 401, []),
        403: (detail: string, violacoes: { razao: string, propriedade: string }[]) => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/AcessoNegado`, `Acesso Negado`, detail, 403, violacoes)),
        404: () => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/NaoEncontrado`, `Não Encontrado`, 'Entidade não encontrada.', 404, [])),
        503: () => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/ServicoIndisponivel`, 'Serviço Indisponível', `Serviço não está disponível no momento. Serviço solicitado pode estar em manutenção ou fora da janela de funcionamento.`, 503, [])),
    }

    private static ENDPOINTS: { [endpoint: string]: { prefix: string, detail: string } } = {
        cob: { prefix: 'Cob', detail: 'A cobrança não respeita o schema.' },
        cobv: { prefix: 'CobV', detail: 'A cobrança não respeita o schema.' },
        cobr: { prefix: 'CobR', detail: 'A cobrança recorrente não respeita o schema.' },
        loc: { prefix: 'Location', detail: 'O Location não respeita o schema.' },
        rec: { prefix: 'Rec', detail: 'A recorrência não respeita o schema.' },
        solicrec: { prefix: 'SolicRec', detail: 'A solicitação de recorrência não respeita o schema.' },
        lotecobv: { prefix: 'LoteCobV', detail: 'O lote de cobranças não respeita o schema.' },
        pix: { prefix: 'Pix', detail: 'A requisição não respeita o schema.' },
        webhook: { prefix: 'Webhook', detail: 'O webhook não respeita o schema.' },
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<void> {
        const request = context.switchToHttp().getRequest();
        const token = request.headers['mocked-token'];

        const own = token ? owners.find(f => f.token === token) : undefined;

        if (own) {
            request.headers['IdOwner'] = own.id;

            return next.handle().pipe(
                tap((res) => {
                    if (((request.method === 'GET' || request.method === 'PATCH' || request.method === 'DELETE') && !res) || res === null || res === undefined) {
                        throw new NotFoundException();
                    }
                    else {    
                        return res;
                    }
                }),
                catchError((err: any): Observable<any> => {
                    const endpoint = (request['url'] as string).split('?')[0].split('/')[1];
                    const { prefix, detail } = HttpInterceptor.ENDPOINTS[endpoint] || { prefix: '', detail: 'A requisição não respeita o schema.' };

                    //Erros de regra de negócio lançados pelo serviço (PixError / Error) => 400
                    if (!(err instanceof HttpException)) {
                        if (!err?.message) {
                            console.log(err);
                            throw new InternalServerErrorException(this.ServerErrorTypes[503]());
                        }
                        throw new BadRequestException(this.ServerErrorTypes[400](prefix, err.message, err.violacoes || []));
                    }

                    const statusHandle = {
                        400: () => {
                            const msgs = err.getResponse().valueOf();
                            const violacoes = typeof msgs === 'object' && !Array.isArray(msgs['message'])
                                ? Object.keys(msgs).map((key: string) => ({ propriedade: `${endpoint}.${key}`, razao: `${msgs[key]}`.replace('$$', `${endpoint}.${key}`) }))
                                : [];
                            throw new BadRequestException(this.ServerErrorTypes[400](prefix, detail, violacoes));
                        },
                        404: () => {
                            throw new NotFoundException(this.ServerErrorTypes[404]())
                        }
                    }[err.getStatus()]

                    if (!statusHandle) { throw err; }
                    return statusHandle();
                })
            );
        }
        else {
            return new Observable<any>((subs) => {

                throw new UnauthorizedException(this.ServerErrorTypes[401]())
            });

        }
    }
}