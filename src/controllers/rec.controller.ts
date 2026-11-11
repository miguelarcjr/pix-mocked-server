import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import { RecGetFilter, RecPatchRequest, RecPostRequest, RecRequest } from '../core/app/models/rec';

@Controller("rec")
@ApiTags("rec")
@UseInterceptors(HttpInterceptor)
export class RecController {
  constructor(private readonly pspService: PSP) { }

  @Post()
  async create(@Body() data: RecPostRequest, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    const itm: RecRequest<RecPostRequest> = { IdOwner, data }
    return await this.pspService.addRec(itm);
  }

  @Get()
  async list(@Query() qry: RecGetFilter, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    return await this.pspService.listRec({ ...qry, IdOwner });
  }

  @Get(":idRec")
  async read(@Param("idRec") idRec: string, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    return await this.pspService.readRec({ IdOwner, idRec });
  }

  @Patch(":idRec")
  async edit(@Body() data: RecPatchRequest, @Param("idRec") idRec: string, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    return await this.pspService.editRec({ IdOwner, idRec, data });
  }
}
