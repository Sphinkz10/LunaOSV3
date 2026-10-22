import { codigoValido, normalizarCodigo } from '../api/solo';

describe('ligar a um treinador (C-27)', () => {
  it('aceita o código escrito de várias formas', () => {
    expect(normalizarCodigo('tr 4821')).toBe('TR-4821');
    expect(normalizarCodigo('TR·4821')).toBe('TR-4821');
    expect(codigoValido('tr-4821')).toBe(true);
    expect(codigoValido('TR-48')).toBe(false);
  });
});
