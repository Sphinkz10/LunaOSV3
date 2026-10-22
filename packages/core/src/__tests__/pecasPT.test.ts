import { estadoDocumento, icsDeMarcacao, validadePorOmissao } from '../api/pecasPT';

describe('peças do PT (T29A)', () => {
  it('documento: válido, a expirar nos 30 dias e expirado', () => {
    expect(estadoDocumento(null, '2026-10-22')).toBe('valid');
    expect(estadoDocumento('2026-11-10', '2026-10-22')).toBe('expiring');
    expect(estadoDocumento('2027-01-10', '2026-10-22')).toBe('valid');
    expect(estadoDocumento('2026-10-21', '2026-10-22')).toBe('expired');
  });

  it('o atestado vale 12 meses por omissão; o termo não expira', () => {
    expect(validadePorOmissao('atestado', '2026-10-22')).toBe('2027-10-22');
    expect(validadePorOmissao('termo', '2026-10-22')).toBeNull();
  });

  it('o .ics da marcação traz início, fim, local escapado e aviso 2 h antes', () => {
    const ics = icsDeMarcacao({ id: 'b1', inicio: '2026-10-23T17:00:00.000Z', fim: '2026-10-23T18:00:00.000Z', titulo: 'Sessão com Rui', local: 'Parque, Porto' });
    expect(ics).toContain('DTSTART:20261023T170000Z');
    expect(ics).toContain('DTEND:20261023T180000Z');
    expect(ics).toContain('LOCATION:Parque\\, Porto');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
