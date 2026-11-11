import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import { api, createApp } from "./e2e";
import { flatDate } from "../src/libs/utils";
import { gerarCPF } from "../src/libs/documentos";
import { PeriodicidadeRecorrencia, PoliticaRetentativa, RecPostRequest } from "../src/core/app/models/rec";

const txid = () => randomUUID().replace(/\-/g, '');
const amanha = () => new Date(Date.now() + 86400000).toJSON().substring(0, 10);

describe('REC / COBR / SOLICREC', () => {
    let app: INestApplication;
    let http: ReturnType<typeof api>;
    const cpf = gerarCPF();
    const inicio = new Date(Date.now() - 3600000).toJSON();
    const fim = () => new Date(Date.now() + 3600000).toJSON();

    const rec = (politicaRetentativa = PoliticaRetentativa.Permite): RecPostRequest => ({
        vinculo: { objeto: "Assinatura", contrato: txid().substring(0, 20), devedor: { nome: "Fulano", cpf, cep: "26083190", cidade: "Nova Iguaçu", logradouro: "Rua A", uf: "RJ" } },
        ativacao: { dadosJornada: { txid: txid() } },
        calendario: { dataInicial: flatDate(new Date()).toJSON(), periodicidade: PeriodicidadeRecorrencia.Mensal },
        politicaRetentativa,
        recebedor: { nome: "Recebedor", cpf: gerarCPF(), cep: "26083190", cidade: "Nova Iguaçu", logradouro: "Rua A", uf: "RJ" },
        valor: { valorRec: "50.00" }
    });

    const criarRec = async (politica?: PoliticaRetentativa) => (await http.post('/rec', rec(politica)).expect(201)).body;

    beforeAll(async () => {
        app = await createApp();
        http = api(app);
    });

    afterAll(async () => await app.close());

    describe('/rec', () => {
        it('POST gera idRec no padrão da spec e status CRIADA', async () => {
            const r = await criarRec(PoliticaRetentativa.NaoPermite);
            expect(r.idRec).toMatch(/^RN[a-zA-Z0-9]{8}\d{8}[a-zA-Z0-9]{11}$/);
            expect(r).toMatchObject({ status: 'CRIADA', atualizacao: [{ status: 'CRIADA' }] });
        });

        it('GET /rec/{idRec}', async () => {
            const r = await criarRec();
            await http.get(`/rec/${r.idRec}`).expect(200).expect(res => expect(res.body).toMatchObject({ idRec: r.idRec, valor: { valorRec: "50.00" } }));
        });

        it('GET /rec/{idRec} 404', async () => await http.get(`/rec/RR1234567820240101abcdefghijk`).expect(404));

        it('GET /rec com filtros e paginação', async () => {
            await criarRec(); await criarRec();
            const res = await http.get(`/rec?inicio=${inicio}&fim=${fim()}&cpf=${cpf}&status=CRIADA&paginacao[itensPorPagina]=1`).expect(200);
            expect(res.body.parametros.paginacao).toMatchObject({ paginaAtual: 0, itensPorPagina: 1 });
            expect(res.body.parametros.paginacao.quantidadeTotalDeItens).toBeGreaterThanOrEqual(2);
            expect(res.body.recs).toHaveLength(1);
            expect(res.body.recs[0].vinculo.devedor.cpf).toBe(cpf);

            const vazio = await http.get(`/rec?inicio=${inicio}&fim=${fim()}&status=CANCELADA&cpf=${gerarCPF()}`).expect(200);
            expect(vazio.body.recs).toHaveLength(0);
        });

        it('GET /rec 400 sem inicio/fim', async () => await http.get(`/rec?inicio=xpto&fim=${fim()}`).expect(400));

        it('PATCH /rec/{idRec} altera devedor e cancela', async () => {
            const r = await criarRec();
            await http.patch(`/rec/${r.idRec}`, { vinculo: { devedor: { nome: "Novo Nome" } } }).expect(200)
                .expect(res => expect(res.body).toMatchObject({ status: 'CRIADA', vinculo: { devedor: { nome: "Novo Nome", cpf } } }));
            await http.patch(`/rec/${r.idRec}`, { status: 'CANCELADA' }).expect(200)
                .expect(res => expect(res.body).toMatchObject({ status: 'CANCELADA', encerramento: { cancelamento: { solicitante: 'USUARIO_RECEBEDOR' } } }));
            await http.patch(`/rec/${r.idRec}`, { status: 'CANCELADA' }).expect(400);
        });

        it('PATCH /rec/{idRec} status inválido', async () => {
            const r = await criarRec();
            await http.patch(`/rec/${r.idRec}`, { status: 'APROVADA' }).expect(400)
                .expect(res => expect(res.body).toMatchObject({ violacoes: [{ propriedade: 'rec.status' }] }));
        });
    });

    describe('/cobr', () => {
        const cobr = (idRec: string) => ({ idRec, infoAdicional: "Parcela", calendario: { dataDeVencimento: amanha() } });

        it('PUT /cobr/{txid} persiste na coleção COBR', async () => {
            const r = await criarRec();
            const id = txid();
            await http.put(`/cobr/${id}`, cobr(r.idRec)).expect(200)
                .expect(res => expect(res.body).toMatchObject({ txid: id, idRec: r.idRec, status: 'CRIADA', valor: { original: "50.00" }, politicaRetentativa: 'PERMITE_3R_7D' }));
            await http.get(`/cobr/${id}`).expect(200).expect(res => expect(res.body).toMatchObject({ txid: id, idRec: r.idRec }));
            await http.get(`/cob/${id}`).expect(404);
        });

        it('POST /cobr gera txid', async () => {
            const r = await criarRec();
            const res = await http.post(`/cobr`, { ...cobr(r.idRec), valor: { original: "10.00" } }).expect(201);
            expect(res.body).toMatchObject({ valor: { original: "10.00" } });
            expect(res.body.txid).toBeDefined();
        });

        it('PUT /cobr/{txid} 400 recorrência inexistente', async () =>
            await http.put(`/cobr/${txid()}`, cobr('RR1234567820240101abcdefghijk')).expect(400)
                .expect(res => expect(res.body).toMatchObject({ violacoes: [{ propriedade: 'cobr.idRec' }] })));

        it('GET /cobr lista apenas COBR', async () => {
            const r = await criarRec();
            await http.put(`/cobr/${txid()}`, cobr(r.idRec)).expect(200);
            const res = await http.get(`/cobr?inicio=${inicio}&fim=${fim()}&cpf=${cpf}`).expect(200);
            expect(res.body.cobsr.length).toBeGreaterThan(0);
            expect(res.body.cobsr.every((c: any) => !!c.idRec)).toBeTruthy();
        });

        it('PATCH /cobr/{txid} cancela', async () => {
            const r = await criarRec();
            const id = txid();
            await http.put(`/cobr/${id}`, cobr(r.idRec)).expect(200);
            await http.patch(`/cobr/${id}`, { status: 'CANCELADA' }).expect(200).expect(res => expect(res.body).toMatchObject({ status: 'CANCELADA' }));
            await http.patch(`/cobr/${id}`, { status: 'CANCELADA' }).expect(400);
        });

        it('PATCH /cobr/{txid} 404', async () => await http.patch(`/cobr/${txid()}`, { status: 'CANCELADA' }).expect(404));

        it('POST /cobr/{txid}/retentativa/{data} registra a data', async () => {
            const r = await criarRec();
            const id = txid();
            await http.put(`/cobr/${id}`, cobr(r.idRec)).expect(200);
            const data = amanha();
            const res = await http.post(`/cobr/${id}/retentativa/${data}`).expect(201);
            expect(res.body.tentativas).toHaveLength(1);
            expect(res.body.tentativas[0]).toMatchObject({ dataLiquidacao: data, tipo: 'RIFL', status: 'SOLICITADA' });
            expect(res.body.tentativas[0].endToEndId).toMatch(/^E[a-zA-Z0-9]{31}$/);

            await http.post(`/cobr/${id}/retentativa/2020-01-01`).expect(400);
            await http.post(`/cobr/${id}/retentativa/xpto`).expect(400);
            await http.post(`/cobr/${id}/retentativa/${data}`).expect(201);
            await http.post(`/cobr/${id}/retentativa/${data}`).expect(201);
            await http.post(`/cobr/${id}/retentativa/${data}`).expect(400); //máximo de 3
        });

        it('POST retentativa 400 política NAO_PERMITE', async () => {
            const r = await criarRec(PoliticaRetentativa.NaoPermite);
            const id = txid();
            await http.put(`/cobr/${id}`, cobr(r.idRec)).expect(200);
            await http.post(`/cobr/${id}/retentativa/${amanha()}`).expect(400);
        });
    });

    describe('/solicrec', () => {
        const destinatario = { conta: "12345", ispbParticipante: "12345678", agencia: "0001", cpf };
        const calendario = () => ({ dataExpiracaoSolicitacao: new Date(Date.now() + 86400000).toJSON() });

        it('POST / GET / PATCH (cancelamento)', async () => {
            const r = await criarRec();
            const res = await http.post('/solicrec', { idRec: r.idRec, calendario: calendario(), destinatario }).expect(201);
            expect(res.body.idSolicRec).toMatch(/^SC[a-zA-Z0-9]{8}\d{8}[a-zA-Z0-9]{11}$/);
            expect(res.body).toMatchObject({ idRec: r.idRec, status: 'CRIADA', recPayload: { idRec: r.idRec } });

            await http.get(`/solicrec/${res.body.idSolicRec}`).expect(200);
            await http.patch(`/solicrec/${res.body.idSolicRec}`, { status: 'CANCELADA' }).expect(200)
                .expect(r2 => expect(r2.body).toMatchObject({ status: 'CANCELADA', atualizacao: [{ status: 'CRIADA' }, { status: 'CANCELADA' }] }));
            await http.patch(`/solicrec/${res.body.idSolicRec}`, { status: 'CANCELADA' }).expect(400);
        });

        it('POST 400 schema', async () => {
            const r = await criarRec();
            await http.post('/solicrec', { idRec: r.idRec, calendario: calendario(), destinatario: { ...destinatario, ispbParticipante: "x" } }).expect(400)
                .expect(res => expect(res.body).toMatchObject({ violacoes: [{ propriedade: 'solicrec.destinatario.ispbParticipante' }] }));
        });

        it('POST 400 recorrência inexistente', async () =>
            await http.post('/solicrec', { idRec: 'RR1234567820240101abcdefghijk', calendario: calendario(), destinatario }).expect(400));

        it('GET 404 / PATCH 404', async () => {
            await http.get(`/solicrec/SC1234567820240101abcdefghijk`).expect(404);
            await http.patch(`/solicrec/SC1234567820240101abcdefghijk`, { status: 'CANCELADA' }).expect(404);
        });
    });
});
