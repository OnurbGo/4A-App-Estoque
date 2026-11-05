import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { apagarFoto, fotoExiste, guardarFoto, tirarFoto } from '@/services/fotos';

const mockCriarPasta = jest.fn();
const mockMover = jest.fn(async () => undefined);
const mockApagar = jest.fn();
let mockExiste = true;

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documentos', cache: 'file:///cache' },
  Directory: class {
    uri: string;
    create = mockCriarPasta;
    constructor(base: string, nome: string) {
      this.uri = `${base}/${nome}`;
    }
  },
  File: class {
    uri: string;
    move = mockMover;
    delete = mockApagar;
    get exists() {
      return mockExiste;
    }
    constructor(base: string | { uri: string }, nome?: string) {
      const raiz = typeof base === 'string' ? base : base.uri;
      this.uri = nome ? `${raiz}/${nome}` : raiz;
    }
  },
}));

const mockResize = jest.fn();
const mockSalvar = jest.fn(async () => ({ uri: 'file:///cache/comprimida.jpg' }));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: mockResize,
      renderAsync: async () => ({ saveAsync: mockSalvar }),
    })),
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const picker = jest.mocked(ImagePicker);

beforeEach(() => {
  jest.clearAllMocks();
  mockExiste = true;
});

describe('tirarFoto', () => {
  it('abre a câmera e devolve a foto', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/foto.jpg', width: 4000, height: 3000 }],
    } as never);

    await expect(tirarFoto()).resolves.toEqual({
      uri: 'file:///cache/foto.jpg',
      largura: 4000,
      altura: 3000,
    });
  });

  it('sem permissão, nem abre a câmera', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never);

    await expect(tirarFoto()).resolves.toBeNull();
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('desistir não é erro', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null } as never);

    await expect(tirarFoto()).resolves.toBeNull();
  });
});

describe('guardarFoto', () => {
  const grande = { uri: 'file:///cache/foto.jpg', largura: 4000, altura: 3000 };

  it('reduz o lado maior para 1600 px e salva em JPEG 70%', async () => {
    await guardarFoto(grande, 'foto-1');

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///cache/foto.jpg');
    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
    expect(mockSalvar).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7 });
  });

  it('foto pequena não é ampliada', async () => {
    await guardarFoto({ ...grande, largura: 800, altura: 600 }, 'foto-1');

    expect(mockResize).not.toHaveBeenCalled();
  });

  it('guarda nos documentos do app, que o Android não limpa', async () => {
    const caminho = await guardarFoto(grande, 'foto-1');

    expect(caminho).toBe('file:///documentos/anexos/foto-1.jpg');
    expect(mockCriarPasta).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
    expect(mockMover).toHaveBeenCalledTimes(1);
  });
});

describe('guardarFoto e o arquivo no disco', () => {
  const grande = { uri: 'file:///cache/foto.jpg', largura: 4000, altura: 3000 };

  it('só devolve o caminho depois de a foto estar guardada', async () => {
    let terminar = () => undefined as void;
    mockMover.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolver) => {
          terminar = () => resolver(undefined);
        }),
    );
    let devolveu = false;

    const guardando = guardarFoto(grande, 'foto-1').then(() => {
      devolveu = true;
    });
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(mockMover).toHaveBeenCalledTimes(1);
    expect(devolveu).toBe(false);

    terminar();
    await guardando;
    expect(devolveu).toBe(true);
  });

  it('avisa quem chamou se não conseguir mover', async () => {
    mockMover.mockRejectedValueOnce(new Error('Sem espaço'));

    await expect(guardarFoto(grande, 'foto-1')).rejects.toThrow('Sem espaço');
  });
});

describe('fotoExiste e apagarFoto', () => {
  it('diz se o arquivo está lá', () => {
    mockExiste = false;

    expect(fotoExiste('file:///x.jpg')).toBe(false);
  });

  it('apaga o arquivo', () => {
    apagarFoto('file:///x.jpg');

    expect(mockApagar).toHaveBeenCalledTimes(1);
  });

  it('apagar o que já não existe não é erro', () => {
    mockExiste = false;

    apagarFoto('file:///x.jpg');

    expect(mockApagar).not.toHaveBeenCalled();
  });
});
