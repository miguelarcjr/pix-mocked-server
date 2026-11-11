export interface IViolacao { razao: string, propriedade: string }

export class PixError extends Error {
    constructor(message: string, public readonly violacoes: IViolacao[] = []) {
        super(message);
    }
}
