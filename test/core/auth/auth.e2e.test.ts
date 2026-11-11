import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthModule } from "../../../src/auth.module";
import * as request from 'supertest';

describe('CobController', () => {
    let app: INestApplication;
    
    beforeEach(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AuthModule],
      }).compile();
  
      app = moduleFixture.createNestApplication();
      await app.init();
    });
  
    // it('/PUT 401', async () => {
    //   await request(app.getHttpServer())
    //     .put(`/cob/${randomUUID()}`)
    //     .expect(200)
    //     .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ data: { status: 401 } }));
    // });
  
    it('/POST 200', async () => {
      await request(app.getHttpServer())
        .post(`/auth`)
        .send({ grant_type: 'client_credentials', client_id: '123', client_secret: 'abc' })
        .set("mocked-token", "123")
        .expect(200)
        .expect((res: any) => {
          const body = JSON.parse(res.text);
          expect(body).toMatchObject({ access_token: '123-abc', token_type: 'Bearer', expires_in: 300 });
          expect(body.scope.split(' ')).toEqual(expect.arrayContaining(['cob.write', 'cob.read', 'pix.read', 'webhook.write']));
          expect(body.accesstoken).toBeUndefined();
        });
    });

    it('/POST 200 escopos solicitados', async () => {
      await request(app.getHttpServer())
        .post(`/auth`)
        .send({ grant_type: 'client_credentials', client_id: '123', client_secret: 'abc', scope: 'cob.read pix.read' })
        .expect(200)
        .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ access_token: '123-abc', token_type: 'Bearer', scope: 'cob.read pix.read' }));
    });

    it('/POST 200 Basic auth', async () => {
      await request(app.getHttpServer())
        .post(`/auth`)
        .send({ grant_type: 'client_credentials' })
        .set('Authorization', `Basic ${Buffer.from('456:def').toString('base64')}`)
        .expect(200)
        .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ access_token: '456-def' }));
    });

    it('/POST 400 escopo inválido', async () => {
      await request(app.getHttpServer())
        .post(`/auth`)
        .send({ grant_type: 'client_credentials', client_id: '123', client_secret: 'abc', scope: 'cob.read xpto.write' })
        .expect(400)
        .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ error: 'invalid_scope' }));
    });

    it('/POST 400 grant_type', async () => {
      await request(app.getHttpServer())
        .post(`/auth`)
        .send({ grant_type: 'password', client_id: '123', client_secret: 'abc' })
        .expect(400)
        .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ error: 'unsupported_grant_type' }));
    });

    it('/POST 401 credenciais inválidas', async () => {
      await request(app.getHttpServer())
        .post(`/auth`)
        .send({ grant_type: 'client_credentials', client_id: '123', client_secret: 'xxx' })
        .expect(401)
        .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ error: 'invalid_client' }));
    });
  
})  