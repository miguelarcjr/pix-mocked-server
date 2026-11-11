import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

export const expectPost200 = async<T extends Object>(app: INestApplication, endpoint: string, payload: T, expected: any) => {
    await request(app.getHttpServer())
        .post(endpoint)
        .send(payload)
        .set("mocked-token", "123-abc")
        .expect(200)
        .expect((res) => expect(JSON.parse(res.text)).toMatchObject(expected));

}

export const expectPost201 = async<T extends Object>(app: INestApplication, endpoint: string, payload: T, expected: any) => {
    await request(app.getHttpServer())
        .post(endpoint)
        .send(payload)
        .set("mocked-token", "123-abc")
        .expect(201)
        .expect((res) => expect(JSON.parse(res.text)).toMatchObject(expected));
}

export const expectPost400 = async<T extends Object>(app: INestApplication, endpoint: string, payload: T, detail: string, violacoes: { razao: string, propriedade: string }[]) => {
    await request(app.getHttpServer())
        .post(endpoint)
        .send(payload)
        .set("mocked-token", "123-abc")
        .expect(400)
        .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail, violacoes }));
}

export const expectPost401 = async<T extends Object>(app: INestApplication, endpoint: string, payload: T, withoutHeader: boolean) => {
    if (withoutHeader) {
        await request(app.getHttpServer())
            .post(endpoint)
            .send(payload)
            .expect(401)
            .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
    }
    else {
        await request(app.getHttpServer())
            .post(endpoint)
            .send(payload)
            .set("mocked-token", "xpto")
            .expect(401)
            .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
    }
}
export const TOKEN = "123-abc";

/** Cria a aplicação com o mesmo ValidationPipe de produção e correntistas carregados. */
export const createApp = async (): Promise<INestApplication> => {
    const { BadRequestException, ValidationPipe } = await import('@nestjs/common');
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../src/app.module');
    const { MemoryDB } = await import('../src/libs/fakedb');
    const { errorFormatter } = await import('../src/libs/utils');
    const { correntistas } = await import('../src/data/db.json');

    const cst = MemoryDB.getOrCreate("CORRENTISTAS", ['chave', 'cpfcnpj']);
    if (!(await cst.read('DEV', { chave: correntistas[0].chave }))) {
        await Promise.all(correntistas.map(c => cst.add('DEV', c)));
    }

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
        transform: true,
        skipMissingProperties: true,
        exceptionFactory: (errors) => { throw new BadRequestException(errorFormatter(errors)) }
    }));
    await app.init();
    return app;
}

export const api = (app: INestApplication, token: string = TOKEN) => {
    const srv = request(app.getHttpServer());
    const auth = (r: request.Test) => r.set("mocked-token", token);
    return {
        get: (url: string) => auth(srv.get(url)),
        put: (url: string, body: any = {}) => auth(srv.put(url).send(body)),
        post: (url: string, body: any = {}) => auth(srv.post(url).send(body)),
        patch: (url: string, body: any = {}) => auth(srv.patch(url).send(body)),
        delete: (url: string) => auth(srv.delete(url)),
    };
}
