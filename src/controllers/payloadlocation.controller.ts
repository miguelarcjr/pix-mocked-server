import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PSP } from '../core/app/psp';

/** Endpoints públicos (sem autenticação) acessados pelo PSP pagador a partir da URL do QR Code. */
@Controller()
@ApiTags("payloadlocation")
export class PayloadLocationController {
  constructor(private readonly pspService: PSP) { }

  private static notFound() {
    return new NotFoundException({ type: 'https://pix.bcb.gov.br/api/v2/error/NaoEncontrado', title: 'Não Encontrado', status: 404, detail: 'Entidade não encontrada.', violacoes: [] });
  }

  /** Resolve a `location` gerada (`{PIX_LOCATION_DOMAIN}/qr/{uuid}`) no payload da cobrança. */
  @Get("qr/:uuid")
  async payload(@Param("uuid") uuid: string) {
    const res = await this.pspService.readPayloadLocation(uuid);
    if (!res) { throw PayloadLocationController.notFound(); }
    return res;
  }

  /** Retorna o BR Code (EMV / Pix Copia e Cola) correspondente à location. */
  @Get("payloadlocation/:uuid")
  async brcode(@Param("uuid") uuid: string) {
    const res = await this.pspService.readBRCode(uuid);
    if (!res) { throw PayloadLocationController.notFound(); }
    return res;
  }
}
