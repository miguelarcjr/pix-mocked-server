import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import * as request from 'supertest';
import { api, createApp } from "./e2e";
import { correntistas } from '../src/data/db.json';
import { gerarCPF } from "../src/libs/documentos";

const txid = () => randomUUID().replace(/\-/g, '');
const chave = correntistas[0].chave;

describe('PIX / WEBHOOK / PAYLOADLOCATION / LOTECOBV', () => {
    let app: INestApplication;
    let http: ReturnType<typeof api>;
    const inicio = new Date(Date.now() - 3600000).toJSON();
    const fim = () => new Date(Date.now() + 3600000).toJSON();
    const saque = { valor: "20.00", modalidadeAgente: "AGTEC", prestadorDoServicoDeSaque: "12345678" };

    const criarCob = async (valor: any = { original: "100.00" }, extra: any = {}) => {
        const id = txid();
        await http.put(`/cob/${id}`, { chave, valor, ...extra }).expect(200);
        return id;
    };

    beforeAll(async () => {
        app = await createApp();
        http = api(app);
    });

    afterAll(async () => await app.close());

    describe('cob: cancelamento e rotas', () => {
        it('PATCH status REMOVIDA_PELO_USUARIO_RECEBEDOR cancela (GET não remove mais)', async () => {
            const id = await criarCob();
            await http.get(`/cob/${id}`).expect(200).expect(res => expect(res.body).toMatchObject({ status: 'ATIVA' }));
            await http.get(`/cob/${id}`).expect(200).expect(res => expect(res.body).toMatchObject({ status: 'ATIVA' }));
            await http.patch(`/cob/${id}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }).expect(200)
                .expect(res => expect(res.body).toMatchObject({ status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR', revisao: 1 }));
        });

        it('PATCH status inválido', async () => {
            const id = await criarCob();
            await http.patch(`/cob/${id}`, { status: 'CONCLUIDA' }).expect(400);
        });

        it('cobv: PATCH status REMOVIDA_PELO_USUARIO_RECEBEDOR', async () => {
            const id = txid();
            await http.put(`/cobv/${id}`, { chave, valor: { original: "10.00" }, calendario: { dataDeVencimento: new Date().toJSON(), validadeAposVencimento: 1 }, devedor: { nome: "Fulano", cpf: gerarCPF() } }).expect(200);
            await http.patch(`/cobv/${id}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }).expect(200)
                .expect(res => expect(res.body).toMatchObject({ status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }));
        });

        it('PATCH loc já vinculado a outra cobrança', async () => {
            const a = await criarCob();
            const b = (await http.get(`/cob/${await criarCob()}`)).body;
            await http.patch(`/cob/${a}`, { loc: { id: b.loc.id } }).expect(400);
        });

        it('retirada: Pix Saque válido e inválido', async () => {
            await http.put(`/cob/${txid()}`, { chave, valor: { original: "0.00", retirada: { saque } } }).expect(200)
                .expect(res => expect(res.body).toMatchObject({ valor: { original: "0.00", retirada: { saque: { ...saque, modalidadeAlteracao: 0 } } } }));
            await http.put(`/cob/${txid()}`, { chave, valor: { original: "0.00", retirada: { saque: { ...saque, modalidadeAgente: "XPTO" } } } }).expect(400)
                .expect(res => expect(res.body).toMatchObject({ violacoes: [{ propriedade: 'cob.valor.retirada.saque.modalidadeAgente' }] }));
            await http.put(`/cob/${txid()}`, { chave, valor: { original: "5.00", retirada: { saque } } }).expect(400)
                .expect(res => expect(res.body).toMatchObject({ violacoes: [{ propriedade: 'cob.valor.original' }] }));
            await http.put(`/cob/${txid()}`, { chave, valor: { original: "0.00" } }).expect(400);
        });
    });

    describe('/pix', () => {
        it('simular pagamento: ATIVA -> CONCLUIDA gerando pix com e2eid', async () => {
            const id = await criarCob({ original: "100.00" }, { devedor: { nome: "Fulano", cpf: "12345678909" } });
            const pg = await http.post(`/cob/${id}/simular-pagamento`, { infoPagador: "obrigado" }).expect(201);
            expect(pg.body.endToEndId).toMatch(/^E[a-zA-Z0-9]{31}$/);
            expect(pg.body).toMatchObject({ txid: id, valor: "100.00", chave, componentesValor: { original: { valor: "100.00" } }, pagador: { cpf: "12345678909" }, devolucoes: [] });

            await http.get(`/cob/${id}`).expect(200).expect(res => {
                expect(res.body).toMatchObject({ status: 'CONCLUIDA', pix: [{ endToEndId: pg.body.endToEndId }] });
                expect(res.body.pixCopiaECola).toBeUndefined();
            });
            await http.get(`/pix/${pg.body.endToEndId}`).expect(200).expect(res => expect(res.body).toMatchObject({ txid: id }));
            await http.post(`/cob/${id}/simular-pagamento`).expect(400);
        });

        it('simular pagamento: valor divergente / editável', async () => {
            const fixo = await criarCob({ original: "10.00" });
            await http.post(`/cob/${fixo}/simular-pagamento`, { valor: "11.00" }).expect(400);
            const editavel = await criarCob({ original: "10.00", modalidadeAlteracao: 1 });
            await http.post(`/cob/${editavel}/simular-pagamento`, { valor: "15.50" }).expect(201).expect(res => expect(res.body).toMatchObject({ valor: "15.50" }));
        });

        it('simular pagamento 404', async () => await http.post(`/cob/${txid()}/simular-pagamento`).expect(404));

        it('GET /pix com filtros', async () => {
            const id = await criarCob();
            const { body: pix } = await http.post(`/cob/${id}/simular-pagamento`, { pagador: { nome: "Beltrano", cpf: "52998224725" } }).expect(201);

            const res = await http.get(`/pix?inicio=${inicio}&fim=${fim()}&txid=${id}`).expect(200);
            expect(res.body.pix).toHaveLength(1);
            expect(res.body.pix[0].endToEndId).toBe(pix.endToEndId);
            expect(res.body.parametros.paginacao.quantidadeTotalDeItens).toBe(1);

            const porCpf = await http.get(`/pix?inicio=${inicio}&fim=${fim()}&cpf=52998224725`).expect(200);
            expect(porCpf.body.pix.map(p => p.endToEndId)).toContain(pix.endToEndId);

            const pag = await http.get(`/pix?inicio=${inicio}&fim=${fim()}&paginacao[itensPorPagina]=1`).expect(200);
            expect(pag.body.pix).toHaveLength(1);

            await http.get(`/pix?inicio=${inicio}&fim=${fim()}&devolucaoPresente=true&txid=${id}`).expect(200).expect(r => expect(r.body.pix).toHaveLength(0));
            await http.get(`/pix?inicio=xpto&fim=${fim()}`).expect(400);
        });

        it('GET /pix/{e2eid} 404', async () => await http.get(`/pix/E12345678202401011200abcdefghijk`).expect(404));

        it('PUT /pix/{e2eid}/devolucao/{id}', async () => {
            const { body: pix } = await http.post(`/cob/${await criarCob({ original: "100.00" })}/simular-pagamento`).expect(201);

            const dev = await http.put(`/pix/${pix.endToEndId}/devolucao/d1`, { valor: "30.00", descricao: "parcial" }).expect(200);
            expect(dev.body).toMatchObject({ id: 'd1', valor: "30.00", natureza: 'ORIGINAL', status: 'DEVOLVIDO' });
            expect(dev.body.rtrId).toMatch(/^D[a-zA-Z0-9]{31}$/);

            await http.put(`/pix/${pix.endToEndId}/devolucao/d1`, { valor: "1.00" }).expect(400); //id duplicado
            await http.put(`/pix/${pix.endToEndId}/devolucao/d2`, { valor: "80.00" }).expect(400); //excede saldo
            await http.put(`/pix/${pix.endToEndId}/devolucao/d3`, { valor: "10.00", natureza: 'RETIRADA' }).expect(400); //não é saque/troco
            await http.put(`/pix/${pix.endToEndId}/devolucao/d4`, { valor: "abc" }).expect(400);
            await http.put(`/pix/${pix.endToEndId}/devolucao/d5`, { valor: "70.00" }).expect(200);

            await http.get(`/pix/${pix.endToEndId}/devolucao/d1`).expect(200).expect(r => expect(r.body).toMatchObject({ id: 'd1' }));
            await http.get(`/pix/${pix.endToEndId}`).expect(200).expect(r => expect(r.body.devolucoes).toHaveLength(2));
            await http.put(`/pix/E12345678202401011200abcdefghijk/devolucao/d1`, { valor: "1.00" }).expect(404);
        });

        it('Pix Troco: componentes e devolução RETIRADA', async () => {
            const id = await criarCob({ original: "50.00", retirada: { troco: saque } });
            const { body: pix } = await http.post(`/cob/${id}/simular-pagamento`).expect(201);
            expect(pix).toMatchObject({ valor: "70.00", componentesValor: { original: { valor: "50.00" }, troco: { valor: "20.00", modalidadeAgente: "AGTEC" } } });
            await http.put(`/pix/${pix.endToEndId}/devolucao/r1`, { valor: "20.00", natureza: 'RETIRADA' }).expect(200);
            await http.put(`/pix/${pix.endToEndId}/devolucao/r2`, { valor: "0.01", natureza: 'RETIRADA' }).expect(400);
        });
    });

    describe('/webhook', () => {
        let server: Server;
        let received: any[] = [];
        let url: string;

        beforeAll(async () => {
            server = createServer((req, res) => {
                let body = '';
                req.on('data', c => body += c);
                req.on('end', () => { received.push({ path: req.url, body: JSON.parse(body) }); res.end(); });
            });
            await new Promise<void>(res => server.listen(0, () => res()));
            url = `http://localhost:${(server.address() as AddressInfo).port}/hook`;
        });

        afterAll(() => server.close());

        it('PUT / GET / GET lista / DELETE', async () => {
            await http.put(`/webhook/${chave}`, { webhookUrl: url }).expect(200).expect(r => expect(r.body).toMatchObject({ chave, webhookUrl: url }));
            await http.get(`/webhook/${chave}`).expect(200).expect(r => expect(r.body.criacao).toBeDefined());
            await http.get(`/webhook`).expect(200).expect(r => expect(r.body.webhooks.map(w => w.chave)).toContain(chave));
            await http.delete(`/webhook/${chave}`).expect(204);
            await http.get(`/webhook/${chave}`).expect(404);
            await http.delete(`/webhook/${chave}`).expect(404);
        });

        it('PUT 400 url inválida / chave inexistente', async () => {
            await http.put(`/webhook/${chave}`, { webhookUrl: "nao-e-url" }).expect(400)
                .expect(r => expect(r.body).toMatchObject({ violacoes: [{ propriedade: 'webhook.webhookUrl' }] }));
            await http.put(`/webhook/${randomUUID()}`, { webhookUrl: url }).expect(400);
        });

        it('notifica {webhookUrl}/pix ao concluir um pix', async () => {
            await http.put(`/webhook/${chave}`, { webhookUrl: url }).expect(200);
            const { body: pix } = await http.post(`/cob/${await criarCob()}/simular-pagamento`).expect(201);
            for (let i = 0; i < 50 && !received.length; i++) { await new Promise(r => setTimeout(r, 20)); }
            expect(received).toHaveLength(1);
            expect(received[0]).toMatchObject({ path: '/hook/pix', body: { pix: [{ endToEndId: pix.endToEndId }] } });
            await http.delete(`/webhook/${chave}`).expect(204);
        });

        it('401 sem token', async () => await request(app.getHttpServer()).get('/webhook').expect(401));
    });

    describe('payloadlocation (público)', () => {
        it('GET /qr/{uuid} e /payloadlocation/{uuid}', async () => {
            const id = await criarCob({ original: "12.34" });
            const { body: cob } = await http.get(`/cob/${id}`).expect(200);
            const uuid = cob.loc.uuid;
            expect(cob.location).toBe(`pix.example.com/qr/${uuid}`);
            expect(cob.pixCopiaECola).toMatch(/^000201.*BR\.GOV\.BCB\.PIX.*6304[0-9A-F]{4}$/);

            await request(app.getHttpServer()).get(`/qr/${uuid}`).expect(200)
                .expect(r => {
                    expect(r.body).toMatchObject({ txid: id, chave, valor: { original: "12.34" }, status: 'ATIVA' });
                    expect(r.body.calendario.apresentacao).toBeDefined();
                });
            await request(app.getHttpServer()).get(`/payloadlocation/${uuid}`).expect(200)
                .expect(r => expect(r.body).toMatchObject({ txid: id, location: cob.location, pixCopiaECola: cob.pixCopiaECola }));

            await request(app.getHttpServer()).get(`/qr/${txid()}`).expect(404);
            await request(app.getHttpServer()).get(`/payloadlocation/${txid()}`).expect(404);
        });

        it('domínio configurável via PIX_LOCATION_DOMAIN', async () => {
            process.env.PIX_LOCATION_DOMAIN = 'qr.meupsp.com.br';
            try {
                const { body } = await http.get(`/cob/${await criarCob()}`).expect(200);
                expect(body.location).toBe(`qr.meupsp.com.br/qr/${body.loc.uuid}`);
            }
            finally { delete process.env.PIX_LOCATION_DOMAIN; }
        });
    });

    describe('/lotecobv', () => {
        const cobv = (id = txid()) => ({ txid: id, chave, valor: { original: "10.00" }, calendario: { dataDeVencimento: new Date(Date.now() + 86400000).toJSON(), validadeAposVencimento: 30 }, devedor: { nome: "Fulano", cpf: gerarCPF() } });

        it('PUT /lotecobv/{id} processa o lote (CRIADA / NEGADA)', async () => {
            const ok = cobv();
            const id = Date.now();
            const res = await http.put(`/lotecobv/${id}`, { descricao: "Lote 1", cobsv: [ok, { ...cobv(), valor: { original: "abc" } }, { ...cobv(), txid: "curto" }] }).expect(202);
            expect(res.body).toMatchObject({ id, descricao: "Lote 1" });
            expect(res.body.cobsv.map(c => c.status)).toEqual(['CRIADA', 'NEGADA', 'NEGADA']);
            expect(res.body.cobsv[1].problema).toMatchObject({ status: 400, violacoes: [{ propriedade: 'cobv.valor.original' }] });

            await http.get(`/cobv/${ok.txid}`).expect(200);
            await http.get(`/lotecobv/${id}`).expect(200).expect(r => expect(r.body.cobsv).toHaveLength(3));
            await http.put(`/lotecobv/${id}`, { descricao: "dup", cobsv: [cobv()] }).expect(400);
        });

        it('POST /lotecobv gera id; GET lista; PATCH altera cobv do lote', async () => {
            const c = cobv();
            const { body: lote } = await http.post(`/lotecobv`, { descricao: "Lote 2", cobsv: [c] }).expect(202);
            expect(lote.cobsv[0].status).toBe('CRIADA');

            await http.get(`/lotecobv?inicio=${inicio}&fim=${fim()}`).expect(200).expect(r => expect(r.body.lotes.map(l => l.id)).toContain(lote.id));
            await http.patch(`/lotecobv/${lote.id}`, { cobsv: [{ txid: c.txid, valor: { original: "20.00" } }] }).expect(202)
                .expect(r => expect(r.body.cobsv[0].status).toBe('CRIADA'));
            await http.get(`/cobv/${c.txid}`).expect(200).expect(r => expect(r.body).toMatchObject({ valor: { original: "20.00" }, revisao: 1 }));
            await http.patch(`/lotecobv/${lote.id}`, { cobsv: [{ txid: txid(), valor: { original: "20.00" } }] }).expect(400);
        });

        it('400 schema / 404', async () => {
            await http.put(`/lotecobv/${Date.now()}`, { descricao: "vazio", cobsv: [] }).expect(400);
            await http.get(`/lotecobv/1`).expect(404);
        });
    });
});
