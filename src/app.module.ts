import { Module } from '@nestjs/common';
import { CobController } from './controllers/cob.controller';
import { PSP } from './core/app/psp';
import { CobVController } from './controllers/cobv.controller';
import { CobRController } from './controllers/cobr.controller';
import { LocationController } from './controllers/location.controller';
import { RecController } from './controllers/rec.controller';
import { SolicRecController } from './controllers/solicrec.controller';
import { PixController } from './controllers/pix.controller';
import { WebhookController } from './controllers/webhook.controller';
import { LoteCobVController } from './controllers/lotecobv.controller';
import { PayloadLocationController } from './controllers/payloadlocation.controller';

@Module({
  imports: [],
  controllers: [
    CobController, CobVController, CobRController, LocationController, RecController, SolicRecController,
    PixController, WebhookController, LoteCobVController, PayloadLocationController
  ],
  providers: [PSP],
})
export class AppModule {

}
