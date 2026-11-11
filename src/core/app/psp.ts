import { Injectable } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MemoryDB } from "../../libs/fakedb";
import { PixID, PixKey, PixRequest, TipoCob, Situacao, ModalidadeAlteracao, IPaginator, Expiracao, ModalidadeAgente, RetiradaPix, ValidadeVencimento } from "./models";
import { buildLocation, errorFormatter, genEndToEndId, getMD5Hash, inPeriod, paginate, QRCode, randomAlnum } from "../../libs/utils";
import { randomUUID } from "crypto";
import { MESSAGES } from "../../libs/messages";
import { PixError } from "../../libs/errors";
import { CobGetResponse, CobPatchRequest, CobPutRequest, CobPutResponse, CobGetFilter, CobPatchResponse } from "./models/cob";
import { LocGetResponse, LocGetFilter, LocID, LocPutRequest, LocPutResponse } from "./models/loc";
import { CobVGetFilter, CobVGetResponse, CobVPatchRequest, CobVPatchResponse, CobVPutRequest, CobVPutResponse, CobVValor } from "./models/cobv";
import { CobRGetFilter, CobRPatchRequest, CobRPutRequest, StatusCobR, StatusTentativa, TipoTentativa } from "./models/cobr";
import { PoliticaRetentativa, RecGetFilter, RecPatchRequest, RecPostRequest, RecRequest, StatusRec } from "./models/rec";
import { DevolucaoPutRequest, IDevolucao, IPix, NaturezaDevolucao, PixGetFilter, SimularPagamentoRequest, StatusDevolucao } from "./models/pix";
import { IWebhook, WebhookGetFilter } from "./models/webhook";
import { ILoteCobV, LoteCobVGetFilter, LoteCobVPatchRequest, LoteCobVRequest, StatusCobVLote } from "./models/lotecobv";
import { SolicRecPatchRequest, SolicRecPostRequest, StatusSolicRec } from "./models/solicrec";
import { owners } from '../../data/db.json'

const now = () => (new Date()).toJSON();
const toNumber = (v?: string) => Number.parseFloat(v || '0');
const isTrue = (v: any) => v === true || v === 'true';

@Injectable()
export class PSP {

    private cob: MemoryDB;
    private cobR: MemoryDB;
    private cobV: MemoryDB;
    private transHist: MemoryDB;
    private locations: MemoryDB;
    private correntistas: MemoryDB;
    private loccob: MemoryDB;
    private rec: MemoryDB;
    private solicRec: MemoryDB;
    private pix: MemoryDB;
    private webhooks: MemoryDB;
    private loteCobV: MemoryDB;

    constructor() {

        this.cob = MemoryDB.getOrCreate("COB", ['txid']);
        this.transHist = MemoryDB.getOrCreate("COB_HIST", ['id']);

        this.cobR = MemoryDB.getOrCreate("COBR", ['txid']);
        this.cobV = MemoryDB.getOrCreate("COBV", ['txid']);

        this.locations = MemoryDB.getOrCreate("LOCATIONS", ['id', 'uuid']);
        this.correntistas = MemoryDB.getOrCreate("CORRENTISTAS", ['chave', 'cpfcnpj']);
        this.loccob = MemoryDB.getOrCreate("LOC_COB", ['id', 'txid']);

        this.rec = MemoryDB.getOrCreate("REC", ['idRec']);
        this.solicRec = MemoryDB.getOrCreate("SOLICREC", ['idSolicRec']);

        this.pix = MemoryDB.getOrCreate("PIX", ['endToEndId']);
        this.webhooks = MemoryDB.getOrCreate("WEBHOOK", ['chave']);
        this.loteCobV = MemoryDB.getOrCreate("LOTECOBV", ['id']);
    }

    private ispb(IdOwner: string): string {
        const own = owners.find(f => f.id === IdOwner) as { id: string, ISPB?: string };
        if (!own) {
            throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT('OWNER'));
        }
        return own.ISPB || own.id.replace(/\W/g, '').substring(0, 8);
    }

    private async joinLocCob(IdOwner: string, txid: string, id: number, tipoCob: TipoCob) {
        const lc1 = await this.loccob.read(IdOwner, { txid });
        const lc2 = await this.loccob.read(IdOwner, { id });

        const cob = await this.cob.read(IdOwner, { txid })
        const loc = await this.locations.read(IdOwner, { id })

        if (lc2) {
            throw new PixError('LOCATION JÁ ESTÁ VINCULADO A UMA COBRANÇA', [{ propriedade: 'loc.id', razao: 'O location informado já está vinculado a uma cobrança.' }]);
        }
        if (lc1) {
            throw new PixError('COBRANÇA JÁ ESTÁ VINCULADO A UMA LOCATION', [{ propriedade: `${tipoCob}.txid`, razao: 'A cobrança informada já está vinculada a um location.' }]);
        }

        if (!cob) {
            throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT(tipoCob));
        }

        if (!loc) {
            throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT('location'));
        }

        if (loc.tipoCob != tipoCob) {
            throw new Error(MESSAGES.Errors.defaults.UNEXPECTED_VALUE('tipoCob', loc.tipoCob));
        }

        await this.loccob.add(IdOwner, { txid, id });
    }

    /** Regras de `valor.retirada` (Pix Saque / Pix Troco) conforme a especificação BACEN. */
    private validateRetirada(tipoCob: TipoCob, valor: { original?: string, modalidadeAlteracao?: ModalidadeAlteracao, retirada?: RetiradaPix }) {
        const retirada = valor?.retirada;
        if (!retirada) { return; }

        const prop = `${tipoCob}.valor.retirada`;
        const fail = (propriedade: string, razao: string) => { throw new PixError(razao, [{ propriedade, razao }]); };

        if (tipoCob !== TipoCob.imediato) {
            fail(prop, `O campo ${prop} só é permitido em cobranças imediatas.`);
        }

        const tipos = (['saque', 'troco'] as const).filter(t => !!retirada[t]);
        if (tipos.length !== 1) {
            fail(prop, `O campo ${prop} deve conter exatamente um dos objetos saque ou troco.`);
        }

        const tipo = tipos[0];
        const det = retirada[tipo];
        const p = `${prop}.${tipo}`;

        if (!det.valor || !/^\d{1,10}\.\d{2}$/.test(det.valor)) { fail(`${p}.valor`, `O campo ${p}.valor não respeita o schema.`); }
        if (!det.modalidadeAgente) { fail(`${p}.modalidadeAgente`, `O campo ${p}.modalidadeAgente é obrigatório.`); }
        if (!det.prestadorDoServicoDeSaque) { fail(`${p}.prestadorDoServicoDeSaque`, `O campo ${p}.prestadorDoServicoDeSaque é obrigatório.`); }
        if (!/^[0-9A-Z]{8}$/.test(det.prestadorDoServicoDeSaque)) { fail(`${p}.prestadorDoServicoDeSaque`, `O campo ${p}.prestadorDoServicoDeSaque não respeita o schema.`); }

        const agentesPermitidos = tipo === 'saque' ? Object.values(ModalidadeAgente) : [ModalidadeAgente.EstabelecimentoComercial, ModalidadeAgente.OutraEspeciePJ];
        if (!agentesPermitidos.includes(det.modalidadeAgente)) { fail(`${p}.modalidadeAgente`, `O campo ${p}.modalidadeAgente não respeita o schema.`); }

        const modalidade = det.modalidadeAlteracao ?? ModalidadeAlteracao.NaoEditavel;
        if (![ModalidadeAlteracao.NaoEditavel, ModalidadeAlteracao.Editavel].includes(modalidade)) { fail(`${p}.modalidadeAlteracao`, `O campo ${p}.modalidadeAlteracao não respeita o schema.`); }
        if (modalidade === ModalidadeAlteracao.NaoEditavel && toNumber(det.valor) <= 0) { fail(`${p}.valor`, `O campo ${p}.valor deve ser maior que zero quando ${p}.modalidadeAlteracao é 0.`); }

        if (valor.modalidadeAlteracao == ModalidadeAlteracao.Editavel) {
            fail(`${tipoCob}.valor.modalidadeAlteracao`, `O campo ${tipoCob}.valor.modalidadeAlteracao deve ser 0 quando ${prop} está presente.`);
        }

        const original = toNumber(valor.original);
        if (tipo === 'saque' && original !== 0) { fail(`${tipoCob}.valor.original`, `O campo ${tipoCob}.valor.original deve ser 0.00 em um Pix Saque.`); }
        if (tipo === 'troco' && !(original > 0)) { fail(`${tipoCob}.valor.original`, `O campo ${tipoCob}.valor.original deve ser maior que 0.00 em um Pix Troco.`); }

        retirada[tipo] = { ...det, modalidadeAlteracao: modalidade };
    }

    private async _addCob(itm: PixRequest<CobPutRequest | CobVPutRequest>, tipoCob: TipoCob) {
        const obrigatorios = [['chave', itm.data.chave], ['valor.original', itm.data.valor?.original]].filter(([, v]) => !v);
        if (obrigatorios.length) {
            const violacoes = obrigatorios.map(([campo]) => ({ propriedade: `${tipoCob}.${campo}`, razao: `O campo ${tipoCob}.${campo} não respeita o schema.` }));
            throw new PixError('A cobrança não respeita o schema.', violacoes);
        }

        this.validateRetirada(tipoCob, itm.data.valor);

        if (!itm.data.valor.modalidadeAlteracao) {
            itm.data.valor.modalidadeAlteracao = ModalidadeAlteracao.NaoEditavel;
        }

        if (tipoCob == TipoCob.imediato) {
            if (!itm.data.calendario || !(itm.data.calendario as Expiracao)?.expiracao) {
                itm.data.calendario = { expiracao: 86400 }
            }
        }

        const curr = { ...itm.data, txid: itm.txid, revisao: 0, status: Situacao.Ativa, criacao: now() };

        //INCLUI  LOCATION E TRANSAÇÃO, PARA DEPOIS VINCULÁ-LAS  
        const { id } = await this.addLoc({ tipoCob, IdOwner: itm.IdOwner })
        await this.cob.add(itm.IdOwner, curr);
        await this.joinLocCob(itm.IdOwner, itm.txid, id, tipoCob);

        return await this._readCob({ IdOwner: itm.IdOwner, txid: itm.txid });
    }

    async addCob(itm: PixRequest<CobPutRequest>): Promise<CobPutResponse> {
        return (await this._addCob(itm, TipoCob.imediato)) as CobPutResponse;
    }

    async addCobV(itm: PixRequest<CobVPutRequest>): Promise<CobVPutResponse> {
        return (await this._addCob(itm, TipoCob.vencimento)) as CobVPutResponse;
    }

    /** Expiração: cobranças ATIVA cujo prazo terminou passam a REMOVIDA_PELO_PSP. */
    private async expirarCob(IdOwner: string, curr: any) {
        if (curr.status !== Situacao.Ativa) { return curr; }

        let limite: Date;
        if ((curr.calendario as Expiracao)?.expiracao) {
            limite = new Date(new Date(curr.criacao).valueOf() + curr.calendario.expiracao * 1000);
        }
        else if ((curr.calendario as ValidadeVencimento)?.dataDeVencimento) {
            const validade = curr.calendario.validadeAposVencimento ?? 30;
            limite = new Date(curr.calendario.dataDeVencimento.substring(0, 10));
            limite.setUTCDate(limite.getUTCDate() + validade + 1);
        }

        if (limite && limite < new Date()) {
            curr = { ...curr, status: Situacao.RemovidaPSP };
            await this.cob.patch(IdOwner, { txid: curr.txid }, { status: Situacao.RemovidaPSP });
        }
        return curr;
    }

    private buildPixCopiaECola(location: string, correntista: { nome?: string, Cidade?: string }) {
        const ascii = (v: string, len: number) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().substring(0, len);
        return new QRCode({ URLPayload: location, MerchantName: ascii(correntista.nome, 25), MerchantCity: ascii(correntista.Cidade, 15) }).value;
    }

    async _readCob<T extends CobGetResponse | CobVGetResponse>(key: PixKey, revisao?: number): Promise<T> {

        const last = () => this.cob.read(key.IdOwner, { txid: key.txid });
        const hist = () => this.transHist.read(key.IdOwner, { id: getMD5Hash(key.txid, revisao) });

        const fromHist = revisao ? await hist() : undefined;
        let curr = fromHist || (await last());
        if (!curr) { return undefined }
        if (!fromHist) { curr = await this.expirarCob(key.IdOwner, curr); }

        const c = await this.correntistas.read("DEV", { chave: curr.chave });
        if (!c) { throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT('Correntista')) }


        const loccob = await this.loccob.read(key.IdOwner, { txid: curr.txid });
        let loc: LocGetResponse = undefined;

        if (loccob) {
            loc = await this.locations.read(key.IdOwner, { id: loccob.id });
            if (!loc) { throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT('Location')) }
            loc = { ...loc, location: buildLocation(loc.uuid) }
        }

        const pix = curr.status === Situacao.Concluida
            ? (await this.pix.list(key.IdOwner)).filter((f: IPix) => f.txid === curr.txid)
            : undefined;

        const res = {
            ...curr,
            loc: loc,
            location: loc?.location,
            ...(loc && curr.status === Situacao.Ativa ? { pixCopiaECola: this.buildPixCopiaECola(loc.location, c) } : {}),
            ...(pix ? { pix } : {})
        }

        return res;
    }

    async readCob(key: PixKey, revisao?: number): Promise<CobGetResponse> {
        return await this._readCob(key, revisao);
    }

    async readCobV(key: PixKey, revisao?: number): Promise<CobVGetResponse> {
        return await this._readCob(key, revisao);
    }

    async _listCob(filter: (CobGetFilter | CobVGetFilter) & { IdOwner: string }): Promise<IPaginator & { cobs: (CobGetResponse | CobVGetResponse)[] }> {
        let chave: string = undefined;

        if (filter.cnpj || filter.cpf) {
            const correntista = await this.correntistas.read("DEV", { cpfcnpj: filter.cnpj || filter.cpf })

            //CORRENTISTA NÃO ENCONTRADO RETORNA LISTA VAZIA
            if (!correntista) {
                const { parametros } = paginate([], filter);
                return { parametros, cobs: [] }
            }
            else {
                chave = correntista.chave
            }
        }

        const ls = await this.cob.list(filter.IdOwner);

        let cobs = await Promise.all(
            ls.filter((f: any) => {
                const [criacao, inicio, fim] = [new Date(f.criacao), new Date(filter.inicio), new Date(filter.fim)]
                return criacao >= inicio && criacao <= fim && (!chave || f.chave === chave)
            })
                .map<Promise<CobGetResponse | CobVGetResponse>>(m => this._readCob({ IdOwner: filter.IdOwner, txid: m.txid }))
        );

        if (filter.locationPresente !== undefined) {
            cobs = cobs.filter((f: CobGetResponse) => {
                const res = (!!f.loc?.id && !!filter.locationPresente) || (!f.loc?.id && !filter.locationPresente)
                return res;
            });
        }

        if (filter.status) {
            cobs = cobs.filter(f => f.status === filter.status);
        }

        const { parametros, itens } = paginate(cobs, filter);
        return { parametros, cobs: itens }
    }

    async listCob(filter: CobGetFilter & { IdOwner: string }) {
        return await this._listCob(filter)
    }

    async listCobV(filter: CobVGetFilter & { IdOwner: string }) {
        return await this._listCob(filter)
    }

    async _editCob(itm: PixRequest<CobPatchRequest | CobVPatchRequest>, tipoCob: TipoCob) {
        const curr = await this._readCob(itm);
        let add = false;

        //Cobranças inexistentes ou que não estão ATIVA não são alteráveis (404)
        if (!curr || curr.status != Situacao.Ativa) {
            return null
        }

        if (itm.data.status && itm.data.status !== Situacao.Removida) {
            throw new PixError(`O campo ${tipoCob}.status não respeita o schema.`, [{ propriedade: `${tipoCob}.status`, razao: `O campo ${tipoCob}.status aceita apenas o valor ${Situacao.Removida}.` }]);
        }

        if (!!itm.data.devedor || !!itm.data.solicitacaoPagador || !!itm.data.valor || !!itm.data.calendario || itm.data.status) {
            add = true
        }

        if (itm.data.loc?.id != null) {
            const lc = await this.loccob.read(itm.IdOwner, { txid: itm.txid });

            if (lc?.id != itm.data.loc.id) {
                if (lc) { await this.loccob.remove(itm.IdOwner, { id: lc.id }); }
                try { await this.joinLocCob(itm.IdOwner, itm.txid, itm.data.loc.id, tipoCob); }
                catch (ex) {
                    if (lc) { await this.loccob.add(itm.IdOwner, { id: lc.id, txid: itm.txid }); } //desfaz a exclusão
                    throw ex;
                }
            }
        }

        const histId = getMD5Hash(curr.txid, curr.revisao);
        if (add) {
            const { loc, location, pixCopiaECola, ...persist } = curr as any;

            const valor: any = {
                original: itm.data.valor?.original ?? curr.valor.original,
                modalidadeAlteracao: itm.data.valor?.modalidadeAlteracao ?? curr.valor.modalidadeAlteracao
            };
            const retirada = (itm.data.valor as any)?.retirada ?? (curr.valor as any)?.retirada;
            if (retirada) { valor.retirada = retirada; }
            this.validateRetirada(tipoCob, valor);

            if (tipoCob === TipoCob.vencimento) {
                const novo = (itm.data.valor || {}) as CobVValor;
                const currV = curr.valor as CobVValor;
                for (const campo of ['desconto', 'juros', 'multa', 'abatimento']) {
                    if (novo[campo] || currV[campo]) {
                        valor[campo] = { ...(currV[campo] || {}), ...(novo[campo] || {}) };
                    }
                }
            }

            await this.transHist.add(itm.IdOwner, { id: histId, ...persist });
            await this.cob.update(itm.IdOwner, { txid: itm.txid }, { ...persist, ...itm.data, valor, revisao: curr.revisao + 1 });
        }

        return await this._readCob({ IdOwner: itm.IdOwner, txid: itm.txid });
    }

    async editCob(itm: PixRequest<CobPatchRequest>): Promise<CobPatchResponse> {
        return (await this._editCob(itm, TipoCob.imediato)) as CobPatchResponse;
    }

    async editCobV(itm: PixRequest<CobVPatchRequest>): Promise<CobVPatchResponse> {
        return (await this._editCob(itm, TipoCob.vencimento)) as CobVPatchResponse;
    }

    /** Remoção pelo PSP recebedor (status REMOVIDA_PELO_PSP). Não exposto via API, conforme a spec. */
    async removeCobPeloPSP(key: PixKey) {
        const curr = await this._readCob(key);
        if (!curr) { return null; }
        if (curr.status !== Situacao.Ativa) {
            throw new PixError(`A cobrança não pode ser removida pois está com status ${curr.status}.`);
        }
        await this.cob.patch(key.IdOwner, { txid: key.txid }, { status: Situacao.RemovidaPSP });
        return await this._readCob(key);
    }

    async _removeCob(key: PixID & { IdOwner: string }): Promise<boolean> {
        await this.loccob.remove(key.IdOwner, { txid: key.txid });
        return await this.cob.remove(key.IdOwner, { txid: key.txid });
    }
    async removeCob(key: PixID & { IdOwner: string }): Promise<boolean> {
        return this._removeCob(key);
    }
    async removeCobV(key: PixID & { IdOwner: string }): Promise<boolean> {
        return this._removeCob(key);
    }

    // ---------------------------------------------------------------- COBR

    private async readRecOrFail(IdOwner: string, idRec: string, propriedade: string) {
        const rec = idRec ? await this.rec.read(IdOwner, { idRec }) : undefined;
        if (!rec) {
            throw new PixError('A recorrência informada não existe.', [{ propriedade, razao: `O campo ${propriedade} não corresponde a uma recorrência existente.` }]);
        }
        return rec;
    }

    async addCobR(itm: PixRequest<CobRPutRequest>) {
        const rec = await this.readRecOrFail(itm.IdOwner, itm.data.idRec, 'cobr.idRec');

        if ([StatusRec.Cancelada, StatusRec.Rejeitada, StatusRec.Expirada].includes(rec.status)) {
            throw new PixError(`A recorrência está com status ${rec.status}.`, [{ propriedade: 'cobr.idRec', razao: `A recorrência ${rec.idRec} não admite novas cobranças.` }]);
        }

        const criacao = now();
        const status = StatusCobR.Criada;
        const curr = {
            ...itm.data,
            txid: itm.txid,
            idRec: rec.idRec,
            valor: { original: itm.data.valor?.original || rec.valor?.valorRec },
            calendario: { ...itm.data.calendario, criacao },
            politicaRetentativa: rec.politicaRetentativa,
            status,
            atualizacao: [{ status, data: criacao }],
            tentativas: []
        };

        await this.cobR.add(itm.IdOwner, curr);
        return await this.readCobR({ IdOwner: itm.IdOwner, txid: itm.txid });
    }

    async readCobR(key: PixKey) {
        return await this.cobR.read(key.IdOwner, { txid: key.txid });
    }

    async listCobR(filter: CobRGetFilter & { IdOwner: string }) {
        const recs = await this.rec.list(filter.IdOwner);
        const documento = filter.cpf || filter.cnpj;

        const cobsr = (await this.cobR.list(filter.IdOwner)).filter((f: any) => {
            const devedor = f.devedor || recs.find((r: any) => r.idRec === f.idRec)?.vinculo?.devedor || {};
            return inPeriod(f.calendario?.criacao, filter.inicio, filter.fim)
                && (!filter.status || f.status === filter.status)
                && (!filter.idRec || f.idRec === filter.idRec)
                && (!documento || devedor.cpf === documento || devedor.cnpj === documento);
        });

        const { parametros, itens } = paginate(cobsr, filter);
        return { parametros, cobsr: itens };
    }

    async editCobR(itm: PixRequest<CobRPatchRequest>) {
        const curr = await this.readCobR(itm);
        if (!curr) { return null; }

        if (![StatusCobR.Criada, StatusCobR.Ativa].includes(curr.status)) {
            throw new PixError(`A cobrança recorrente não pode ser alterada pois está com status ${curr.status}.`, [{ propriedade: 'cobr.status', razao: `Somente cobranças com status ${StatusCobR.Criada} ou ${StatusCobR.Ativa} podem ser alteradas.` }]);
        }

        const { status, ...data } = itm.data;
        const patch: any = { ...data };
        if (data.calendario) {
            patch.calendario = { ...curr.calendario, ...data.calendario };
        }
        if (status) {
            patch.status = status;
            patch.atualizacao = [...(curr.atualizacao || []), { status, data: now() }];
            patch.tentativas = (curr.tentativas || []).map((t: any) => [StatusTentativa.Solicitada, StatusTentativa.Agendada].includes(t.status)
                ? { ...t, status: StatusTentativa.Cancelada, atualizacao: [...t.atualizacao, { status: StatusTentativa.Cancelada, data: now() }] }
                : t);
        }

        await this.cobR.patch(itm.IdOwner, { txid: itm.txid }, patch);
        return await this.readCobR(itm);
    }

    async addRetentativaCobR(key: PixKey & { data: string }) {
        const curr = await this.readCobR(key);
        if (!curr) { return null; }

        if (curr.politicaRetentativa !== PoliticaRetentativa.Permite) {
            throw new PixError('A recorrência não permite retentativas.', [{ propriedade: 'cobr.politicaRetentativa', razao: `A política de retentativa da recorrência é ${curr.politicaRetentativa}.` }]);
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(key.data || '') || isNaN(new Date(key.data).valueOf())) {
            throw new PixError('A data da retentativa não respeita o schema.', [{ propriedade: 'data', razao: 'O parâmetro data deve estar no formato AAAA-MM-DD.' }]);
        }

        if (key.data < now().substring(0, 10)) {
            throw new PixError('A data da retentativa é anterior à data atual.', [{ propriedade: 'data', razao: 'O parâmetro data não pode estar no passado.' }]);
        }

        if ([StatusCobR.Cancelada, StatusCobR.Concluida, StatusCobR.Expirada].includes(curr.status)) {
            throw new PixError(`A cobrança recorrente está com status ${curr.status}.`, [{ propriedade: 'cobr.status', razao: 'Não é possível solicitar retentativa para esta cobrança.' }]);
        }

        const vencimento = curr.calendario?.dataDeVencimento?.substring(0, 10);
        if (vencimento) {
            const limite = new Date(new Date(vencimento).valueOf() + 7 * 86400000).toJSON().substring(0, 10);
            if (key.data > limite) {
                throw new PixError('A data da retentativa excede o prazo da política de retentativa.', [{ propriedade: 'data', razao: `A política PERMITE_3R_7D admite retentativas até ${limite} (7 dias após o vencimento).` }]);
            }
        }

        const tentativas = curr.tentativas || [];
        if (tentativas.filter((t: any) => t.tipo === TipoTentativa.RetentativaIntradia).length >= 3) {
            throw new PixError('Número máximo de retentativas atingido.', [{ propriedade: 'data', razao: 'A política PERMITE_3R_7D admite no máximo 3 retentativas.' }]);
        }

        const data = now();
        const tentativa = {
            dataLiquidacao: key.data,
            tipo: TipoTentativa.RetentativaIntradia,
            status: StatusTentativa.Solicitada,
            endToEndId: genEndToEndId(this.ispb(key.IdOwner)),
            atualizacao: [{ status: StatusTentativa.Solicitada, data }]
        };

        await this.cobR.patch(key.IdOwner, { txid: key.txid }, { tentativas: [...tentativas, tentativa] });
        return await this.readCobR(key);
    }

    // ---------------------------------------------------------------- LOCATION

    async readLoc({ IdOwner, id }: LocID & { IdOwner: string }): Promise<LocGetResponse> {
        const itm: any = await this.locations.read(IdOwner, { id });
        if (itm) {
            const lc = await this.loccob.read(IdOwner, { id })
            return { ...itm, ...(lc?.txid ? { txid: lc?.txid } : {}), location: buildLocation(itm.uuid) }
        }
    }

    async listLoc(filter: LocGetFilter & { IdOwner: string }) {
        //Carrega Locations e correlação entre Location e Cob(x)
        const ls = await Promise.all([
            this.locations.list(filter.IdOwner),
            this.loccob.list(filter.IdOwner)
        ]).then(([_locs, _cobs]) => {

            if (filter.tipoCob !== undefined) {
                _locs = _locs.filter((f: LocGetResponse) => f.tipoCob === filter.tipoCob);
            }

            //Left Join Loc x LocCob
            return _locs.map(m => {
                const _cob = _cobs.find(f => f.id === m.id);
                return _cob ? { ...m, txid: _cob.txid, location: buildLocation(m.uuid) } : m;
            })
        });

        let loc = ls.filter((f: any) => {
            const [criacao, inicio, fim] = [new Date(f.criacao), new Date(filter.inicio), new Date(filter.fim)]
            return criacao >= inicio && criacao <= fim
        })

        if (filter.txIdPresente !== undefined) {

            loc = loc.filter((f: LocGetResponse & { cob: any }) => {
                const res = (!!f.txid && !!filter.txIdPresente) || (!f.txid && !filter.txIdPresente)
                return res;
            });
        }

        const { parametros, itens } = paginate(loc, filter);
        return { parametros, loc: itens }
    }

    async readLocUUID(IdOwner: string, uuid: string): Promise<LocGetResponse> {
        const itm: any = await this.locations.read(IdOwner, { uuid });
        if (itm) {
            const lc = await this.loccob.read(IdOwner, { id: itm.id })
            return { ...itm, txid: lc?.txid, location: buildLocation(itm.uuid) }
        }
    }

    async addLoc({ tipoCob, IdOwner }: LocPutRequest & { IdOwner: string }): Promise<LocPutResponse> {
        await (() => new Promise<void>(res => setTimeout(() => res(), 100)))(); //delay -- WORKAROUND PRA EVITAR COLISÃO DE ID DURANTE OS TESTES
        const id = + new Date();
        const itm = { id, tipoCob, uuid: randomUUID().replace(/\-/g, ''), criacao: now() };
        await this.locations.add(IdOwner, itm)
        return await this.readLoc({ IdOwner, id });
    }

    async removeLoc({ id, IdOwner }: LocID & { IdOwner: string }): Promise<boolean> {
        return await this.loccob.remove(IdOwner, { id });
    }

    // ---------------------------------------------------------------- PAYLOAD LOCATION (público)

    private async resolveLocation(uuid: string) {
        const found = await this.locations.findAny({ uuid });
        if (!found) { return undefined; }
        const IdOwner = found.clusterKey;
        const lc = await this.loccob.read(IdOwner, { id: found.data.id });
        const cob = lc ? await this._readCob({ IdOwner, txid: lc.txid }) : undefined;
        return { IdOwner, loc: found.data, cob };
    }

    /** Payload JSON da cobrança (na spec é entregue como JWS em GET /{pixUrlAccessToken}). */
    async readPayloadLocation(uuid: string) {
        const res = await this.resolveLocation(uuid);
        if (!res?.cob || res.cob.status !== Situacao.Ativa) { return undefined; }

        const { cob } = res;
        const { loc, location, pixCopiaECola, criacao, pix, ...payload } = cob as any;
        return {
            ...payload,
            calendario: { ...cob.calendario, criacao, apresentacao: now() }
        };
    }

    /** BR Code (EMV) correspondente à location. */
    async readBRCode(uuid: string) {
        const res = await this.resolveLocation(uuid);
        if (!res) { return undefined; }
        const location = buildLocation(uuid);
        const correntista = res.cob ? await this.correntistas.read("DEV", { chave: res.cob.chave }) : undefined;
        return {
            location,
            txid: res.cob?.txid,
            tipoCob: res.loc.tipoCob,
            status: res.cob?.status,
            pixCopiaECola: this.buildPixCopiaECola(location, correntista || {})
        };
    }

    // ---------------------------------------------------------------- REC

    async addRec(mdl: RecRequest<RecPostRequest>) {
        const ispb = this.ispb(mdl.IdOwner);
        const data = now();
        const status = StatusRec.Criada;
        const idRec = `R${mdl.data.politicaRetentativa === PoliticaRetentativa.NaoPermite ? 'N' : 'R'}${ispb}${data.replace(/\D/g, '').substring(0, 8)}${randomAlnum(11)}`;

        const itm = { ...mdl.data, idRec, status, atualizacao: [{ status, data }] };
        return await this.rec.add(mdl.IdOwner, itm);
    }

    async readRec({ IdOwner, idRec }: { IdOwner: string, idRec: string }) {
        return await this.rec.read(IdOwner, { idRec });
    }

    async listRec(filter: RecGetFilter & { IdOwner: string }) {
        const documento = filter.cpf || filter.cnpj;
        const recs = (await this.rec.list(filter.IdOwner)).filter((f: any) =>
            inPeriod(f.atualizacao?.[0]?.data, filter.inicio, filter.fim)
            && (!filter.status || f.status === filter.status)
            && (!documento || f.vinculo?.devedor?.cpf === documento || f.vinculo?.devedor?.cnpj === documento)
            && (!filter.convenio || f.convenio === filter.convenio)
        );

        const { parametros, itens } = paginate(recs, filter);
        return { parametros, recs: itens };
    }

    async editRec({ IdOwner, idRec, data }: { IdOwner: string, idRec: string, data: RecPatchRequest }) {
        const curr = await this.readRec({ IdOwner, idRec });
        if (!curr) { return null; }

        if ([StatusRec.Cancelada, StatusRec.Rejeitada, StatusRec.Expirada].includes(curr.status)) {
            throw new PixError(`A recorrência não pode ser alterada pois está com status ${curr.status}.`, [{ propriedade: 'rec.status', razao: `A recorrência está com status ${curr.status}.` }]);
        }

        const patch: any = {};
        if (data.vinculo?.devedor?.nome) {
            patch.vinculo = { ...curr.vinculo, devedor: { ...curr.vinculo.devedor, nome: data.vinculo.devedor.nome } };
        }
        if (data.calendario?.dataInicial) {
            patch.calendario = { ...curr.calendario, dataInicial: data.calendario.dataInicial };
        }
        if (data.ativacao?.dadosJornada?.txid) {
            patch.ativacao = { ...curr.ativacao, dadosJornada: { ...curr.ativacao?.dadosJornada, txid: data.ativacao.dadosJornada.txid } };
        }
        if (data.status) {
            patch.status = data.status;
            patch.atualizacao = [...(curr.atualizacao || []), { status: data.status, data: now() }];
            patch.encerramento = { cancelamento: { solicitante: 'USUARIO_RECEBEDOR', codigo: 'ACCL', descricao: 'Recorrência cancelada pelo usuário recebedor.' } };
        }

        await this.rec.patch(IdOwner, { idRec }, patch);
        return await this.readRec({ IdOwner, idRec });
    }

    // ---------------------------------------------------------------- SOLICREC

    async addSolicRec(IdOwner: string, data: SolicRecPostRequest) {
        const rec = await this.readRecOrFail(IdOwner, data.idRec, 'solicrec.idRec');
        if (rec.status !== StatusRec.Criada) {
            throw new PixError(`A recorrência está com status ${rec.status}.`, [{ propriedade: 'solicrec.idRec', razao: `Somente recorrências com status ${StatusRec.Criada} admitem solicitação de confirmação.` }]);
        }

        const criacao = now();
        const status = StatusSolicRec.Criada;
        const itm = {
            idSolicRec: `SC${this.ispb(IdOwner)}${criacao.replace(/\D/g, '').substring(0, 8)}${randomAlnum(11)}`,
            idRec: rec.idRec,
            calendario: data.calendario,
            destinatario: data.destinatario,
            status,
            atualizacao: [{ status, data: criacao }],
            recPayload: rec
        };
        return await this.solicRec.add(IdOwner, itm);
    }

    async readSolicRec(IdOwner: string, idSolicRec: string) {
        return await this.solicRec.read(IdOwner, { idSolicRec });
    }

    async editSolicRec(IdOwner: string, idSolicRec: string, data: SolicRecPatchRequest) {
        const curr = await this.readSolicRec(IdOwner, idSolicRec);
        if (!curr) { return null; }

        if (![StatusSolicRec.Criada, StatusSolicRec.Enviada, StatusSolicRec.Recebida].includes(curr.status)) {
            throw new PixError(`A solicitação não pode ser cancelada pois está com status ${curr.status}.`, [{ propriedade: 'solicrec.status', razao: `A solicitação está com status ${curr.status}.` }]);
        }

        await this.solicRec.patch(IdOwner, { idSolicRec }, {
            status: data.status,
            atualizacao: [...curr.atualizacao, { status: data.status, data: now() }]
        });
        return await this.readSolicRec(IdOwner, idSolicRec);
    }

    // ---------------------------------------------------------------- PIX

    /** Simula a liquidação de uma cobrança (ATIVA -> CONCLUIDA), gerando o Pix recebido. Exclusivo do mock. */
    async simularPagamento(key: PixKey, body: SimularPagamentoRequest = {}) {
        const cob: any = await this._readCob(key);
        if (!cob) { return null; }

        if (cob.status !== Situacao.Ativa) {
            throw new PixError(`A cobrança não pode ser paga pois está com status ${cob.status}.`, [{ propriedade: 'status', razao: `Somente cobranças com status ${Situacao.Ativa} podem ser pagas.` }]);
        }

        const retirada: RetiradaPix = cob.valor.retirada || {};
        const tipoRetirada = retirada.saque ? 'saque' : retirada.troco ? 'troco' : undefined;
        const editavel = cob.valor.modalidadeAlteracao == ModalidadeAlteracao.Editavel
            || (tipoRetirada && retirada[tipoRetirada].modalidadeAlteracao == ModalidadeAlteracao.Editavel);

        const componentesValor: IPix['componentesValor'] = { original: { valor: cob.valor.original } };
        if (tipoRetirada) {
            const { valor, modalidadeAgente, prestadorDoServicoDeSaque } = retirada[tipoRetirada];
            componentesValor[tipoRetirada] = { valor, modalidadeAgente, prestadorDoServicoDeSaque };
        }

        if (body.valor) {
            if (editavel) {
                const parcela = tipoRetirada || 'original';
                const outros = Object.keys(componentesValor).filter(k => k !== parcela).reduce((s, k) => s + toNumber(componentesValor[k].valor), 0);
                componentesValor[parcela].valor = (toNumber(body.valor) - outros).toFixed(2);
                if (toNumber(componentesValor[parcela].valor) < 0) {
                    throw new PixError('O valor pago é inferior ao valor mínimo da cobrança.', [{ propriedade: 'valor', razao: 'O valor pago é inválido.' }]);
                }
            }
        }

        const total = Object.values(componentesValor).reduce((s, c) => s + toNumber(c.valor), 0).toFixed(2);
        if (body.valor && toNumber(body.valor).toFixed(2) !== total) {
            throw new PixError('O valor pago diverge do valor da cobrança.', [{ propriedade: 'valor', razao: `O valor da cobrança é ${total} e não pode ser alterado pelo pagador.` }]);
        }

        const devedor = body.pagador || cob.devedor;
        const pix: IPix = {
            endToEndId: genEndToEndId(this.ispb(key.IdOwner)),
            txid: cob.txid,
            valor: total,
            componentesValor,
            chave: cob.chave,
            horario: now(),
            ...(body.infoPagador ? { infoPagador: body.infoPagador } : {}),
            ...(devedor ? { pagador: { nome: devedor.nome, ...(devedor.cpf ? { cpf: devedor.cpf } : {}), ...(devedor.cnpj ? { cnpj: devedor.cnpj } : {}) } } : {}),
            devolucoes: []
        };

        await this.pix.add(key.IdOwner, pix);
        await this.cob.patch(key.IdOwner, { txid: key.txid }, { status: Situacao.Concluida });

        this.notificarWebhook(key.IdOwner, pix);

        return pix;
    }

    /** Notifica (fire-and-forget) o webhook cadastrado para a chave, no padrão `${webhookUrl}/pix`. */
    private notificarWebhook(IdOwner: string, pix: IPix) {
        this.webhooks.read(IdOwner, { chave: pix.chave }).then(async (wh: IWebhook) => {
            if (!wh) { return; }
            const url = `${wh.webhookUrl.replace(/\/$/, '')}/pix`;
            await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pix: [pix] }) });
        }).catch((err) => console.warn(`Falha ao notificar webhook da chave ${pix.chave}: ${err?.message}`));
    }

    async readPix(IdOwner: string, endToEndId: string): Promise<IPix> {
        return await this.pix.read(IdOwner, { endToEndId });
    }

    async listPix(filter: PixGetFilter & { IdOwner: string }) {
        const documento = filter.cpf || filter.cnpj;
        const pix = (await this.pix.list(filter.IdOwner)).filter((f: IPix) =>
            inPeriod(f.horario, filter.inicio, filter.fim)
            && (!filter.txid || f.txid === filter.txid)
            && (filter.txIdPresente === undefined || !!f.txid === isTrue(filter.txIdPresente))
            && (filter.devolucaoPresente === undefined || (f.devolucoes.length > 0) === isTrue(filter.devolucaoPresente))
            && (!documento || f.pagador?.cpf === documento || f.pagador?.cnpj === documento)
        );

        const { parametros, itens } = paginate(pix, filter);
        return { parametros, pix: itens };
    }

    async addDevolucao(IdOwner: string, endToEndId: string, id: string, data: DevolucaoPutRequest): Promise<IDevolucao> {
        const pix = await this.readPix(IdOwner, endToEndId);
        if (!pix) { return null; }

        const fail = (propriedade: string, razao: string) => { throw new PixError(razao, [{ propriedade, razao }]); };

        if (!/^[a-zA-Z0-9]{1,35}$/.test(id)) { fail('id', 'O parâmetro id não respeita o schema.'); }
        if (pix.devolucoes.some(d => d.id === id)) { fail('id', `Já existe uma devolução com o id ${id} para este Pix.`); }

        const natureza = data.natureza || NaturezaDevolucao.Original;
        const valor = toNumber(data.valor);
        if (!(valor > 0)) { fail('valor', 'O campo valor deve ser maior que zero.'); }

        const comp = pix.componentesValor;
        const limite = natureza === NaturezaDevolucao.Retirada
            ? toNumber((comp.saque || comp.troco)?.valor)
            : (comp.saque ? 0 : toNumber(comp.original?.valor));

        if (natureza === NaturezaDevolucao.Retirada && !(comp.saque || comp.troco)) {
            fail('natureza', 'A natureza RETIRADA só é permitida para Pix Saque ou Pix Troco.');
        }

        const devolvido = pix.devolucoes
            .filter(d => d.natureza === natureza && d.status !== StatusDevolucao.NaoRealizado)
            .reduce((s, d) => s + toNumber(d.valor), 0);

        if (devolvido + valor > limite + 0.0001) {
            fail('valor', `O valor solicitado excede o valor disponível para devolução (${(limite - devolvido).toFixed(2)}).`);
        }

        const horario = now();
        const devolucao: IDevolucao = {
            id,
            rtrId: genEndToEndId(this.ispb(IdOwner), 'D'),
            valor: valor.toFixed(2),
            natureza,
            ...(data.descricao ? { descricao: data.descricao } : {}),
            horario: { solicitacao: horario, liquidacao: horario },
            status: StatusDevolucao.Devolvido
        };

        await this.pix.patch(IdOwner, { endToEndId }, { devolucoes: [...pix.devolucoes, devolucao] });
        return devolucao;
    }

    async readDevolucao(IdOwner: string, endToEndId: string, id: string): Promise<IDevolucao> {
        const pix = await this.readPix(IdOwner, endToEndId);
        return pix?.devolucoes.find(d => d.id === id);
    }

    // ---------------------------------------------------------------- WEBHOOK

    async putWebhook(IdOwner: string, chave: string, webhookUrl: string): Promise<IWebhook> {
        const correntista = await this.correntistas.read("DEV", { chave });
        if (!correntista) {
            throw new PixError('A chave informada não pertence a este usuário recebedor.', [{ propriedade: 'chave', razao: 'A chave não corresponde a uma conta deste usuário recebedor.' }]);
        }

        const itm: IWebhook = { webhookUrl, chave, criacao: now() };
        const curr = await this.webhooks.read(IdOwner, { chave });
        if (curr) {
            await this.webhooks.update(IdOwner, { chave }, { ...itm, criacao: curr.criacao });
        }
        else {
            await this.webhooks.add(IdOwner, itm);
        }
        return await this.readWebhook(IdOwner, chave);
    }

    async readWebhook(IdOwner: string, chave: string): Promise<IWebhook> {
        return await this.webhooks.read(IdOwner, { chave });
    }

    async listWebhook(filter: WebhookGetFilter & { IdOwner: string }) {
        const webhooks = (await this.webhooks.list(filter.IdOwner)).filter((f: IWebhook) => inPeriod(f.criacao, filter.inicio, filter.fim));
        const { parametros, itens } = paginate(webhooks, filter);
        return { parametros, webhooks: itens };
    }

    async removeWebhook(IdOwner: string, chave: string): Promise<boolean> {
        const curr = await this.webhooks.read(IdOwner, { chave });
        if (!curr) { return false; }
        return await this.webhooks.remove(IdOwner, { chave });
    }

    // ---------------------------------------------------------------- LOTECOBV

    private problemaLote(detail: string, violacoes: { razao: string, propriedade: string }[] = []) {
        return { type: 'https://pix.bcb.gov.br/api/v2/error/CobVOperacaoInvalida', title: 'Cobrança inválida.', status: 400, detail, violacoes };
    }

    private async processarCobVLote(IdOwner: string, cobv: { txid: string, [campo: string]: any }, editar: boolean) {
        const { txid, ...data } = cobv || ({} as any);
        const criacao = now();

        if (!txid || !/^[a-zA-Z0-9]{26,35}$/.test(txid)) {
            return { txid, status: StatusCobVLote.Negada, criacao, problema: this.problemaLote('O campo cobsv.txid não respeita o schema.', [{ propriedade: 'cobv.txid', razao: 'O campo cobv.txid não respeita o schema.' }]) };
        }

        const errors = await validate(plainToInstance((editar ? CobVPatchRequest : CobVPutRequest) as typeof CobVPutRequest, data), { skipMissingProperties: true });
        if (errors.length) {
            const msgs = errorFormatter(errors);
            const violacoes = Object.keys(msgs).map(k => ({ propriedade: `cobv.${k}`, razao: msgs[k].replace('$$', `cobv.${k}`) }));
            return { txid, status: StatusCobVLote.Negada, criacao, problema: this.problemaLote('A cobrança não respeita o schema.', violacoes) };
        }

        try {
            const res = editar
                ? await this.editCobV({ IdOwner, txid, data })
                : await this.addCobV({ IdOwner, txid, data: data as CobVPutRequest });
            if (!res) { throw new Error('Cobrança não encontrada.'); }
            return { txid, status: StatusCobVLote.Criada, criacao };
        }
        catch (ex) {
            return { txid, status: StatusCobVLote.Negada, criacao, problema: this.problemaLote(ex.message, ex.violacoes || []) };
        }
    }

    async putLoteCobV(IdOwner: string, id: string | number, data: LoteCobVRequest): Promise<ILoteCobV> {
        const loteId = /^\d+$/.test(`${id}`) ? Number(id) : id;
        if (await this.loteCobV.read(IdOwner, { id: loteId })) {
            throw new PixError('Já existe um lote com o id informado.', [{ propriedade: 'id', razao: `O lote ${id} já existe.` }]);
        }

        const txids = data.cobsv.map(c => c?.txid);
        if (new Set(txids).size !== txids.length) {
            throw new PixError('O lote contém txids duplicados.', [{ propriedade: 'lotecobv.cobsv', razao: 'Cada cobrança do lote deve possuir um txid distinto.' }]);
        }

        const cobsv = [];
        for (const cobv of data.cobsv) {
            cobsv.push(await this.processarCobVLote(IdOwner, cobv, false));
        }

        const lote: ILoteCobV = { id: loteId, descricao: data.descricao, criacao: now(), cobsv };
        await this.loteCobV.add(IdOwner, lote);
        return lote;
    }

    async addLoteCobV(IdOwner: string, data: LoteCobVRequest): Promise<ILoteCobV> {
        await new Promise<void>(res => setTimeout(() => res(), 2));
        return await this.putLoteCobV(IdOwner, + new Date(), data);
    }

    async editLoteCobV(IdOwner: string, id: string | number, data: LoteCobVPatchRequest): Promise<ILoteCobV> {
        const lote: ILoteCobV = await this.readLoteCobV(IdOwner, id);
        if (!lote) { return null; }

        const cobsv = [...lote.cobsv];
        const fora = (data.cobsv || []).find(cobv => !cobsv.some(c => c.txid === cobv?.txid));
        if (fora) {
            throw new PixError(`A cobrança ${fora?.txid} não pertence ao lote.`, [{ propriedade: 'lotecobv.cobsv.txid', razao: 'Somente cobranças do lote podem ser alteradas.' }]);
        }

        for (const cobv of data.cobsv || []) {
            const idx = cobsv.findIndex(c => c.txid === cobv?.txid);
            const editar = cobsv[idx].status === StatusCobVLote.Criada;
            cobsv[idx] = await this.processarCobVLote(IdOwner, cobv, editar);
        }

        await this.loteCobV.patch(IdOwner, { id: lote.id }, { cobsv, ...(data.descricao ? { descricao: data.descricao } : {}) });
        return await this.readLoteCobV(IdOwner, lote.id);
    }

    async readLoteCobV(IdOwner: string, id: string | number): Promise<ILoteCobV> {
        const loteId = /^\d+$/.test(`${id}`) ? Number(id) : id;
        return await this.loteCobV.read(IdOwner, { id: loteId });
    }

    async listLoteCobV(filter: LoteCobVGetFilter & { IdOwner: string }) {
        const lotes = (await this.loteCobV.list(filter.IdOwner)).filter((f: ILoteCobV) => inPeriod(f.criacao, filter.inicio, filter.fim));
        const { parametros, itens } = paginate(lotes, filter);
        return { parametros, lotes: itens };
    }
}
